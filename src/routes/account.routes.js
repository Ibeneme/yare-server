const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const Teacher = require("../models/Teacher");
const Admin = require("../models/Admin");
const { verifyToken } = require("../services/token.service");
const auth = require("../middlewares/auth.middleware");

const MODELS = { student: Student, parent: Parent, teacher: Teacher, admin: Admin };

/** POST /api/accounts/change-password { currentPassword, newPassword } for any signed-in role. */
router.post("/change-password", auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ success: false, message: "Current and new password are required" });
  if (String(newPassword).length < 8) return res.status(400).json({ success: false, message: "New password must be at least 8 characters" });
  if (newPassword === currentPassword) return res.status(400).json({ success: false, message: "Choose a password you have not used just now" });
  const Model = MODELS[req.user.userType];
  const user = Model && (await Model.findById(req.user.id));
  if (!user) return res.status(404).json({ success: false, message: "Account not found" });
  if (!(await user.matchPassword(currentPassword))) return res.status(400).json({ success: false, message: "Your current password is not correct" });
  user.password = newPassword; // hashed by the model's pre-save hook
  await user.save();
  res.json({ success: true, message: "Password changed" });
});

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided or malformed authorization header",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    if (!decoded || !decoded.id || !decoded.userType) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const { id: userId, userType } = decoded;
    let students = [];

    // ========== IF USER IS A STUDENT ==========
    if (userType === "student") {
      const student = await Student.findById(userId)
        .select("-password")
        .populate("subjects") // <-- populate subjects here
        .lean();

      if (!student) {
        return res
          .status(404)
          .json({ success: false, message: "Student not found" });
      }

      students = [student];
    }

    // ========== IF USER IS A PARENT ==========
    else if (userType === "parent") {
      const parent = await Parent.findById(userId).lean();

      if (!parent) {
        return res
          .status(404)
          .json({ success: false, message: "Parent not found" });
      }

      students = await Student.find({ _id: { $in: parent.children } })
        .select("-password")
        .populate("subjects") // <-- populate subjects here
        .lean();
    }

    // ========== INVALID USER TYPE ==========
    else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user type" });
    }

    return res.status(200).json({
      success: true,
      userType,
      data: students,
    });
  } catch (error) {
    console.error("❌ Error in /accounts/me:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});
// -------------------- UPDATE USER DETAILS --------------------
router.put("/update", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided or malformed authorization header",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    if (!decoded || !decoded.id || !decoded.userType) {
      return res.status(401).json({ success: false, message: "Invalid token" });
    }

    const { id: userId, userType } = decoded;
    const updateData = req.body;

    let updatedUser;
    console.log(updatedUser, "updatedUserupdatedUser");
    if (userType === "student") {
      updatedUser = await Student.findByIdAndUpdate(userId, updateData, {
        new: true,
      }).lean();
      if (!updatedUser)
        return res
          .status(404)
          .json({ success: false, message: "Student not found" });
    } else if (userType === "parent") {
      updatedUser = await Parent.findByIdAndUpdate(userId, updateData, {
        new: true,
      }).lean();
      if (!updatedUser)
        return res
          .status(404)
          .json({ success: false, message: "Parent not found" });
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid user type" });
    }

    return res.status(200).json({ success: true, userType, data: updatedUser });
  } catch (error) {
    console.error("❌ Error in /accounts/update:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
