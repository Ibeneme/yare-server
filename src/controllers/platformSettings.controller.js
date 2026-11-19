const PlatformSettings = require("../models/PlatformSettings");
const settings = require("../services/platformSettings.service");

const bad = (m, s = 400) => Object.assign(new Error(m), { status: s });
const PRESETS = [7, 14, 28, 42]; // 1 week, 2 weeks, 4 weeks, 6 weeks; any other whole number 1–365 is accepted

const getAll = async (req, res) => {
  res.json({ success: true, data: await settings.get(), trialPresets: PRESETS });
};

/** Switch the free trial on/off and set its length. Only affects students who sign up afterwards. */
const updateTrial = async (req, res) => {
  const { enabled, days } = req.body;
  const patch = {};
  if (enabled !== undefined) patch["trial.enabled"] = Boolean(enabled);
  if (days !== undefined) {
    const n = Number(days);
    if (!Number.isInteger(n) || n < 1 || n > 365) throw bad("days must be a whole number from 1 to 365");
    patch["trial.days"] = n;
  }
  if (!Object.keys(patch).length) throw bad("Send enabled and/or days");
  patch.updatedBy = req.user.id;
  await settings.get();
  const doc = await PlatformSettings.findOneAndUpdate({ key: "platform" }, { $set: patch }, { new: true });
  res.json({ success: true, data: doc, trialPresets: PRESETS });
};

module.exports = { getAll, updateTrial };
