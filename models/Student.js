const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const studentSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  class: String,
  courses: [String],
  email: { type: String, unique: true },
  password: String,
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: "Parent" },
  gradeId: { type: mongoose.Schema.Types.ObjectId, ref: "Grade" },
  userType: {
    type: String,
  },
  // ✅ New optional fields
  languages: {
    type: [String],
    default: [],
  },
  skills: {
    type: [String],
    default: [],
  },

  isSuspended: { type: Boolean, default: false },
  inClass: { type: Boolean, default: false },
  reported: { type: Boolean, default: false },

  reports: [
    {
      reporterUserType: { type: String, required: true },
      reporterId: { type: mongoose.Schema.Types.ObjectId, required: true },
      reportText: { type: String, required: true },
    },
  ],

  // ✅ New payment fields
  isPay: { type: Boolean, default: false }, // Whether student has paid
  lessonFeeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "LessonFee", // Make sure you have a model named 'LessonFee'
    default: null,
  },
});

studentSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

studentSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Student", studentSchema);