const express = require("express");
const router = express.Router();
const { Assignment, Note, Announcement } = require("../models/Resource");
const Class = require("../models/Class");
const authMiddleware = require("../middlewares/authMiddleware");
const Student = require("../models/Student");
const { verifyToken } = require("../utils/token");
const Subject = require("../models/Subject");
const Parent = require("../models/Parent");
const Teacher = require("../models/Teacher");
const Admin = require("../models/Admin"); // make sure you have this model
const createAndSendNotification = require("../utils/createAndSendNotification");

const models = {
  assignment: Assignment,
  note: Note,
  announcement: Announcement,
};

// ======================================================
// HELPER: Send notifications + emails to everyone related to a subject
// ======================================================
const notifySubjectStakeholders = async ({
  subjectId,
  type, // "assignment" | "note" | "announcement"
  title,
  description,
  resourceId,
  senderId = null,
  senderModel = null,
}) => {
  try {
    // 1. Get the subject
    const subject = await Subject.findById(subjectId)
      .populate("teachers", "firstName lastName email")
      .lean();

    if (!subject) {
      console.warn("Subject not found for notifications:", subjectId);
      return;
    }

    const notifTitle = `New ${
      type.charAt(0).toUpperCase() + type.slice(1)
    }: ${title}`;
    const notifDescription =
      description || `A new ${type} has been posted in ${subject.name}.`;

    // --------------------------------------------------
    // 2. Students enrolled in this subject (isSubscribed = true)
    // --------------------------------------------------
    const students = await Student.find({
      subjects: subjectId,
      isSubscribed: true,
    })
      .select("_id firstName lastName email parentId")
      .lean();

    console.log(
      `📢 Notifying ${students.length} students for subject ${subject.name}`
    );

    for (const student of students) {
      // Notify Student
      await createAndSendNotification({
        title: notifTitle,
        description: notifDescription,
        recipientId: student._id,
        recipientModel: "Student",
        email: student.email,
        emailSubject: notifTitle,
        type,
        relatedId: resourceId,
        senderId,
        senderModel,
        meta: { subjectId, subjectName: subject.name },
      });

      // Notify Parent of this student
      if (student.parentId) {
        const parent = await Parent.findById(student.parentId)
          .select("_id firstName lastName email")
          .lean();

        if (parent) {
          await createAndSendNotification({
            title: notifTitle,
            description: `Your child ${student.firstName} has a new ${type} in ${subject.name}: ${title}`,
            recipientId: parent._id,
            recipientModel: "Parent",
            email: parent.email,
            emailSubject: notifTitle,
            type,
            relatedId: resourceId,
            senderId,
            senderModel,
            meta: {
              subjectId,
              subjectName: subject.name,
              studentId: student._id,
              studentName: `${student.firstName} ${student.lastName}`,
            },
          });
        }
      }
    }

    // --------------------------------------------------
    // 3. Teachers of this subject
    // --------------------------------------------------
    const teachers = subject.teachers || [];
    console.log(`📢 Notifying ${teachers.length} teachers`);

    for (const teacher of teachers) {
      // Skip if this teacher is the one who created it
      if (senderId && teacher._id.toString() === senderId.toString()) continue;

      await createAndSendNotification({
        title: notifTitle,
        description: notifDescription,
        recipientId: teacher._id,
        recipientModel: "Teacher",
        email: teacher.email,
        emailSubject: notifTitle,
        type,
        relatedId: resourceId,
        senderId,
        senderModel,
        meta: { subjectId, subjectName: subject.name },
      });
    }

    // --------------------------------------------------
    // 4. All Admins
    // --------------------------------------------------
    const admins = await Admin.find()
      .select("_id firstName lastName email")
      .lean();
    console.log(`📢 Notifying ${admins.length} admins`);

    for (const admin of admins) {
      await createAndSendNotification({
        title: notifTitle,
        description: `${notifDescription} (Subject: ${subject.name})`,
        recipientId: admin._id,
        recipientModel: "Admin",
        email: admin.email,
        emailSubject: notifTitle,
        type,
        relatedId: resourceId,
        senderId,
        senderModel,
        meta: { subjectId, subjectName: subject.name },
      });
    }

    console.log("✅ All notifications + emails sent successfully");
  } catch (err) {
    console.error("❌ Error while sending notifications:", err.message);
    // We don't throw – notification failure should not break the main create flow
  }
};

