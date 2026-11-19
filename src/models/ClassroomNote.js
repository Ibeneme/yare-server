const mongoose = require("mongoose");

// Shared notes for a class room (one document per class).
const classroomNoteSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, ref: "Class", required: true, unique: true },
    content: { type: String, default: "" },
    version: { type: Number, default: 0 },
    lastEditedBy: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model("ClassroomNote", classroomNoteSchema);
