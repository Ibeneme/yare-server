const Assignment = require("../models/ClassAssignment");
const ClassroomNote = require("../models/ClassroomNote");
const { getClassAccess, listAccessibleClasses } = require("../services/classAccess.service");
const { getRoomSnapshot } = require("../sockets/roomState");

const bad = (m, s = 400) => Object.assign(new Error(m), { status: s });

const withAccess = async (req) => {
  const access = await getClassAccess({
    userId: req.user.id,
    userType: req.user.userType,
    classId: req.params.classId,
  });
  if (!access.allowed) throw bad("You do not have access to this class", 403);
  return access;
};

const myClasses = async (req, res) => {
  const data = await listAccessibleClasses({ userId: req.user.id, userType: req.user.userType });
  res.json({ success: true, data });
};

const access = async (req, res) => {
  const a = await withAccess(req);
  res.json({
    success: true,
    data: { role: a.role, isHost: a.isHost, live: a.live, class: { _id: a.cls._id, title: a.cls.title } },
    room: getRoomSnapshot(String(a.cls._id)),
  });
};

const listAssignments = async (req, res) => {
  const a = await withAccess(req);
  const data = await Assignment.find({ classId: a.cls._id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data });
};

/** Teachers (or admins) can also post outside a live call; the socket event is the live path. */
const createAssignment = async (req, res) => {
  const a = await withAccess(req);
  if (!a.isHost) throw bad("Only the teacher or an admin can post assignments", 403);
  if (!req.body.title) throw bad("title is required");
  const doc = await Assignment.create({
    classId: a.cls._id,
    teacherId: a.cls.teacherId || req.user.id,
    title: req.body.title,
    instructions: req.body.instructions,
    dueDate: req.body.dueDate,
  });
  res.status(201).json({ success: true, data: doc });
};

const getNotes = async (req, res) => {
  const a = await withAccess(req);
  const note = await ClassroomNote.findOne({ classId: a.cls._id }).lean();
  res.json({ success: true, data: note || { content: "", version: 0 } });
};

module.exports = { myClasses, access, listAssignments, createAssignment, getNotes };
