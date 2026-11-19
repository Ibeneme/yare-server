const express = require("express");
const router = express.Router();
const authMw = require("../middlewares/auth.middleware");

// Parent notification preferences ------------------------------------
const PREF_KEYS = ["email", "classReminders", "feeNotices", "awards"];
router.get("/preferences", authMw, authMw.requireRoles("parent"), async (req, res) => {
  const parent = await Parent.findById(req.user.id).select("notificationPrefs children").lean();
  if (!parent) return res.status(404).json({ success: false, message: "Parent not found" });
  const kids = await Student.find({ parentId: req.user.id }).select("firstName lastName").lean();
  const prefs = parent.notificationPrefs || {};
  const wards = kids.map((k) => {
    const p = (prefs.wards || []).find((w) => String(w.studentId) === String(k._id));
    return { studentId: k._id, name: `${k.firstName} ${k.lastName}`, classReminders: p?.classReminders ?? true, joinAlerts: p?.joinAlerts ?? false };
  });
  const g = (k) => prefs[k] ?? true;
  res.json({ success: true, data: { email: g("email"), classReminders: g("classReminders"), feeNotices: g("feeNotices"), awards: g("awards"), wards } });
});

router.put("/preferences", authMw, authMw.requireRoles("parent"), async (req, res) => {
  const set = {};
  for (const k of PREF_KEYS) if (typeof req.body[k] === "boolean") set[`notificationPrefs.${k}`] = req.body[k];
  if (Array.isArray(req.body.wards)) {
    const mine = new Set((await Student.find({ parentId: req.user.id }).select("_id").lean()).map((s) => String(s._id)));
    set["notificationPrefs.wards"] = req.body.wards
      .filter((w) => mine.has(String(w.studentId)))
      .map((w) => ({ studentId: w.studentId, classReminders: w.classReminders !== false, joinAlerts: !!w.joinAlerts }));
  }
  await Parent.findByIdAndUpdate(req.user.id, { $set: set });
  res.json({ success: true, message: "Preferences saved" });
});

const Notification = require("../models/Notifications");
const { verifyToken } = require("../services/token.service");
const Parent = require("../models/Parent");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Admin = require("../models/Admin");

// -----------------------------------------------------
// GET NOTIFICATIONS PER USER
// -----------------------------------------------------
router.get("/", async (req, res) => {
  try {
    console.log("🔹 GET /notifications route hit");

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided or malformed authorization header",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    const userId = decoded.id;
    const userType = decoded.userType;

    console.log("🔍 Fetching notifications for user:", { userId, userType });

    let recipientId = userId;

    // Optional query parameters for filtering / pagination
    const { unreadOnly, limit = 50, page = 1 } = req.query;
    const query = { recipient: recipientId };

    if (unreadOnly === "true") {
      query.isRead = false;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch notifications sorted by newest first
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Count total and unread metrics for the user
    const totalCount = await Notification.countDocuments({
      recipient: recipientId,
    });
    const unreadCount = await Notification.countDocuments({
      recipient: recipientId,
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      userType,
      count: notifications.length,
      totalCount,
      unreadCount,
      data: notifications,
    });
  } catch (err) {
    console.error("❌ Error fetching notifications:", err);

    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
        error: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: err.message,
    });
  }
});

// -----------------------------------------------------
// MARK NOTIFICATION AS READ
// -----------------------------------------------------
router.put("/:id/read", async (req, res) => {
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
    const userId = decoded.id;

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: userId },
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found or unauthorized",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (err) {
    console.error("❌ Failed to update notification status:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update notification",
      error: err.message,
    });
  }
});

// -----------------------------------------------------
// MARK ALL NOTIFICATIONS AS READ FOR USER
// -----------------------------------------------------
router.put("/read-all", async (req, res) => {
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
    const userId = decoded.id;

    await Notification.updateMany(
      { recipient: userId, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (err) {
    console.error("❌ Failed to update all notifications:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update notifications",
      error: err.message,
    });
  }
});

module.exports = router;
