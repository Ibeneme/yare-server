const mongoose = require("mongoose");

const AwardSchema = new mongoose.Schema(
  {
    title: { type: String }, // e.g. "Best in Class"
    description: { type: String },

    course: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
        required: true,
      },
      title: { type: String, required: true },
    },

    student: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
        required: true,
      },
      name: { type: String, required: true },
      email: { type: String, required: true },
    },

    teacher: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Teacher",
        required: true,
      },
      name: { type: String, required: true },
      email: { type: String, required: true },
    },

    awardType: { type: String }, // e.g. "Excellence", "Participation"
    date: { type: Date, default: Date.now },

    awardMonth: { type: String }, // e.g. "September 2025"
  },
  { timestamps: true }
);

module.exports = mongoose.model("Award", AwardSchema);
