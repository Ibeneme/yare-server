const crypto = require("crypto");
const mongoose = require("mongoose");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const Grade = require("../models/Grade");
const Subject = require("../models/Subject");
const sendEmail = require("../services/mail.service");
const studentWelcomeEmail = require("../templates/studentWelcomeEmail");

const bad = (m, s = 400) => Object.assign(new Error(m), { status: s });
const SAFE = "-password -reports";

/** Every subject chosen must belong to the ward's grade. */
const validateEnrollment = async (gradeId, subjectIds = []) => {
  if (gradeId) {
    if (!mongoose.Types.ObjectId.isValid(gradeId) || !(await Grade.exists({ _id: gradeId }))) {
      throw bad("Grade not found", 404);
    }
  }
  if (subjectIds.length) {
    const found = await Subject.find({ _id: { $in: subjectIds }, isActive: true }).select("gradeLevel").lean();
    if (found.length !== subjectIds.length) throw bad("One or more subjects do not exist");
    if (gradeId && found.some((s) => !s.gradeLevel.map(String).includes(String(gradeId)))) {
      throw bad("Every subject must be offered in the ward's grade");
    }
  }
};

const syncSubjectChildren = async (studentId, before = [], after = []) => {
  const b = before.map(String);
  const a = after.map(String);
  const removed = b.filter((x) => !a.includes(x));
  const added = a.filter((x) => !b.includes(x));
  await Promise.all([
    removed.length && Subject.updateMany({ _id: { $in: removed } }, { $pull: { children: studentId } }),
    added.length && Subject.updateMany({ _id: { $in: added } }, { $addToSet: { children: studentId } }),
  ]);
};

const listWards = async (req, res) => {
  const data = await Student.find({ parentId: req.user.id })
    .select(SAFE)
    .populate("gradeId", "title")
    .populate("subjects", "name code")
    .lean();
  res.json({ success: true, data });
};

const addWard = async (req, res) => {
  const { firstName, lastName, email, gradeId, subjectIds = [] } = req.body;
  if (!firstName || !lastName || !email) throw bad("firstName, lastName and email are required");
  await validateEnrollment(gradeId, subjectIds);

  const password = crypto.randomBytes(6).toString("base64url");
  const ward = await Student.create({
    firstName,
    lastName,
    email: String(email).toLowerCase().trim(),
    password,
    parentId: req.user.id,
    gradeId: gradeId || null,
    subjects: subjectIds,
  });
  await Parent.findByIdAndUpdate(req.user.id, { $addToSet: { children: ward._id } });
  if (gradeId) await Grade.findByIdAndUpdate(gradeId, { $addToSet: { studentIds: String(ward._id) } });
  await syncSubjectChildren(ward._id, [], subjectIds);

  sendEmail(ward.email, "Welcome to Yare", studentWelcomeEmail({ firstName, email: ward.email, password })).catch((e) =>
    console.error("ward welcome email failed:", e.message)
  );
  const out = await Student.findById(ward._id).select(SAFE).lean();
  res.status(201).json({ success: true, data: out });
};

const ownWard = async (req) => {
  const ward = await Student.findOne({ _id: req.params.id, parentId: req.user.id });
  if (!ward) throw bad("Ward not found", 404);
  return ward;
};

/** Parent edits profile, grade and subject enrollment of one of their wards. */
const updateWard = async (req, res) => {
  const ward = await ownWard(req);
  const { firstName, lastName, gradeId, subjectIds } = req.body;

  const nextGrade = gradeId !== undefined ? gradeId || null : ward.gradeId;
  const nextSubjects = subjectIds !== undefined ? subjectIds : ward.subjects;
  await validateEnrollment(nextGrade, nextSubjects);

  if (gradeId !== undefined && String(ward.gradeId || "") !== String(nextGrade || "")) {
    if (ward.gradeId) await Grade.findByIdAndUpdate(ward.gradeId, { $pull: { studentIds: String(ward._id) } });
    if (nextGrade) await Grade.findByIdAndUpdate(nextGrade, { $addToSet: { studentIds: String(ward._id) } });
    ward.gradeId = nextGrade;
  }
  if (subjectIds !== undefined) {
    await syncSubjectChildren(ward._id, ward.subjects, subjectIds);
    ward.subjects = subjectIds;
  }
  if (firstName) ward.firstName = firstName;
  if (lastName) ward.lastName = lastName;
  await ward.save();
  res.json({ success: true, data: await Student.findById(ward._id).select(SAFE).lean() });
};

const removeWard = async (req, res) => {
  const ward = await ownWard(req);
  await Promise.all([
    Parent.findByIdAndUpdate(req.user.id, { $pull: { children: ward._id } }),
    ward.gradeId && Grade.findByIdAndUpdate(ward.gradeId, { $pull: { studentIds: String(ward._id) } }),
    syncSubjectChildren(ward._id, ward.subjects, []),
  ]);
  await ward.deleteOne();
  res.json({ success: true, message: "Ward removed" });
};

/** Public catalogue a parent picks from: grades and the subjects each offers. */
const catalogue = async (req, res) => {
  const [grades, subjects] = await Promise.all([
    Grade.find().select("title description").lean(),
    Subject.find({ isActive: true }).select("name code gradeLevel").lean(),
  ]);
  res.json({ success: true, data: { grades, subjects } });
};

module.exports = { listWards, addWard, updateWard, removeWard, catalogue };
