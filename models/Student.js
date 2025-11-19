const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const studentSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    class: String,
    courses: [String],
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
      required: true,
    },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: "Grade" },
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
    lessonFeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LessonFee",
      default: null,
    },
  },
  { timestamps: true }
);

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
