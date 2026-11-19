const mongoose = require("mongoose");

// One row per (class, start time) so a reminder is never sent twice.
const logSchema = new mongoose.Schema(
  {
    classId: { type: mongoose.Schema.Types.ObjectId, required: true },
    startsAt: { type: Date, required: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);
logSchema.index({ classId: 1, startsAt: 1 }, { unique: true });
// housekeeping: drop rows after 7 days
logSchema.index({ sentAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 7 });

module.exports = mongoose.model("ClassReminderLog", logSchema);
