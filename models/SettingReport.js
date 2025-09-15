// models/SettingReport.js
const mongoose = require("mongoose");

const settingReportSchema = new mongoose.Schema({
  reporterId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    //required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("SettingReport", settingReportSchema);
