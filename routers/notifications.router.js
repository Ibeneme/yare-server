const express = require("express");
const router = express.Router();
const Notification = require("../models/Notifications");
const { verifyToken } = require("../utils/token");
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
