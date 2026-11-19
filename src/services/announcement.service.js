const PlatformAnnouncement = require("../models/PlatformAnnouncement");

const activeFilter = (role, now = new Date()) => ({
  isActive: true,
  $and: [
    { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
    { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    { $or: [{ audience: { $size: 0 } }, ...(role ? [{ audience: role }] : [])] },
  ],
});

const listActive = (role) =>
  PlatformAnnouncement.find(activeFilter(role)).sort({ pinned: -1, createdAt: -1 }).limit(100).lean();

// Short cache so the maintenance gate adds ~no DB load.
let cache = { at: 0, value: null };
const getBlockingMaintenance = async () => {
  if (Date.now() - cache.at < 15000) return cache.value;
  const doc = await PlatformAnnouncement.findOne({ kind: "maintenance", blocking: true, ...activeFilter(null) })
    .select("title body endsAt")
    .lean();
  cache = { at: Date.now(), value: doc };
  return doc;
};
const clearCache = () => (cache = { at: 0, value: null });

module.exports = { listActive, getBlockingMaintenance, clearCache, activeFilter };
