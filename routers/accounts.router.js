const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const { verifyToken } = require("../utils/token");

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
