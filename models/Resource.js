const mongoose = require("mongoose");

const commonFields = {
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "Subject",
  },
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
};

const assignmentSchema = new mongoose.Schema(
  { ...commonFields },
  { timestamps: true }
);

const noteSchema = new mongoose.Schema(
  { ...commonFields },
  { timestamps: true }
);

const announcementSchema = new mongoose.Schema(
  { ...commonFields },
  { timestamps: true }
);

const Assignment = mongoose.model("Assignment", assignmentSchema);
const Note = mongoose.model("Note", noteSchema);
const Announcement = mongoose.model("Announcement", announcementSchema);

module.exports = {
  Assignment,
  Note,
  Announcement,
};
