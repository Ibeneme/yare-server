const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const parentSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true },
  password: { type: String, required: true },
  isSuspended: { type: Boolean, default: false },
  reported: { type: Boolean, default: false },
  children: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  userType: { type: String, default: "parent" },
  isVerified: { type: Boolean, default: false },
  avatarUrl: { type: String, default: "" },
  // What the parent wants to hear about, and how (see /api/notifications/preferences)
  notificationPrefs: {
    email: { type: Boolean, default: true },
    classReminders: { type: Boolean, default: true },
    feeNotices: { type: Boolean, default: true },
    awards: { type: Boolean, default: true },
    wards: [
      {
        studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Student" },
        classReminders: { type: Boolean, default: true }, // reminders for this child's classes
        joinAlerts: { type: Boolean, default: false }, // tell me when this child joins a live class
      },
    ],
  },
});

// Hash password before saving
parentSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare passwords
parentSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Parent", parentSchema);
