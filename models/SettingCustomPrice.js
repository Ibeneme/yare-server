const mongoose = require("mongoose");

const settingCustomPriceSchema = new mongoose.Schema({
  localPrice: {
    type: Number,
    required: true,
  },
  internationalPrice: {
    type: Number,
    required: true,
  },
  // updatedBy: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: "User", // Optional: only if you want to reference the updater
  // },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("SettingCustomPrice", settingCustomPriceSchema);
