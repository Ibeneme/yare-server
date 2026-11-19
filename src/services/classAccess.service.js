const mongoose = require("mongoose");
const Class = require("../models/Class");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const Admin = require("../models/Admin");
const { resolveStudentIds } = require("./classAudience.service");
const { isLiveNow } = require("./schedule.service");

/**
 * Access matrix for the virtual classroom:
 *   admin / super admin -> every class (host)
 *   teacher             -> classes assigned to them (host)
 *   parent              -> classes any of their children is in (viewer)
 *   student             -> classes they are in (viewer)
 * Returns { allowed, role, isHost, cls, live } (never throws for "no access").
 */
const getClassAccess = async ({ userId, userType, classId }) => {
  const deny = { allowed: false };
  if (!mongoose.Types.ObjectId.isValid(classId)) return deny;
  const cls = await Class.findById(classId).populate("subjectId", "name").lean();
  if (!cls) return deny;

  const base = { allowed: true, cls, live: isLiveNow(cls) };
  if (userType === "admin") return { ...base, role: "admin", isHost: true };
  if (userType === "teacher") {
    return String(cls.teacherId) === String(userId) ? { ...base, role: "teacher", isHost: true } : deny;
  }
  const roster = await resolveStudentIds(cls);
  if (userType === "student") {
    return roster.includes(String(userId)) ? { ...base, role: "student", isHost: false } : deny;
  }
  if (userType === "parent") {
    const parent = await Parent.findById(userId).select("children").lean();
    const kids = (parent?.children || []).map(String);
    const wards = await Student.find({ parentId: userId }).select("_id").lean();
    wards.forEach((w) => kids.push(String(w._id)));
    return kids.some((k) => roster.includes(k)) ? { ...base, role: "parent", isHost: false } : deny;
  }
  return deny;
};

/** Classes the caller is allowed to see/join. */
const listAccessibleClasses = async ({ userId, userType }) => {
  if (userType === "admin") return Class.find().populate("subjectId", "name").lean();
  if (userType === "teacher") return Class.find({ teacherId: userId }).populate("subjectId", "name").lean();

  let studentIds = [];
  if (userType === "student") studentIds = [String(userId)];
  if (userType === "parent") {
    const wards = await Student.find({ parentId: userId }).select("_id gradeId").lean();
    studentIds = wards.map((w) => String(w._id));
  }
  if (!studentIds.length) return [];
  const all = await Class.find().populate("subjectId", "name").lean();
  const out = [];
  for (const c of all) {
    const roster = await resolveStudentIds(c);
    if (studentIds.some((id) => roster.includes(id))) out.push(c);
  }
  return out;
};

const displayName = async (userId, userType) => {
  const Model = { teacher: Teacher, student: Student, parent: Parent, admin: Admin }[userType];
  const u = Model && (await Model.findById(userId).select("firstName lastName").lean());
  return u ? `${u.firstName} ${u.lastName}`.trim() : "Guest";
};

module.exports = { getClassAccess, listAccessibleClasses, displayName };
