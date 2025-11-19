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

const models = {
  assignment: Assignment,
  note: Note,
  announcement: Announcement,
};

// -------------------- CREATE RESOURCE --------------------
router.post("/add", async (req, res) => {
  console.log("🔹 POST /add called");
  try {
    const { type, subjectId, title, description } = req.body;
    console.log("📥 Request Body:", { type, subjectId, title, description });

    if (!type || !models[type]) {
      return res.status(400).json({ success: false, message: "Invalid type" });
    }

    const NewItem = new models[type]({ subjectId, title, description });
    const savedItem = await NewItem.save();

    return res.status(201).json({ success: true, data: savedItem });
  } catch (error) {
    console.error("❌ Error creating item:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// -------------------- GET BY TYPE AND SUBJECT --------------------
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

// -------------------- UPDATE RESOURCE --------------------
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

// -------------------- DELETE RESOURCE --------------------
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

// -------------------- GET ALL RESOURCES FOR USER --------------------

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
        parent: true,
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
