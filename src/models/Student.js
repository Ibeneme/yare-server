const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const studentSchema = new mongoose.Schema(
  {
    avatarUrl: { type: String, default: "" },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    class: String,
    courses: [String],
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // Optional: students may self-register; wards created by a parent carry parentId.
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
      default: null,
      index: true,
    },
    gradeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Grade",
      set: (v) => (v === "" ? null : v),
    },
    userType: { type: String, default: "student" },
    languages: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    isSuspended: { type: Boolean, default: false },
    inClass: { type: Boolean, default: false },
    reported: { type: Boolean, default: false },
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
    reports: [
      {
        reporterUserType: { type: String, required: true },
        reporterId: { type: mongoose.Schema.Types.ObjectId, required: true },
        reportText: { type: String, required: true },
      },
    ],
    isPay: { type: Boolean, default: false },
    isPaid: { type: Boolean, default: false },
    isSubscribed: { type: Boolean, default: false },

    // ── Subscription lapse + grace (see services/access.service.js) ──
    // Free trial granted at signup (length comes from PlatformSettings at that moment)
    trialEndsAt: { type: Date, default: null },
    trialDays: { type: Number, default: 0 },
    trialNoticeSent: { type: Boolean, default: false },
    trialEndNotified: { type: Boolean, default: false },
    subscriptionExpiredAt: { type: Date, default: null },
    // Full access continues until this moment after a lapse (then read-only).
    expiryGraceEndsAt: { type: Date, default: null },
    // Admin-granted "learn without paying" window; overrides everything while active.
    adminGraceUntil: { type: Date, default: null },
    adminGraceDuration: { type: String, enum: ["3d", "1w", "4w", "3m", null], default: null },
    adminGraceBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    adminGraceNote: { type: String, default: "" },
    feeReminderLastOn: { type: String, default: "" }, // YYYY-MM-DD of the last parent reminder
    feeReminderCount: { type: Number, default: 0 },
    readOnlyNotified: { type: Boolean, default: false },
    lessonFeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LessonFee",
      default: null,
    },
  },
  { timestamps: true }
);

// New students get the free trial, if the admin has it switched on.
studentSchema.pre("save", async function (next) {
  if (!this.isNew || this.trialEndsAt) return next();
  try {
    const { getTrial } = require("../services/platformSettings.service");
    const trial = await getTrial();
    if (trial.enabled) {
      this.trialDays = trial.days;
      this.trialEndsAt = new Date(Date.now() + trial.days * 86400000);
      this.isSubscribed = true; // keeps legacy UI gates open during the trial
    }
  } catch (e) {
    console.error("trial setup failed:", e.message); // never block signup
  }
  next();
});

// Hash password before saving
studentSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare passwords
studentSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Student", studentSchema);
