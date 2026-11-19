const crypto = require("crypto");
const mongoose = require("mongoose");
const Student = require("../models/Student");
const LessonFee = require("../models/LessonFee");
const Transaction = require("../models/Transaction");
const Pricing = require("../models/Pricing");
const paystack = require("../services/paystack.service");
const { applyDiscounts } = require("../services/perks.service");
const { quoteForStudents } = require("../services/pricing.service");
const { fulfillPayment } = require("../services/payment.service");
const { FRONTEND_URL } = require("../config/env");
const { CURRENCIES } = require("../config/constants");

/**
 * Resolve a specific Pricing document by pricingId, planId, or planKey.
 */
async function findPricingPlan({ pricingId, planId, planKey }) {
  const lookupId = pricingId || planId;

  if (lookupId && mongoose.Types.ObjectId.isValid(lookupId)) {
    const byId = await Pricing.findOne({
      _id: lookupId,
      kind: "subscription",
      isActive: { $ne: false },
    }).lean();
    if (byId) return byId;
  }

  const keyToMatch = planKey || lookupId;
  if (keyToMatch) {
    const byKey = await Pricing.findOne({
      planKey: String(keyToMatch),
      kind: "subscription",
      isActive: { $ne: false },
    }).lean();
    if (byKey) return byKey;
  }

  return null;
}

