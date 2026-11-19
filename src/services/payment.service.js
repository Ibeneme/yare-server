const LessonFee = require("../models/LessonFee");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const Transaction = require("../models/Transaction");
const sendEmail = require("./mail.service");
const { markRedeemed } = require("./perks.service");
const subscriptionEmailTemplate = require("../templates/paymentEmail");

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
};

/**
 * Marks a Paystack payment as fulfilled. Safe to call more than once
 * (webhook and browser callback both end up here), so it is idempotent.
 * `paymentData` must come from Paystack (webhook body verified by signature,
 * or a server-side /transaction/verify call), never from the client.
 */
const fulfillPayment = async (reference, paymentData, verifiedBy) => {
  const tx = await Transaction.findOne({ reference });

  if (paymentData.status !== "success") {
    if (tx && tx.status === "pending") {
      tx.status = paymentData.status === "abandoned" ? "abandoned" : "failed";
      tx.gatewayResponse = paymentData;
      await tx.save();
    }
    return { fulfilled: false, status: paymentData.status };
  }

  // Guard against underpayment / currency swaps.
  if (tx) {
    const paidMajor = paymentData.amount / 100;
    if (paymentData.currency !== tx.currency || paidMajor + 0.001 < tx.amount) {
      tx.status = "failed";
      tx.gatewayResponse = { ...paymentData, mismatch: true };
      await tx.save();
      return { fulfilled: false, status: "amount_mismatch" };
    }
  }

  const records = await LessonFee.find({ reference });
  if (!records.length) return { fulfilled: false, status: "unknown_reference" };

  const alreadyDone = records.every((r) => r.paid?.isPaid);
  const paidAt = new Date(paymentData.paid_at || Date.now());

  if (!alreadyDone) {
    for (const record of records) {
      const expiresAt = addDays(paidAt, record.duration);
      record.paid = {
        isPaid: true,
        timestamp: paidAt,
        paymentMethod: paymentData.channel,
        paymentService: "paystack",
        details: paymentData,
      };
      record.expiresAt = expiresAt;
      record.expired = new Date() > expiresAt;
      await record.save();
      if (record.studentId) {
        await Student.findByIdAndUpdate(record.studentId, {
          isSubscribed: true,
          isPaid: true,
          lessonFeeId: record._id,
          subscriptionExpiredAt: null,
          expiryGraceEndsAt: null,
          feeReminderLastOn: "",
          feeReminderCount: 0,
          readOnlyNotified: false,
        });
      }
    }
  }

  if (tx && tx.status !== "success") {
    tx.status = "success";
    tx.channel = paymentData.channel;
    tx.paidAt = paidAt;
    tx.verifiedBy = verifiedBy;
    tx.gatewayResponse = paymentData;
    await tx.save();
    await markRedeemed(tx.appliedPerks); // a used discount cannot be applied twice
  }

  if (!alreadyDone && paymentData.customer?.email) {
    try {
      const html = subscriptionEmailTemplate({
        displayName: paymentData.customer.first_name || "Parent",
        updatedPayments: records,
        reference,
      });
      await sendEmail(paymentData.customer.email, "Subscription confirmed", html);
    } catch (err) {
      console.error("Payment email failed:", err.message);
    }
  }
  return { fulfilled: true, payments: records, status: "success" };
};

module.exports = { fulfillPayment, addDays };
