const mongoose = require("mongoose");

// Single document (key "platform") holding admin-controlled switches.
const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "platform", unique: true },
    trial: {
      enabled: { type: Boolean, default: true },
      days: { type: Number, default: 7, min: 1, max: 365 },
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("PlatformSettings", platformSettingsSchema);