const initializePayment = async (req, res) => {
  try {
    const {
      email,
      studentDetails,
      planName,
      planId,
      pricingId,
      planKey,
      duration,
      totalAmount,
    } = req.body;
    const currency = String(req.body.currency || "NGN").toUpperCase();
    if (!CURRENCIES.includes(currency)) {
      return res.status(400).json({ error: "Unsupported currency. Use NGN or USD." });
    }
    if (!email || !Array.isArray(studentDetails) || !studentDetails.length) {
      return res.status(400).json({ error: "email and studentDetails are required." });
    }

    const parentId = req.user.userType === "parent" ? req.user.id : req.body.parentId;
    const studentIds = studentDetails.map((s) => s._id || s).filter(Boolean);

    // Parents may only pay for their own wards.
    if (req.user.userType === "parent") {
      const owned = await Student.countDocuments({ _id: { $in: studentIds }, parentId });
      if (owned !== studentIds.length) {
        return res.status(403).json({ error: "You can only pay for your own wards." });
      }
    }

    let amount;
    let items = [];
    let appliedPerks = [];
    let durationDays = Number(duration) || 30;
    let resolvedPlanName = planName || "Subscription";
    let resolvedPricingId = null;
    let resolvedPlanKey = planKey || null;

    // 1. Prefer explicitly selected Pricing plan (pricingId / planId / planKey)
    const selectedPlan = await findPricingPlan({ pricingId, planId, planKey });

    if (selectedPlan) {
      const unitPrice = Number(selectedPlan.prices?.[currency]);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
        return res.status(400).json({
          error: `Price is not configured for plan "${selectedPlan.name || selectedPlan.planKey}" in ${currency}.`,
        });
      }

      resolvedPricingId = selectedPlan._id;
      resolvedPlanKey = selectedPlan.planKey || null;
      resolvedPlanName = selectedPlan.name || planName || "Subscription";
      durationDays = Number(selectedPlan.durationDays) || durationDays;

      items = studentIds.map((studentId) => ({
        studentId,
        pricingId: selectedPlan._id,
        planKey: selectedPlan.planKey,
        name: selectedPlan.name || resolvedPlanName,
        durationDays,
        amount: unitPrice,
        currency,
      }));
      amount = unitPrice * studentIds.length;

      ({ amount, items, appliedPerks } = await applyDiscounts(studentIds, items, currency));
      if (amount <= 0) {
        return res.status(400).json({ error: "Nothing to pay. Use the free-month reward instead." });
      }
    } else {
      // 2. Fallback to quoteForStudents when no specific plan was passed
      const quote = await quoteForStudents(studentIds, currency);
      if (quote) {
        ({ amount, items } = quote);
        durationDays = quote.durationDays;
        if (quote.planName) resolvedPlanName = quote.planName;
        if (quote.pricingId) resolvedPricingId = quote.pricingId;
        if (quote.planKey) resolvedPlanKey = quote.planKey;

        // Award discounts (e.g. 50% off) are applied here, on the server, never trusted from the browser.
        ({ amount, items, appliedPerks } = await applyDiscounts(studentIds, items, currency));
        if (amount <= 0) {
          return res.status(400).json({ error: "Nothing to pay. Use the free-month reward instead." });
        }
      } else if (totalAmount > 0 && Number(totalAmount) > 0) {
        // Legacy fallback while admins are still setting up the Pricing table.
        amount = Number(totalAmount);
        console.warn("[payment] no Pricing rows matched; using client-supplied total");
      } else {
        return res.status(400).json({ error: "No price is configured for these wards yet." });
      }
    }

    const reference = `yare_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
    const init = await paystack.initialize({
      email,
      amount,
      currency,
      reference,
      callbackUrl: `${FRONTEND_URL}/verify-payments?trxref=${reference}`,
      metadata: {
        parentId,
        studentIds,
        pricingId: resolvedPricingId,
        planKey: resolvedPlanKey,
        planName: resolvedPlanName,
        durationDays,
      },
    });

    await Transaction.create({
      reference,
      parentId,
      payerEmail: email,
      studentIds,
      pricingId: resolvedPricingId,
      planKey: resolvedPlanKey,
      planName: resolvedPlanName,
      durationDays,
      items,
      appliedPerks,
      amount,
      currency,
    });

    const created = await Promise.all(
      studentIds.map((studentId) =>
        LessonFee.create({
          studentId,
          payerId: parentId,
          pricingId: resolvedPricingId,
          planKey: resolvedPlanKey,
          planName: resolvedPlanName,
          duration: String(durationDays),
          amount,
          currency,
          reference,
        })
      )
    );

    res.status(200).json({
      checkout_url: init.authorization_url,
      reference,
      amount,
      currency,
      planName: resolvedPlanName,
      planKey: resolvedPlanKey,
      pricingId: resolvedPricingId,
      durationDays,
      paymentIds: created.map((p) => p._id),
    });
  } catch (error) {
    const msg = error.response?.data?.message || "Payment initialization failed";
    console.error("[payment] init error:", msg);
    res.status(500).json({ error: msg });
  }
};

const verifyByReference = async (req, res) => {
  try {
    const { reference } = req.params;
    if (!reference) return res.status(400).json({ error: "Missing reference." });
    const data = await paystack.verify(reference);
    const result = await fulfillPayment(reference, data, "callback");
    if (!result.fulfilled) {
      return res.status(400).json({ success: false, message: "Payment not successful.", status: result.status });
    }
    return res.status(200).json({ success: true, message: "Payment verified.", payments: result.payments });
  } catch (error) {
    const msg = error?.response?.data?.message || "Verification failed";
    return res.status(500).json({ error: msg });
  }
};

/**
 * POST /api/payment/webhook/paystack
 * Needs the raw body (see app.js). Paystack retries on non-2xx, so we answer 200
 * once the signature is valid, even for events we ignore.
 */
const paystackWebhook = async (req, res) => {
  const signature = req.headers["x-paystack-signature"];
  if (!paystack.isValidWebhookSignature(req.rawBody, signature)) {
    return res.status(401).send("invalid signature");
  }
  const event = req.body;
  try {
    if (event.event === "charge.success" && event.data?.reference) {
      // Re-verify with Paystack so we trust their API, not just the POST body.
      const data = await paystack.verify(event.data.reference);
      await fulfillPayment(event.data.reference, data, "webhook");
    } else if (event.event === "charge.failed" && event.data?.reference) {
      await fulfillPayment(event.data.reference, { ...event.data, status: "failed" }, "webhook");
    }
    return res.sendStatus(200);
  } catch (err) {
    console.error("[webhook] processing error:", err.message);
    return res.sendStatus(500); // Paystack will retry
  }
};

module.exports = { initializePayment, verifyByReference, paystackWebhook };