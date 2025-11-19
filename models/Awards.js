const mongoose = require("mongoose");

const AwardSchema = new mongoose.Schema(
  {
    title: { type: String },
    description: { type: String },

    subject: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subject",
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

    awardType: { type: String }, 
    date: { type: Date, default: Date.now },

    awardMonth: { type: String }, 
  },
  { timestamps: true }
);

module.exports = mongoose.model("Award", AwardSchema);
