const express = require("express");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const sendEmail = require("../utils/mailer");
const Otp = require("../models/Otp");
const {
  protect,
  authorizeRoles,
} = require("../middlewares/adminAuthMiddleware");
const crypto = require("crypto"); // built-in module for generating random passwords
const bcrypt = require("bcrypt");
const Department = require("../models/Department");
const Course = require("../models/Course");
const Teacher = require("../models/Teacher");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const router = express.Router();
const generateToken = (id, expiresIn = "7d") => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn });
};

//A3-RHZ3KG-J8JXCQ-8ML6T-SBQN9-9W6HE-HAQCS
//cXuJlwAb6hZw3Gd9YYCMdyML7zdHVqkk
//OziGIWdqXF-qgIS9n3z9OuREXeOpOR-0ae13zRM0glS8dF5TYxT0Tv5lqalan1t

router.post("/register", async (req, res) => {
  const { email, password, role, firstName, lastName } = req.body;

  try {
    const existing = await Admin.findOne({ email });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Admin already exists" });
    }

    const admin = await Admin.create({
      email,
      password,
      role,
      firstName,
      lastName,
    });

    await sendEmail(
      email,
      "Welcome to Yare",
      "Your admin account has been created."
    );

    res.status(201).json({
      success: true,
      _id: admin._id,
      email: admin.email,
      role: admin.role,
      firstName: admin.firstName,
      lastName: admin.lastName,
      token: generateToken(admin._id),
    });
  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  console.log("Login attempt:", email);

  try {
    const admin = await Admin.findOne({ email });

    if (admin && (await admin.matchPassword(password))) {
      return res.json({
        success: true,
        _id: admin._id,
        email: admin.email,
        role: admin.role,
        token: generateToken(admin._id),
      });
    }

    res
      .status(401)
      .json({ success: false, message: "Invalid email or password" });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  console.log("Forgot password requested for:", email);

  try {
    const admin = await Admin.findOne({ email });
    if (!admin)
      return res
        .status(404)
        .json({ success: false, message: "Admin not found" });

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    const existingOtp = await Otp.findOneAndUpdate(
      { email },
      { otp: otpCode, createdAt: new Date() },
      { upsert: true, new: true }
    );

    await sendEmail(
      email,
      "Your OTP for Password Reset",
      `Your OTP is: ${otpCode}. It expires in 30 minutes.`
    );

    res.status(200).json({ success: true, message: "OTP sent to email." });
  } catch (err) {
    console.error("Forgot password error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/resend-otp", async (req, res) => {
  const { email } = req.body;
  console.log("Resend OTP requested for:", email);

  try {
    const admin = await Admin.findOne({ email });
    if (!admin)
      return res
        .status(404)
        .json({ success: false, message: "Admin not found" });

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    const existingOtp = await Otp.findOneAndUpdate(
      { email },
      { otp: otpCode, createdAt: new Date() },
      { upsert: true, new: true }
    );

    await sendEmail(
      email,
      "Resent OTP for Password Reset",
      `Your new OTP is: ${otpCode}. It expires in 30 minutes.`
    );

    res.status(200).json({ success: true, message: "OTP resent to email." });
  } catch (err) {
    console.error("Resend OTP error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});


router.post("/verify-forgot-password", async (req, res) => {
  const { email, otp } = req.body;
  console.log("OTP verification for:", email, otp);

  try {
    const record = await Otp.findOne({ email, otp });
    if (!record)
      return res.status(400).json({ success: false, message: "Invalid OTP" });

    const resetToken = generateToken(email, "15m");
    res.status(200).json({ success: true, resetToken });
  } catch (err) {
    console.error("OTP verification error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/reset-password", async (req, res) => {
  const { email, password } = req.body;
  const authHeader = req.headers.authorization;
  console.log("Password reset for:", email);

  try {
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.id !== email) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const admin = await Admin.findOne({ email });
    if (!admin)
      return res
        .status(404)
        .json({ success: false, message: "Admin not found" });

    admin.password = password;
    await admin.save();
    await Otp.deleteOne({ email });

    res
      .status(200)
      .json({ success: true, message: "Password reset successful." });
  } catch (err) {
    console.error("Reset password error:", err.message);
    res
      .status(401)
      .json({ success: false, message: "Token expired or invalid." });
  }
});

router.get("/", async (req, res) => {
  try {
    const admins = await Admin.find({ isDeleted: false }).select("-password");
    //console.log("Fetched admins:", admins);

    res.status(200).json({ success: true, data: admins });
  } catch (err) {
    console.error("Get all admins error:", err?.message || err);
    res.status(500).json({
      success: false,
      message: err?.message || "Internal server error",
    });
  }
});

router.get("/:userType/:id", async (req, res) => {
  const { id } = req.params;
  let { userType } = req.params;

  console.log("📥 Incoming Request:", { userType, id });

  if (!userType || typeof userType !== "string") {
    console.log("❌ Invalid or missing userType");
    return res
      .status(400)
      .json({ success: false, message: "Missing or invalid userType" });
  }

  // Normalize userType
  userType = userType.toLowerCase();
  console.log("🔍 Normalized userType:", userType);

  if (userType === "superadmin") {
    console.log("⚠️ userType 'superadmin' treated as 'admin'");
    userType = "admin";
  }

  try {
    let user = null;
    let notFoundMessage = "";

    switch (userType) {
      case "admin":
        console.log("🛠 Fetching from Admin model...");
        user = await Admin.findOne({ _id: id, isDeleted: false }).select("-password");
        notFoundMessage = "Admin not found";
        break;

      case "student":
        console.log("📘 Fetching from Student model...");
        user = await Student.findById(id).select("-password");
        notFoundMessage = "Student not found";
        break;

      case "teacher":
        console.log("📗 Fetching from Teacher model...");
        user = await Teacher.findById(id).select("-password");
        notFoundMessage = "Teacher not found";
        break;

      case "parent":
        console.log("📙 Fetching from Parent model...");
        user = await Parent.findById(id).select("-password");
        notFoundMessage = "Parent not found";
        break;

      default:
        console.log("❌ Unsupported userType:", userType);
        return res.status(400).json({
          success: false,
          message: `Unsupported userType: ${userType}`,
        });
    }

    if (!user) {
      console.log("🚫 User not found:", notFoundMessage);
      return res.status(404).json({ success: false, message: notFoundMessage });
    }

    console.log("✅ User found:", user);
    return res.status(200).json({ success: true, data: user });

  } catch (err) {
    console.error(`❗️Error fetching ${userType} by ID:`, err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/suspend/:id", async (req, res) => {
  const { userType } = req.body;

  if (!userType) {
    return res.status(400).json({
      success: false,
      message: "User type is required (e.g. admin, teacher, student, parent)",
    });
  }

  try {
    let entity;
    let modelName;

    switch (userType.toLowerCase()) {
      case "admin":
        entity = await Admin.findById(req.params.id);
        modelName = "Admin";
        break;
      case "department":
        entity = await Department.findById(req.params.id);
        modelName = "Department";
        break;
      case "course":
        entity = await Course.findById(req.params.id);
        modelName = "Course";
        break;
      case "teacher":
        entity = await Teacher.findById(req.params.id);
        modelName = "Teacher";
        break;
      case "student":
        entity = await Student.findById(req.params.id);
        modelName = "Student";
        break;
      case "parent":
        entity = await Parent.findById(req.params.id);
        modelName = "Parent";
        break;
      default:
        return res.status(400).json({
          success: false,
          message: "Invalid user type",
        });
    }

    if (!entity) {
      return res.status(404).json({
        success: false,
        message: `${modelName} not found`,
      });
    }

    entity.isSuspended = !entity.isSuspended;
    await entity.save();

    return res.status(200).json({
      success: true,
      message: `${modelName} has been ${
        entity.isSuspended ? "suspended" : "unsuspended"
      }.`,
      data: entity,
    });
  } catch (err) {
    console.error("Error toggling suspension:", err.message);
    return res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
});

router.delete("/delete/:id", async (req, res) => {
  const { userType } = req.body;

  if (!userType) {
    return res.status(400).json({
      success: false,
      message: "User type is required (e.g. admin, teacher, student, parent)",
    });
  }

  try {
    let deletedEntity;
    let modelName;

    switch (userType.toLowerCase()) {
      case "admin":
        deletedEntity = await Admin.findByIdAndDelete(req.params.id);
        modelName = "Admin";
        break;
      case "department":
        deletedEntity = await Department.findByIdAndDelete(req.params.id);
        modelName = "Department";
        break;
      case "course":
        deletedEntity = await Course.findByIdAndDelete(req.params.id);
        modelName = "Course";
        break;
      case "teacher":
        deletedEntity = await Teacher.findByIdAndDelete(req.params.id);
        modelName = "Teacher";
        break;
      case "student":
        deletedEntity = await Student.findByIdAndDelete(req.params.id);
        modelName = "Student";
        break;
      case "parent":
        deletedEntity = await Parent.findByIdAndDelete(req.params.id);
        modelName = "Parent";
        break;
      default:
        return res.status(400).json({
          success: false,
          message:
            "Invalid user type. Must be 'admin', 'teacher', 'student', 'parent', 'department', or 'course'",
        });
    }

    if (!deletedEntity) {
      return res.status(404).json({
        success: false,
        message: `${modelName} not found with the provided ID`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `${modelName} deleted successfully.`,
    });
  } catch (err) {
    console.error("Delete error:", err.message);
    return res.status(500).json({
      success: false,
      message: "Server error: " + err.message,
    });
  }
});


router.put("/self-update/:id", async (req, res) => {
  const { email, password, role } = req.body;
  const token = req.headers.authorization?.split(" ")[1];
  console.log("Self-update request for:", req.params.id);

  try {
    if (!token) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.id !== req.params.id) {
      return res
        .status(403)
        .json({ success: false, message: "Forbidden: ID mismatch" });
    }

    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res
        .status(404)
        .json({ success: false, message: "Admin not found" });
    }

    if (email) admin.email = email;
    if (password) admin.password = password;
    if (role) admin.role = role;

    await admin.save();

    res.status(200).json({
      success: true,
      message: "Admin profile updated successfully",
      data: {
        _id: admin._id,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error("Self-update error:", err.message);
    res
      .status(401)
      .json({ success: false, message: "Invalid or expired token" });
  }
});

router.post(
  "/add-admin",
  protect,
  authorizeRoles("superadmin", "admin"),
  async (req, res) => {
    const { email, password, role, firstName, lastName } = req.body;

    try {
      // Validate inputs
      if (!email || !password || !role || !firstName || !lastName) {
        return res.status(400).json({
          success: false,
          message:
            "All fields (email, password, role, firstName, lastName) are required.",
        });
      }

      const existing = await Admin.findOne({ email });
      if (existing) {
        return res
          .status(400)
          .json({ success: false, message: "Admin already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newAdmin = await Admin.create({
        email,
        password: hashedPassword,
        role,
        firstName,
        lastName,
      });

      await sendEmail(
        email,
        "Your Admin Account",
        `An admin account has been created for you.\n\nEmail: ${email}\nPassword: ${password}`
      );

      res.status(201).json({
        success: true,
        message: "Admin added successfully",
        data: {
          _id: newAdmin._id,
          email: newAdmin.email,
          role: newAdmin.role,
          firstName: newAdmin.firstName,
          lastName: newAdmin.lastName,
        },
      });
    } catch (err) {
      console.error("Add admin error:", err.message);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

module.exports = router;