// ======================================================
// CREATE RESOURCE + SEND NOTIFICATIONS
// ======================================================
router.post("/add", async (req, res) => {
  console.log("🔹 POST /add called");
  try {
    const { type, subjectId, title, description } = req.body;
    console.log("📥 Request Body:", { type, subjectId, title, description });

    if (!type || !models[type]) {
      return res.status(400).json({ success: false, message: "Invalid type" });
    }

    if (!subjectId || !title) {
      return res.status(400).json({
        success: false,
        message: "subjectId and title are required",
      });
    }

    // Optional: get the creator from token (recommended)
    let senderId = null;
    let senderModel = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.split(" ")[1];
        const decoded = verifyToken(token);
        senderId = decoded.id;
        senderModel =
          decoded.userType === "superadmin"
            ? "Admin"
            : decoded.userType.charAt(0).toUpperCase() +
              decoded.userType.slice(1);
      } catch (e) {
        // token optional for now
      }
    }

    // 1. Create the resource
    const NewItem = new models[type]({
      subjectId,
      title,
      description,
    });
    const savedItem = await NewItem.save();

    // 2. Send notifications + emails (non-blocking)
    // We fire and forget so the response is fast
    notifySubjectStakeholders({
      subjectId,
      type,
      title,
      description,
      resourceId: savedItem._id,
      senderId,
      senderModel,
    }).catch((err) => console.error("Notification background error:", err));

    return res.status(201).json({
      success: true,
      message: `${type} created and notifications are being sent`,
      data: savedItem,
    });
  } catch (error) {
    console.error("❌ Error creating item:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ======================================================
// GET BY TYPE AND SUBJECT
// ======================================================
router.post("/get", async (req, res) => {
  console.log("🔹 POST /get called");
  try {
    const { type, subjectId } = req.body;
    console.log("📥 Request Body:", { type, subjectId });

    if (!type || !models[type]) {
      return res.status(400).json({ success: false, message: "Invalid type" });
    }

    const items = await models[type]
      .find({ subjectId })
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: items });
  } catch (error) {
    console.error("❌ Error fetching items:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ======================================================
// UPDATE RESOURCE
// ======================================================
router.put("/update", async (req, res) => {
  console.log("🔹 PUT /update called");
  try {
    const { type, _id, title, description } = req.body;
    if (!type || !models[type]) {
      return res.status(400).json({ success: false, message: "Invalid type" });
    }

    const updated = await models[type].findByIdAndUpdate(
      _id,
      { title, description },
      { new: true }
    );

    if (!updated) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (error) {
    console.error("❌ Error updating item:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ======================================================
// DELETE RESOURCE
// ======================================================
router.delete("/delete", async (req, res) => {
  console.log("🔹 DELETE /delete called");
  try {
    const { type, _id } = req.body;
    if (!type || !models[type]) {
      return res.status(400).json({ success: false, message: "Invalid type" });
    }

    const deleted = await models[type].findByIdAndDelete(_id);
    if (!deleted) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });
    }

    return res
      .status(200)
      .json({ success: true, message: "Deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting item:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ======================================================
// GET ALL RESOURCES FOR USER
// ======================================================
router.get("/getall-resources/getall-resources", async (req, res) => {
  try {
    // ---------------- AUTH ----------------
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

    // ---------------- HELPER ----------------
    const fetchResourcesWithSubject = async (subjectIds) => {
      const subjects = await Subject.find({ _id: { $in: subjectIds } }).lean();

      const [assignments, notes, announcements] = await Promise.all([
        Assignment.find({ subjectId: { $in: subjectIds } }).lean(),
        Note.find({ subjectId: { $in: subjectIds } }).lean(),
        Announcement.find({ subjectId: { $in: subjectIds } }).lean(),
      ]);

      return subjects.map((subj) => ({
        subjectId: subj._id.toString(),
        name: subj.name,
        code: subj.code,
        resources: {
          assignments: assignments.filter(
            (a) => a.subjectId.toString() === subj._id.toString()
          ),
          notes: notes.filter(
            (n) => n.subjectId.toString() === subj._id.toString()
          ),
          announcements: announcements.filter(
            (an) => an.subjectId.toString() === subj._id.toString()
          ),
        },
      }));
    };

    // ---------------- ADMIN ----------------
    if (userType === "admin" || userType === "superadmin") {
      const subjects = await Subject.find().lean();
      const subjectIds = subjects.map((s) => s._id);

      const resources = await fetchResourcesWithSubject(subjectIds);

      return res.status(200).json({
        success: true,
        admin: true,
        data: [
          {
            adminId: userId,
            adminName: "All Subjects",
            data: resources,
          },
        ],
      });
    }

    // ---------------- STUDENT ----------------
    if (userType === "student") {
      const student = await Student.findById(userId).lean();
      if (!student) {
        return res
          .status(404)
          .json({ success: false, message: "Student not found" });
      }

      const subjectIds = student.subjects || student.courses || [];
      const resources = await fetchResourcesWithSubject(subjectIds);

      return res.status(200).json({
        success: true,
        student: true,
        data: [
          {
            childId: student._id,
            childName: "New Updates",
            data: resources,
          },
        ],
      });
    }

    // ---------------- PARENT ----------------
    if (userType === "parent") {
      const parent = await Parent.findById(userId).populate("children").lean();
      if (!parent || parent.children.length === 0) {
        return res.status(200).json({
          success: true,
          parent: true,
          data: [],
        });
      }

      const formattedChildren = await Promise.all(
        parent.children.map(async (child) => {
          const subjectIds = child.subjects || child.courses || [];
          const resources = await fetchResourcesWithSubject(subjectIds);

          return {
            childId: child._id,
            childName: `${child.firstName} ${child.lastName}`,
            data: resources,
          };
        })
      );

      return res.status(200).json({
        success: true,
        parent: true,
        data: formattedChildren,
      });
    }

    // ---------------- TEACHER ----------------
    if (userType === "teacher") {
      const teacher = await Teacher.findById(userId).lean();
      if (!teacher) {
        return res.status(404).json({
          success: false,
          message: "Teacher not found",
        });
      }

      const subjectsTaught = await Subject.find({
        teachers: teacher._id.toString(),
      }).lean();

      const subjectIds = subjectsTaught.map((s) => s._id);
      const resources = await fetchResourcesWithSubject(subjectIds);

      return res.status(200).json({
        success: true,
        teacher: true,
        data: [
          {
            childId: teacher._id,
            childName: `${teacher.firstName} ${teacher.lastName}`,
            data: resources,
          },
        ],
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid user type",
    });
  } catch (error) {
    console.error("❌ Error in /getall-resources:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
});

module.exports = router;
