const mongoose = require("mongoose");
const Task = require("../models/Task");
const Teacher = require("../models/Teacher");
const Admin = require("../models/Admin");
const createAndSendNotification = require("../services/notification.service");

const bad = (m, s = 400) => Object.assign(new Error(m), { status: s });
const modelFor = (req) => (req.user.userType === "admin" ? "Admin" : "Teacher");
const isAdmin = (req) => req.user.userType === "admin";
const STATUSES = ["todo", "in_progress", "done"];

const pick = (body, keys) => Object.fromEntries(keys.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));
const withDone = (patch) => {
  if (patch.status === "done") patch.completedAt = new Date();
  else if (patch.status) patch.completedAt = null;
  return patch;
};

const formatUser = (doc, fallbackModel) => {
  if (!doc || typeof doc !== "object") return null;
  const fullName =
    (doc.name && String(doc.name).trim()) ||
    `${doc.firstName || ""} ${doc.lastName || ""}`.trim() ||
    doc.email ||
    "";
  const resolvedType = (
    doc.userType ||
    doc.role ||
    (fallbackModel ? String(fallbackModel).toLowerCase() : "") ||
    ""
  ).toLowerCase();

  return {
    _id: doc._id,
    name: fullName,
    firstName: doc.firstName || "",
    lastName: doc.lastName || "",
    email: doc.email || "",
    userType: resolvedType,
  };
};

/** A teacher's board (grouped by column) or an admin's own. */
const myBoard = async (req, res) => {
  const tasks = await Task.find({ "assignedTo.id": req.user.id }).sort({ dueDate: 1, createdAt: -1 }).lean();
  const board = { todo: [], in_progress: [], done: [] };
  tasks.forEach((t) => board[t.status].push(t));
  res.json({ success: true, data: board, total: tasks.length });
};

/** Anyone on the board can add a personal task for themselves. */
const createOwn = async (req, res) => {
  if (!req.body.title) throw bad("title is required");
  const me = { id: req.user.id, model: modelFor(req) };
  const task = await Task.create({
    ...pick(req.body, ["title", "description", "priority", "dueDate", "labels"]),
    assignedTo: me,
    createdBy: me,
  });
  res.status(201).json({ success: true, data: task });
};

/** Admin assigns work to a teacher (or another admin). */
const assign = async (req, res) => {
  const { assigneeId, assigneeType = "teacher" } = req.body;
  if (!req.body.title) throw bad("title is required");
  if (!mongoose.Types.ObjectId.isValid(assigneeId)) throw bad("assigneeId is required");
  const model = assigneeType === "admin" ? "Admin" : "Teacher";
  const assignee = await (model === "Admin" ? Admin : Teacher).findById(assigneeId).select("email firstName");
  if (!assignee) throw bad("Assignee not found", 404);

  const task = await Task.create({
    ...pick(req.body, ["title", "description", "priority", "dueDate", "labels"]),
    assignedTo: { id: assigneeId, model },
    createdBy: { id: req.user.id, model: "Admin" },
    assignedByAdmin: true,
  });

  createAndSendNotification({
    title: "New task assigned",
    description: task.title,
    recipientId: assigneeId,
    recipientModel: model,
    email: assignee.email,
    emailSubject: `New task: ${task.title}`,
    type: "general",
    relatedId: task._id,
    sendMail: true,
  }).catch((e) => console.error("task notification failed:", e.message));
  res.status(201).json({ success: true, data: task });
};

/** Admin tracker: filter by assignee/status/overdue plus per-person counts. */
const tracker = async (req, res) => {
  const { assigneeId, status, overdue, priority } = req.query;
  const filter = {};
  if (assigneeId) filter["assignedTo.id"] = assigneeId;
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (overdue === "true") Object.assign(filter, { status: { $ne: "done" }, dueDate: { $lt: new Date() } });

  const [rawData, summary] = await Promise.all([
    Task.find(filter)
      .populate({
        path: "assignedTo.id",
        select: "firstName lastName name email userType role",
      })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean(),
    Task.aggregate([
      { $group: { _id: { who: "$assignedTo.id", status: "$status" }, n: { $sum: 1 } } },
    ]),
  ]);

  // Collect any IDs that were not populated into objects
  const unresolvedIds = new Set();
  rawData.forEach((t) => {
    const rawId = t.assignedTo?.id;
    if (typeof rawId === "string" || rawId instanceof mongoose.Types.ObjectId) {
      unresolvedIds.add(String(rawId));
    }
  });

  const fallbackUsers = new Map();
  if (unresolvedIds.size > 0) {
    const idList = [...unresolvedIds].filter((id) => mongoose.Types.ObjectId.isValid(id));
    const [teachers, admins] = await Promise.all([
      Teacher.find({ _id: { $in: idList } }).select("firstName lastName name email userType role").lean(),
      Admin.find({ _id: { $in: idList } }).select("firstName lastName name email userType role").lean(),
    ]);
    teachers.forEach((u) => fallbackUsers.set(String(u._id), formatUser(u, "Teacher")));
    admins.forEach((u) => fallbackUsers.set(String(u._id), formatUser(u, "Admin")));
  }

  const data = rawData.map((t) => {
    const rawId = t.assignedTo?.id;
    const idStr = typeof rawId === "object" && rawId?._id ? String(rawId._id) : String(rawId || "");
    const populatedUser =
      typeof rawId === "object" && rawId !== null && !(rawId instanceof mongoose.Types.ObjectId)
        ? formatUser(rawId, t.assignedTo?.model)
        : fallbackUsers.get(idStr) || null;

    return {
      ...t,
      assignedTo: {
        ...t.assignedTo,
        id: populatedUser || rawId,
        user: populatedUser,
      },
    };
  });

  const perAssignee = {};
  summary.forEach(({ _id, n }) => {
    const k = String(_id.who);
    perAssignee[k] = perAssignee[k] || { todo: 0, in_progress: 0, done: 0 };
    perAssignee[k][_id.status] = n;
  });
  res.json({ success: true, data, perAssignee });
};

const load = async (req) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw bad("Task not found", 404);
  const mine = String(task.assignedTo.id) === String(req.user.id);
  if (!mine && !isAdmin(req)) throw bad("Not your task", 403);
  return { task, mine };
};

const update = async (req, res) => {
  const { task, mine } = await load(req);
  if (req.body.status && !STATUSES.includes(req.body.status)) throw bad("Invalid status");
  // Assignees may move status on anything assigned to them; only the creator/admins edit the rest.
  const canEditAll = isAdmin(req) || String(task.createdBy.id) === String(req.user.id);
  const keys = canEditAll ? ["title", "description", "priority", "dueDate", "labels", "status"] : ["status"];
  Object.assign(task, withDone(pick(req.body, keys)));
  await task.save();
  res.json({ success: true, data: task });
};

const remove = async (req, res) => {
  const { task, mine } = await load(req);
  if (task.assignedByAdmin && !isAdmin(req)) throw bad("Tasks assigned by an admin can only be removed by an admin", 403);
  await task.deleteOne();
  res.json({ success: true, message: "Task deleted" });
};

module.exports = { myBoard, createOwn, assign, tracker, update, remove };