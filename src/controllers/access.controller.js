const mongoose = require("mongoose");
const Student = require("../models/Student");
const { getAccessState, publicAccessView, graceEndFrom } = require("../services/access.service");
const { GRACE_OPTIONS } = require("../config/constants");

const bad = (m, s = 400) => Object.assign(new Error(m), { status: s });
const SELECT = "trialEndsAt trialDays firstName lastName email gradeId parentId isSubscribed isPaid subscriptionExpiredAt expiryGraceEndsAt adminGraceUntil adminGraceDuration adminGraceNote feeReminderCount";

/** Admin: grant "learn without paying" for 3d / 1w / 4w / 3m. Replaces any current grace. */
const grantGrace = async (req, res) => {
  const { duration, note } = req.body;
  if (!GRACE_OPTIONS[duration]) throw bad(`duration must be one of: ${Object.keys(GRACE_OPTIONS).join(", ")}`);
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw bad("Invalid student id");
  const until = graceEndFrom(duration);
  const student = await Student.findByIdAndUpdate(
    req.params.id,
    {
      adminGraceUntil: until,
      adminGraceDuration: duration,
      adminGraceBy: req.user.id,
      adminGraceNote: note || "",
      isSubscribed: true, // keeps legacy UI gates open while the grace runs
    },
    { new: true }
  ).select(SELECT);
  if (!student) throw bad("Student not found", 404);
  res.json({ success: true, data: { ...student.toObject(), access: getAccessState(student) } });
};

/** Admin: switch grace off. Access then follows the normal subscription rules. */
const revokeGrace = async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) throw bad("Student not found", 404);
  student.adminGraceUntil = null;
  student.adminGraceDuration = null;
  student.adminGraceBy = null;
  student.adminGraceNote = "";
  const st = getAccessState(student);
  if (st.mode === "read_only" || st.reason === "not_subscribed") student.isSubscribed = false;
  await student.save();
  res.json({ success: true, data: { _id: student._id, access: getAccessState(student) } });
};

/** Admin overview: filter by state = grace | lapsed | expiry_grace | paid. */
const listStudents = async (req, res) => {
  const { state, q } = req.query;
  const filter = {};
  if (q) filter.$or = [{ firstName: new RegExp(q, "i") }, { lastName: new RegExp(q, "i") }, { email: new RegExp(q, "i") }];
  const students = await Student.find(filter).select(SELECT).sort({ updatedAt: -1 }).limit(1000).lean();
  let rows = students.map((s) => ({ ...s, access: getAccessState(s) }));
  const map = { grace: "admin_grace", lapsed: "lapsed", expiry_grace: "expiry_grace", paid: "paid", trial: "trial", trial_ended: "trial_ended" };
  if (state && map[state]) rows = rows.filter((r) => r.access.reason === map[state]);
  res.json({ success: true, data: rows, options: Object.keys(GRACE_OPTIONS) });
};

/** Student: neutral view, never mentions fees. */
const myAccess = async (req, res) => {
  const s = await Student.findById(req.user.id).select(SELECT).lean();
  if (!s) throw bad("Student not found", 404);
  res.json({ success: true, data: publicAccessView(getAccessState(s)) });
};

/** Parent: the real picture for each ward, with days left and renewal wording. */
const wardAccess = async (req, res) => {
  const wards = await Student.find({ parentId: req.user.id }).select(SELECT).lean();
  const now = Date.now();
  const data = wards.map((w) => {
    const a = getAccessState(w);
    const until = a.until || null;
    return {
      studentId: w._id,
      name: `${w.firstName} ${w.lastName}`,
      access: a,
      daysLeft: until ? Math.max(0, Math.ceil((new Date(until) - now) / 86400000)) : null,
      needsRenewal: ["expiry_grace", "lapsed", "trial", "trial_ended"].includes(a.reason),
    };
  });
  res.json({ success: true, data });
};

module.exports = { grantGrace, revokeGrace, listStudents, myAccess, wardAccess };
