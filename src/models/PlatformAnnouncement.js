const mongoose = require("mongoose");

// Named PlatformAnnouncement because models/Resource.js already owns "Announcement" (per-subject).
const schema = new mongoose.Schema(
  {
    kind: {
      type: String,
      enum: ["announcement", "maintenance", "banner"],
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, trim: true, maxlength: 4000, default: "" },
    // banner styling
    severity: { type: String, enum: ["info", "success", "warning", "critical"], default: "info" },
    linkUrl: { type: String, trim: true },
    linkLabel: { type: String, trim: true },
    dismissible: { type: Boolean, default: true },
    // who sees it; empty = everyone
    audience: [{ type: String, enum: ["admin", "teacher", "student", "parent"] }],
    // visibility window (either end optional)
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    pinned: { type: Boolean, default: false },
    // maintenance only: true = the app is closed to non-admins during the window
    blocking: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformAnnouncement", schema);
