const express = require("express");
const axios = require("axios");
const LessonFee = require("../models/LessonFee");
const sendEmail = require("../utils/mailer");
const Student = require("../models/Student");
const { default: mongoose } = require("mongoose");
const Class = require("../models/Class");
const Admin = require("../models/Admin");
const Parent = require("../models/Parent");
const router = express.Router();

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY ||
  "sk_test_36fa1899b7cc4af2f3b86f3544c4ab99e9a80ea4";

  router.get("/lesson-fees/history/:payerId", async (req, res) => {
    try {
      const { payerId } = req.params;
      let lessonFees = [];
  
      // Check if payer is a Student
      const student = await Student.findById(payerId).lean();
      if (student) {
        lessonFees = await LessonFee.find({ payerId });
      } 
      // Check if payer is an Admin
      else {
        const admin = await Admin.findById(payerId).lean();
        if (admin) {
          lessonFees = await LessonFee.find({});
        } 
        // Check if payer is a Parent
        else {
          const parent = await Parent.findById(payerId).lean();
          if (parent) {
            const children = await Student.find({ parentId: payerId }).lean();
            const childIds = children.map(c => c._id);
            lessonFees = await LessonFee.find({ studentId: { $in: childIds } });
          } else {
            return res.status(404).json({ success: false, message: "Payer not found" });
          }
        }
      }
  
      // Map fees with student + class info
      const feesWithDetails = await Promise.all(
        lessonFees.map(async (fee) => {
          if (!mongoose.Types.ObjectId.isValid(fee.studentId)) {
            console.warn("❌ Invalid student ID:", fee.studentId);
            return { lessonFee: fee, student: null, classInfo: null };
          }
  
          const studentData = await Student.findById(fee.studentId).lean();
          if (!studentData) {
            console.warn("⚠️ Student not found:", fee.studentId);
            return { lessonFee: fee, student: null, classInfo: null };
          }
  
          let classInfo = null;
          const firstCourseId = studentData.courses?.[0];
          if (firstCourseId && mongoose.Types.ObjectId.isValid(firstCourseId)) {
            classInfo = await Class.findOne({ courseId: firstCourseId }).lean();
          }
  
          return { lessonFee: fee, student: studentData, classInfo };
        })
      );
  
      res.status(200).json({ success: true, data: feesWithDetails });
    } catch (error) {
      console.error("Error fetching lesson fees:", error);
      res.status(500).json({ success: false, message: "Server Error" });
    }
  });
// POST: create payment
router.post("/pay-lesson-fee", async (req, res) => {
  try {
    const {
      email,
      amount,
      studentId,
      payerId,
      payerModel,
      duration,
      callback_url,
    } = req.body;

    if (
      !email ||
      !amount ||
      !studentId ||
      !payerId ||
      !payerModel ||
      !callback_url ||
      !duration
    ) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    const newPayment = await LessonFee.create({
      studentId,
      payerId,
      payerModel,
      duration,
      amount,
    });

    const payload = {
      email,
      amount: amount * 100,
      currency: "NGN",
      callback_url: `${callback_url}?paymentId=${newPayment._id}`,
    };

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

    const { reference, authorization_url } = response.data.data;

    res.status(200).json({
      checkout_url: authorization_url,
      reference,
      paymentId: newPayment._id,
    });
  } catch (error) {
    console.error("Error initializing payment:", error);
    const errorMessage =
      error.response?.data?.message || "Internal server error";
    res.status(500).json({ error: errorMessage });
  }
});

const addDurationToDate = (startDate, duration) => {
  const date = new Date(startDate);
  const [value, unit] = duration.split(" ");

  if (unit.startsWith("month")) {
    date.setMonth(date.getMonth() + parseInt(value));
  } else if (unit.startsWith("day")) {
    date.setDate(date.getDate() + parseInt(value));
  }
  return date;
};

router.get("/verify-lesson-fee/:paymentId", async (req, res) => {
  try {
    const { reference } = req.query;
    const { paymentId } = req.params;

    console.log("🚀 Incoming payment verification request...");
    console.log("🔍 Query Reference:", reference);
    console.log("🔍 URL Param Payment ID:", paymentId);

    if (!reference || !paymentId) {
      console.log("❌ Missing reference or payment ID.");
      return res
        .status(400)
        .json({ error: "Missing reference or payment ID." });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ Paystack Verification Response:", response.data);

    const paymentData = response.data.data;

    if (paymentData.status === "success") {
      console.log("✅ Payment status: SUCCESS");

      const paymentRecord = await LessonFee.findById(paymentId);
      console.log("📦 Existing Payment Record:", paymentRecord);

      if (!paymentRecord) {
        console.log("❌ Payment record not found in DB.");
        return res.status(404).json({ error: "Payment record not found." });
      }

      const paidAt = new Date(paymentData.paid_at);
      const expiresAt = addDurationToDate(paidAt, paymentRecord.duration);
      const expired = new Date() > expiresAt;

      console.log("📅 Paid At:", paidAt);
      console.log("📅 Expires At:", expiresAt);
      console.log("⌛ Expired Status:", expired);

      const updatedPayment = await LessonFee.findByIdAndUpdate(
        paymentId,
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

      console.log("💾 Updated Payment Record:", updatedPayment);

      if (
        updatedPayment &&
        paymentData.customer &&
        paymentData.customer.email
      ) {
        const customerEmail = paymentData.customer.email;
        const subject = "Yare Learning Hub: Your Subscription is Confirmed!";
        const emailText = `
Dear Valued Learner,

Great news! Your subscription to Yare Learning Hub has been successfully confirmed.

**Subscription Details:**
* **Plan:** ${updatedPayment.duration}
* **Amount Paid:** ${updatedPayment.amount.toFixed(2)} ${
          updatedPayment.currency || "NGN"
        }
* **Payment Date:** ${new Date(
          updatedPayment.paid.timestamp
        ).toLocaleDateString()}
* **Access Expires On:** ${updatedPayment.expiresAt.toLocaleDateString()}
* **Transaction Reference:** ${reference}

You now have full access to all our powerful features, including:
* Innovative Curriculum designed to address real-world challenges.
* Dedicated Mentorship and Support to guide your learning journey.
* A vibrant Community-Driven Education environment.
* Comprehensive Access to All Learning Programs.

We are thrilled to have you as part of the Yare Learning Hub community. We are committed to nurturing bold thinkers, innovative creators, and empathetic leaders, and we believe your journey with us will be transformative.

If you have any questions or need assistance, please do not hesitate to reach out to our support team.

Happy Learning!

Warm regards,

The Yare Learning Hub Team
`;
        try {
          console.log(
            `📧 Attempting to send success email to: ${customerEmail}`
          );
          await sendEmail(customerEmail, subject, emailText);
          console.log("✅ Success email sent!");
        } catch (emailError) {
          console.error("❌ Failed to send success email:", emailError);
          // Log specific nodemailer error details if available
          if (emailError.response) {
            console.error("Email Service Error Response:", emailError.response);
          }
        }
      } else {
        console.warn(
          "⚠️ Could not send email: Missing customer email or updatedPayment data."
        );
      }

      res.status(200).json({
        message: "Payment verified and recorded successfully.",
        payment: updatedPayment,
        success: true,
      });
    } else {
      console.log("❌ Payment verification failed at Paystack.");
      res.status(400).json({
        message: "Payment not successful.",
        paymentData,
        success: false,
      });
    }
  } catch (error) {
    console.error("❌ Error verifying payment:", error);
    const errorMessage =
      error.response?.data?.message || "Internal server error";

    res.status(500).json({ error: errorMessage });
  }
});

module.exports = router;
