const Admin = require("../models/Admin");
const Teacher = require("../models/Teacher");
const { transferSuperAdmin } = require("../services/superAdmin.service");
const { generateToken } = require("../services/token.service");
const sendEmail = require("../services/mail.service");

const listAdmins = async (req, res) => {
  const data = await Admin.find({ isDeleted: { $ne: true } })
    .select("-password")
    .sort({ createdAt: -1 })
    .lean();
  res.json({ success: true, data });
};

const setSuspended = async (req, res) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
  if (admin.role === "superadmin") {
    return res.status(400).json({ success: false, message: "The Super Admin cannot be suspended" });
  }
  admin.isSuspended = Boolean(req.body.suspended);
  await admin.save();
  res.json({ success: true, data: { _id: admin._id, isSuspended: admin.isSuspended } });
};

const removeAdmin = async (req, res) => {
  const admin = await Admin.findById(req.params.id);
  if (!admin) return res.status(404).json({ success: false, message: "Admin not found" });
  if (admin.role === "superadmin") {
    return res.status(400).json({ success: false, message: "Transfer Super Admin status before removing this account" });
  }
  admin.isDeleted = true;
  admin.deletedAt = new Date();
  await admin.save();
  res.json({ success: true, message: "Admin removed" });
};

const transfer = async (req, res) => {
  const { teacherId } = req.body;
  const { newSuperAdmin, previousSuperAdmin } = await transferSuperAdmin({
    currentSuperAdminId: req.user.id,
    teacherId,
  });
  res.json({
    success: true,
    message: "Super Admin status transferred. You are now a regular admin.",
    data: {
      newSuperAdmin: { _id: newSuperAdmin._id, email: newSuperAdmin.email },
      previousSuperAdmin: { _id: previousSuperAdmin._id, email: previousSuperAdmin.email, role: previousSuperAdmin.role },
    },
    // fresh token reflecting the demotion
    token: generateToken(previousSuperAdmin._id, "admin", undefined, { role: previousSuperAdmin.role }),
  });
};

const eligibleTeachers = async (req, res) => {
  const data = await Teacher.find({ isSuspended: { $ne: true } })
    .select("firstName lastName email")
    .sort({ firstName: 1 })
    .lean();
  res.json({ success: true, data });
};

const createAdmin = async (req, res) => {
  const { email, password, role = "admin", firstName, lastName } = req.body;
  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ success: false, message: "email, password, firstName and lastName are required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
  }
  if (!["admin", "superadmin"].includes(role)) {
    return res.status(400).json({ success: false, message: "role must be admin or superadmin" });
  }
  if (role === "superadmin") {
    return res.status(400).json({
      success: false,
      message: "There is one Super Admin. Use POST /api/super-admin/transfer to hand the role to a teacher.",
    });
  }
  const normalized = String(email).toLowerCase().trim();
  if (await Admin.findOne({ email: normalized })) {
    return res.status(409).json({ success: false, message: "An admin with this email already exists" });
  }
  const admin = await Admin.create({ email: normalized, password, role: "admin", userType: "admin", firstName, lastName });
  sendEmail(normalized, "Your Yare admin account", `<p>Hello ${firstName}, an admin account was created for you on Yare. Your password was shared by the Super Admin; please change it after signing in.</p>`).catch(() => {});
  res.status(201).json({ success: true, data: { _id: admin._id, email: admin.email, role: admin.role, firstName, lastName } });
};

module.exports = {
  createAdmin, listAdmins, setSuspended, removeAdmin, transfer, eligibleTeachers };
