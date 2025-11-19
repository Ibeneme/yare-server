// models/Subject.js
const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, unique: true, uppercase: true },
    description: { type: String },
    gradeLevel: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Grade",
        required: true,
      },
    ],
    isActive: { type: Boolean, default: true },
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
    teachers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Teacher" }],
    classes: [{ type: mongoose.Schema.Types.ObjectId, ref: "Class" }],
  },
  { timestamps: true }
);

subjectSchema.index({ name: 1, gradeLevel: 1 });
subjectSchema.index({ code: 1 });

module.exports = mongoose.model("Subject", subjectSchema);
