const PlatformAnnouncement = require("../models/PlatformAnnouncement");
const { listActive, clearCache } = require("../services/announcement.service");

const bad = (m, s = 400) => Object.assign(new Error(m), { status: s });
const FIELDS = ["kind", "title", "body", "severity", "linkUrl", "linkLabel", "dismissible", "audience", "startsAt", "endsAt", "isActive", "pinned", "blocking"];

const clean = (body) => {
  const out = {};
  FIELDS.forEach((k) => body[k] !== undefined && (out[k] = body[k]));
  if (out.startsAt === "") out.startsAt = null;
  if (out.endsAt === "") out.endsAt = null;
  if (out.startsAt && out.endsAt && new Date(out.endsAt) <= new Date(out.startsAt)) throw bad("endsAt must be after startsAt");
  if (out.kind !== undefined && out.kind !== "maintenance") out.blocking = false;
  return out;
};

const changed = (req) => {
  clearCache();
  req.app.get("io")?.emit("announcements:changed"); // clients refetch
};

/** What the signed-in user should see right now, grouped for the UI. */
const mine = async (req, res) => {
  const rows = await listActive(req.user.role === "superadmin" ? "admin" : req.user.userType);
  res.json({
    success: true,
    data: {
      banners: rows.filter((r) => r.kind === "banner"),
      maintenance: rows.filter((r) => r.kind === "maintenance"),
      announcements: rows.filter((r) => r.kind === "announcement"),
    },
  });
};

/** Pre-login: banners and maintenance for everyone (no audience-restricted items). */
const publicStatus = async (req, res) => {
  const rows = (await listActive(null)).filter((r) => r.kind !== "announcement");
  res.json({
    success: true,
    data: { banners: rows.filter((r) => r.kind === "banner"), maintenance: rows.filter((r) => r.kind === "maintenance") },
  });
};

/** Admin: everything, with a computed status. */
const list = async (req, res) => {
  const filter = req.query.kind ? { kind: req.query.kind } : {};
  const rows = await PlatformAnnouncement.find(filter).sort({ createdAt: -1 }).lean();
  const now = new Date();
  const data = rows.map((r) => ({
    ...r,
    status: !r.isActive ? "off" : r.endsAt && r.endsAt < now ? "ended" : r.startsAt && r.startsAt > now ? "scheduled" : "live",
  }));
  res.json({ success: true, data });
};

const create = async (req, res) => {
  const data = clean(req.body);
  if (!data.kind || !data.title) throw bad("kind and title are required");
  const doc = await PlatformAnnouncement.create({ ...data, createdBy: req.user.id });
  changed(req);
  res.status(201).json({ success: true, data: doc });
};

const update = async (req, res) => {
  const doc = await PlatformAnnouncement.findByIdAndUpdate(req.params.id, clean(req.body), { new: true, runValidators: true });
  if (!doc) throw bad("Not found", 404);
  changed(req);
  res.json({ success: true, data: doc });
};

const toggle = async (req, res) => {
  const doc = await PlatformAnnouncement.findById(req.params.id);
  if (!doc) throw bad("Not found", 404);
  doc.isActive = typeof req.body.isActive === "boolean" ? req.body.isActive : !doc.isActive;
  await doc.save();
  changed(req);
  res.json({ success: true, data: doc });
};

const remove = async (req, res) => {
  const doc = await PlatformAnnouncement.findByIdAndDelete(req.params.id);
  if (!doc) throw bad("Not found", 404);
  changed(req);
  res.json({ success: true, message: "Deleted" });
};

module.exports = { mine, publicStatus, list, create, update, toggle, remove };
