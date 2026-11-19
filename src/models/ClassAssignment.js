const mongoose = require("mongoose");

// Work a teacher posts to a class, usually during a live session.
const assignmentSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true, index: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "Teacher", required: true },
    title: { type: String, required: true, trim: true },
    instructions: { type: String, trim: true },
    dueDate: Date,
    postedDuringLive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClassAssignment", assignmentSchema);
