const express = require("express");
const mongoose = require("mongoose");
const AwardGrant = require("../models/AwardGrant");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const auth = require("../middlewares/auth.middleware");
const asyncHandler = require("../middlewares/asyncHandler");
const createAndSendNotification = require("../services/notification.service");
const awardEmail = require("../templates/awardEmail");
const { perkText, redeemFreeMonth } = require("../services/perks.service");

const router = express.Router();
router.use(auth);
const adminOnly = auth.requireRoles("admin");
const ok = (res, data, extra = {}, code = 200) => res.status(code).json({ success: true, data, ...extra });

const clean = (b) => {
  const kind = ["none", "free_month", "discount", "custom"].includes(b?.perk?.kind) ? b.perk.kind : "none";
  const perk = { kind, note: String(b?.perk?.note || "").slice(0, 300), expiresAt: b?.perk?.expiresAt || null };
  if (kind === "discount") {
    const pct = Number(b.perk.discountPercent);
    if (!(pct >= 1 && pct <= 100)) throw Object.assign(new Error("Discount must be between 1 and 100 percent"), { status: 400 });
    perk.discountPercent = pct;
  }
  return perk;
};

// Admin: issue an award
router.post("/", adminOnly, asyncHandler(async (req, res) => {
  const { title, description, studentId } = req.body;
  if (!title?.trim() || !mongoose.isValidObjectId(studentId)) return res.status(400).json({ success: false, message: "title and a valid studentId are required" });
  const student = await Student.findById(studentId).select("firstName lastName email parentId");
  if (!student) return res.status(404).json({ success: false, message: "Student not found" });
  let perk;
  try { perk = clean(req.body); } catch (e) { return res.status(e.status || 400).json({ success: false, message: e.message }); }

  const grant = await AwardGrant.create({ title: title.trim(), description, studentId, issuedBy: req.user.id, perk });

  // Tell the student and the parent (in-app + email). Failures never block the award.
  const studentName = `${student.firstName} ${student.lastName}`;
  const text = perkText(perk);
  const parent = student.parentId ? await Parent.findById(student.parentId).select("firstName email") : null;
  const targets = [
    { id: student._id, model: "Student", email: student.email, name: student.firstName },
    ...(parent ? [{ id: parent._id, model: "Parent", email: parent.email, name: parent.firstName }] : []),
  ];
  await Promise.allSettled(targets.map((t) => createAndSendNotification({
    title: `New award: ${grant.title}`,
    description: `${studentName} earned an award.${text ? ` Reward: ${text}.` : ""}`,
    recipientId: t.id, recipientModel: t.model, email: t.email, type: "success", relatedId: grant._id,
    html: awardEmail({ recipientName: t.name, studentName, title: grant.title, description, perkText: text, expiresAt: perk.expiresAt }),
  })));
  return ok(res, grant, {}, 201);
}));

// Admin: everything issued
router.get("/", adminOnly, asyncHandler(async (req, res) => {
  const rows = await AwardGrant.find().sort({ createdAt: -1 }).populate("studentId", "firstName lastName email").lean();
  return ok(res, rows);
}));

router.put("/:id", adminOnly, asyncHandler(async (req, res) => {
  const g = await AwardGrant.findById(req.params.id);
  if (!g) return res.status(404).json({ success: false, message: "Award not found" });
  if (req.body.title) g.title = req.body.title.trim();
  if (req.body.description !== undefined) g.description = req.body.description;
  if (req.body.perk && !g.perk.redeemedAt) {
    try { g.perk = { ...clean(req.body), redeemedAt: null }; } catch (e) { return res.status(400).json({ success: false, message: e.message }); }
  }
  await g.save();
  return ok(res, g);
}));

router.delete("/:id", adminOnly, asyncHandler(async (req, res) => {
  const g = await AwardGrant.findByIdAndDelete(req.params.id);
  if (!g) return res.status(404).json({ success: false, message: "Award not found" });
  return ok(res, { _id: g._id });
}));

// Student: own awards. Parent: awards of all their wards.
router.get("/mine", auth.requireRoles("student", "parent"), asyncHandler(async (req, res) => {
  const ids = req.user.userType === "parent" ? (await Student.find({ parentId: req.user.id }).select("_id")).map((s) => s._id) : [req.user.id];
  const rows = await AwardGrant.find({ studentId: { $in: ids } }).sort({ createdAt: -1 }).populate("studentId", "firstName lastName").lean();
  // Students never see money wording: they get the award and the reward text only.
  return ok(res, rows);
}));

// Parent: use a free-month perk now (discounts apply by themselves at checkout)
router.post("/:id/redeem", auth.requireRoles("parent"), asyncHandler(async (req, res) => {
  const g = await AwardGrant.findById(req.params.id);
  if (!g || g.perk.kind !== "free_month") return res.status(404).json({ success: false, message: "No free-month reward found" });
  if (g.perk.redeemedAt || (g.perk.expiresAt && g.perk.expiresAt < new Date())) return res.status(400).json({ success: false, message: "This reward has already been used or has expired" });
  const owns = await Student.exists({ _id: g.studentId, parentId: req.user.id });
  if (!owns) return res.status(403).json({ success: false, message: "This award belongs to another family" });
  const fee = await redeemFreeMonth(g, req.user.id);
  return ok(res, { award: g, expiresAt: fee.expiresAt });
}));

module.exports = router;
