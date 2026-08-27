const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    // Who receives this notification
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "recipientModel", // dynamic ref
    },
    recipientModel: {
      type: String,
      required: true,
      enum: ["Teacher", "Student", "Parent", "Admin"],
    },
    // Optional: who triggered it
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "senderModel",
    },
    senderModel: {
      type: String,
      enum: ["Teacher", "Student", "Parent", "Admin", null],
    },
    type: {
      type: String,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId, // e.g. Assignment / Announcement ID
      default: null,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    // Extra data if needed later
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Indexes for common queries
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
