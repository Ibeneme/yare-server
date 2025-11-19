const express = require("express");
const axios = require("axios");
const router = express.Router();

const LessonFee = require("../models/LessonFee");
const Student = require("../models/Student");
const Admin = require("../models/Admin");
const Parent = require("../models/Parent");
const Class = require("../models/Class");
const { default: mongoose } = require("mongoose");

const sendEmail = require("../utils/mailer");
const subscriptionEmailTemplate = require("../templates/paymentEmail");

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY ||
  "sk_test_36fa1899b7cc4af2f3b86f3544c4ab99e9a80ea4";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// ───── UTILITY: Log with Time & Country ─────
const log = (...args) => {
  const now = new Date().toLocaleString("en-NG", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
  console.log(`[${now} | NG]`, ...args);
};

// ───── UTILITY: Add Duration to Date ─────
const addDurationToDate = (startDate, duration) => {
  if (!startDate || !duration) return null;
  const date = new Date(startDate);
  date.setDate(date.getDate() + parseInt(duration));
  return date;
};

// ───── GET: Payment History ─────
router.get("/lesson-fees/history/:payerId", async (req, res) => {
  try {
    const { payerId } = req.params;
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
            children.length
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
      })
    );

    log("Response sent | Count:", feesWithDetails.length);
    res.status(200).json({ success: true, data: feesWithDetails });
  } catch (error) {
    log("History Error:", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
});

// ───── POST: Initialize Payment ─────
router.post("/pay-lesson-fee", async (req, res) => {
  try {
    const { parentId, email, studentDetails, totalAmount, planName, duration } =
      req.body;

    log("INITIALIZE PAYMENT");
    log("Parent ID:", parentId);
    log("Email:", email);
    log("Students:", studentDetails?.length);
    log("Amount:", totalAmount, "NGN");
    log("Plan:", planName);
    log("Duration:", duration);

    if (
      !parentId ||
      !email ||
      !studentDetails?.length ||
      !totalAmount ||
      !planName ||
      !duration
    ) {
      log("Validation FAILED");
      return res.status(400).json({ error: "Missing required fields." });
    }

    const reference = `yare_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const callback_url = `${FRONTEND_URL}/verify-payments?trxref=${reference}`;

    log("Generated Reference:", reference);
    log("Callback URL:", callback_url);

    const payload = {
      email,
      amount: totalAmount * 100,
      currency: "NGN",
      reference,
      callback_url,
    };

    log("Paystack Init →", payload);
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      payload,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { authorization_url } = response.data.data;
    log("Paystack Checkout URL:", authorization_url);

    const createdPayments = await Promise.all(
      studentDetails.map((student) =>
        LessonFee.create({
          studentId: student._id,
          payerId: parentId,
          planName,
          duration,
          amount: totalAmount,
          reference,
        })
      )
    );

    log(`Created ${createdPayments.length} DB record(s)`);
    log("SUCCESS");

    res.status(200).json({
      checkout_url: authorization_url,
      reference,
      paymentIds: createdPayments.map((p) => p._id),
    });
  } catch (error) {
    const msg =
      error.response?.data?.message || "Payment initialization failed";
    log("Init Error:", msg);
    res.status(500).json({ error: msg });
  }
});

// ───── GET: Verify Payment ─────
router.get("/verify-lesson-fee/:reference", async (req, res) => {
  console.log("INSIDE GET /verify-lesson-fee/:reference");

  try {
    const { reference } = req.params;
    console.log("Reference:", reference);
    log("VERIFY PAYMENT | Ref:", reference);

    if (!reference) {
      return res.status(400).json({ error: "Missing reference." });
    }

    // ✅ VERIFY PAYMENT ON PAYSTACK
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const paymentData = response.data.data;
    console.log("Paystack payment status:", paymentData.status);

    if (paymentData.status !== "success") {
      return res.status(400).json({
        message: "Payment not successful.",
        success: false,
      });
    }

    // ✅ FIND LESSON FEE RECORDS
    const records = await LessonFee.find({ reference });
    console.log("Found", records.length, "record(s)");

    if (!records.length) {
      return res.status(404).json({ error: "Payment not found." });
    }

    // ✅ UPDATE RECORDS + STUDENT
    const updated = await Promise.all(
      records.map(async (record) => {
        console.log("Updating LessonFee:", record._id);

        const paidAt = new Date(paymentData.paid_at);
        const duration = record.duration;
        const expiresAt = addDurationToDate(paidAt, duration);
        const expired = new Date() > expiresAt;

        // 1️⃣ Update LessonFee
        const updatedRecord = await LessonFee.findByIdAndUpdate(
          record._id,
          {
            paid: {
              isPaid: true,
              timestamp: paidAt,
              paymentMethod: paymentData.channel,
              paymentService: "paystack",
              details: paymentData,
            },
            expiresAt,
            expired,
          },
          { new: true }
        );

        // 2️⃣ UPDATE STUDENT → isSubscribed = true
        if (record.studentId) {
          console.log("Updating Student:", record.studentId);

          await Student.findByIdAndUpdate(
            record.studentId,
            {
              isSubscribed: true,
              isPaid: true,
              lessonFeeId: record._id,
            },
            { new: true }
          );
        } else {
          console.log("⚠ No studentId on this LessonFee record");
        }

        return updatedRecord;
      })
    );

    // ✅ SEND EMAIL
    if (paymentData.customer?.email) {
      try {
        const html = subscriptionEmailTemplate({
          displayName: paymentData.customer.first_name || "Parent",
          updatedPayments: updated,
          reference,
        });

        await sendEmail(
          paymentData.customer.email,
          "Subscription Confirmed! 🎉",
          html
        );

        console.log("Email sent successfully.");
      } catch (err) {
        console.log("EMAIL FAILED:", err.message);
      }
    }

    // ✅ DONE
    return res.status(200).json({
      message: "Payment verified.",
      payments: updated,
      success: true,
    });
  } catch (error) {
    console.log("ERROR in GET /verify-lesson-fee:", error.message);
    const msg = error?.response?.data?.message || "Verification failed";
    return res.status(500).json({ error: msg });
  }
});
module.exports = router;
