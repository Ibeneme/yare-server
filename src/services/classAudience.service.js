const Student = require("../models/Student");
const StudentGroup = require("../models/StudentGroup");

/** Resolves who a class is for: the whole grade, named groups, or picked students. */
const resolveStudentIds = async (cls) => {
  const ids = new Set((cls.studentIds || []).map(String));
  if (cls.audience === "grade" && cls.gradeId) {
    const students = await Student.find({ gradeId: cls.gradeId, isSuspended: { $ne: true } }).select("_id").lean();
    students.forEach((s) => ids.add(String(s._id)));
  }
  if (cls.audience === "groups" && cls.groupIds?.length) {
    const groups = await StudentGroup.find({ _id: { $in: cls.groupIds } }).select("studentIds").lean();
    groups.forEach((g) => g.studentIds.forEach((id) => ids.add(String(id))));
  }
  return [...ids];
};

module.exports = { resolveStudentIds };
