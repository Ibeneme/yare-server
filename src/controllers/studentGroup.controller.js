const StudentGroup = require("../models/StudentGroup");
const bad = (m, s = 400) => Object.assign(new Error(m), { status: s });

const list = async (req, res) => {
  const filter = req.query.gradeId ? { gradeId: req.query.gradeId } : {};
  const data = await StudentGroup.find(filter).populate("studentIds", "firstName lastName").lean();
  res.json({ success: true, data });
};
const create = async (req, res) => {
  if (!req.body.name) throw bad("name is required");
  const doc = await StudentGroup.create({
    name: req.body.name,
    gradeId: req.body.gradeId,
    studentIds: req.body.studentIds || [],
    createdBy: req.user.id,
  });
  res.status(201).json({ success: true, data: doc });
};
const update = async (req, res) => {
  const patch = {};
  ["name", "gradeId", "studentIds"].forEach((k) => req.body[k] !== undefined && (patch[k] = req.body[k]));
  const doc = await StudentGroup.findByIdAndUpdate(req.params.id, patch, { new: true });
  if (!doc) throw bad("Group not found", 404);
  res.json({ success: true, data: doc });
};
const remove = async (req, res) => {
  const doc = await StudentGroup.findByIdAndDelete(req.params.id);
  if (!doc) throw bad("Group not found", 404);
  res.json({ success: true, message: "Group deleted" });
};
module.exports = { list, create, update, remove };
