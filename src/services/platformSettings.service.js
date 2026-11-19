const PlatformSettings = require("../models/PlatformSettings");

const get = async () =>
  (await PlatformSettings.findOneAndUpdate({ key: "platform" }, { $setOnInsert: { key: "platform" } }, { upsert: true, new: true, setDefaultsOnInsert: true })).toObject();

const getTrial = async () => (await get()).trial;

module.exports = { get, getTrial };
