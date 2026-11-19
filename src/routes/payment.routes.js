const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const LessonFee = require("../models/LessonFee");
const Student = require("../models/Student");
const Admin = require("../models/Admin");
const Parent = require("../models/Parent");
const Class = require("../models/Class");
const Pricing = require("../models/Pricing"); // <-- Pricing model
const authMiddleware = require("../middlewares/auth.middleware");
const paymentController = require("../controllers/payment.controller");

const log = (...args) => console.log("[payment]", ...args);

// ───── Middleware: Resolve Pricing Plan & Calculate Amount ─────
const resolveSubscriptionPricing = async (req, res, next) => {
  try {
    const {
      pricingId,
      planId,
      planKey,
      currency = "NGN",
      studentDetails = [],
    } = req.body || {};

    const normalizedCurrency = String(currency).toUpperCase();
    const lookupId = pricingId || planId;

    let plan = null;

    if (lookupId && mongoose.Types.ObjectId.isValid(lookupId)) {
      plan = await Pricing.findOne({
        _id: lookupId,
        kind: "subscription",
        isActive: { $ne: false },
      }).lean();
    }

    if (!plan && (planKey || lookupId)) {
      plan = await Pricing.findOne({
        planKey: String(planKey || lookupId),
        kind: "subscription",
        isActive: { $ne: false },
      }).lean();
    }

    // Fallback to default active subscription plan (e.g. "1-months") if none specified
    if (!plan) {
      plan =
        (await Pricing.findOne({
          planKey: "1-months",
          kind: "subscription",
          isActive: { $ne: false },
        }).lean()) ||
        (await Pricing.findOne({
          kind: "subscription",
          isActive: { $ne: false },
        }).lean());
    }

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Active subscription pricing plan not found.",
      });
    }

    const unitAmount = Number(plan.prices?.[normalizedCurrency]);
    if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: `Price is not configured for currency ${normalizedCurrency}.`,
      });
    }

    const studentCount =
      Array.isArray(studentDetails) && studentDetails.length > 0
        ? studentDetails.length
        : 1;
    const totalAmount = unitAmount * studentCount;

    req.resolvedPricing = {
      plan,
      pricingId: plan._id,
      planKey: plan.planKey,
      planName: plan.name,
      durationDays: plan.durationDays,
      currency: normalizedCurrency,
      unitAmount,
      studentCount,
      totalAmount,
    };

    // Also expose on req.body so existing controller logic can read it seamlessly
    req.body.pricingId = String(plan._id);
    req.body.planKey = plan.planKey;
    req.body.currency = normalizedCurrency;
    req.body.unitAmount = unitAmount;
    req.body.amount = totalAmount;

    log(
      "RESOLVED PRICING | Plan:",
      plan.planKey,
      "| Currency:",
      normalizedCurrency,
      "| Unit:",
      unitAmount,
      "| Students:",
      studentCount,
      "| Total:",
      totalAmount,
    );

    next();
  } catch (error) {
    log("Pricing Resolution Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to resolve subscription pricing.",
    });
  }
};

// ───── GET: Payment History ─────
router.get(
  "/lesson-fees/history/:payerId",
  authMiddleware,
  async (req, res) => {
    try {
      const { payerId } = req.params;
      if (
        req.user.userType !== "admin" &&
        String(req.user.id) !== String(payerId)
      ) {
        return res.status(403).json({ success: false, message: "Not allowed" });
      }
      log("FETCH PAYMENT HISTORY | Payer ID:", payerId);

      let lessonFees = [];

      const student = await Student.findById(payerId).lean();
      if (student) {
        lessonFees = await LessonFee.find({ payerId });
        log("Payer: STUDENT | Email:", student.email);
      } else {
        const admin = await Admin.findById(payerId).lean();
        if (admin) {
          lessonFees = await LessonFee.find({});
          log("Payer: ADMIN | Email:", admin.email);
        } else {
          const parent = await Parent.findById(payerId).lean();
          if (parent) {
            const children = await Student.find({ parentId: payerId }).lean();
            const childIds = children.map((c) => c._id);
            lessonFees = await LessonFee.find({ studentId: { $in: childIds } });
            log(
              "Payer: PARENT | Email:",
              parent.email,
              "| Children:",
              children.length,
            );
          } else {
            log("Payer NOT FOUND");
            return res
              .status(404)
              .json({ success: false, message: "Payer not found" });
          }
        }
      }

      log(`Found ${lessonFees.length} payment(s)`);

      const feesWithDetails = await Promise.all(
        lessonFees.map(async (fee) => {
          if (!mongoose.Types.ObjectId.isValid(fee.studentId)) {
            log("Invalid student ID:", fee._id);
            return { lessonFee: fee, student: null, classInfo: null };
          }

          const studentData = await Student.findById(fee.studentId).lean();
          if (!studentData)
            return { lessonFee: fee, student: null, classInfo: null };

          let classInfo = null;
          const courseId = studentData.courses?.[0];
          if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
            classInfo = await Class.findOne({ courseId }).lean();
          }

          return { lessonFee: fee, student: studentData, classInfo };
        }),
      );

      log("Response sent | Count:", feesWithDetails.length);
      res.status(200).json({ success: true, data: feesWithDetails });
    } catch (error) {
      log("History Error:", error.message);
      res.status(500).json({ success: false, message: "Server Error" });
    }
  },
);

// Start a Paystack checkout (parents only). Price comes from the Pricing table.
router.post(
  "/pay-lesson-fee",
  authMiddleware,
  authMiddleware.requireRoles("parent", "admin"),
  resolveSubscriptionPricing,
  paymentController.initializePayment,
);

// Browser callback after Paystack redirects back. Always re-verified with Paystack.
router.get(
  "/verify-lesson-fee/:reference",
  paymentController.verifyByReference,
);

module.exports = router;
