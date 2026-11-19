const mongoose = require("mongoose");

const studentGroupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    gradeId: { type: mongoose.Schema.Types.ObjectId, ref: "Grade", index: true },
    studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StudentGroup", studentGroupSchema);
