const express = require("express");
const router = express.Router();
const Class = require("../models/Class");
const Teacher = require("../models/Teacher");
const Subject = require("../models/Subject");
const { verifyToken } = require("../utils/token");
const Parent = require("../models/Parent");
const Student = require("../models/Student");
const LessonFee = require("../models/LessonFee");

// -------------------- CREATE CLASS --------------------
router.post("/", async (req, res) => {
  try {
    const { title, subjectId, studentIds, teacherId, date, time, duration } =
      req.body;

    const newClass = await Class.create({
      title,
      subjectId,
      studentIds,
      teacherId,
      date,
      time,
      duration,
    });

    // Populate one at a time
    await newClass.populate("subjectId", "name code description");
    await newClass.populate("teacherId", "firstName lastName email");

    return res.status(201).json({
      success: true,
      message: "Class created successfully",
      data: newClass,
    });
  } catch (err) {
    console.error("❌ Failed to create class:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create class",
      error: err.message,
    });
  }
});

router.get("/by-user", async (req, res) => {
  try {
    console.log("🔹 /by-user route hit");

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

    console.log("🔍 Fetching classes for:", { userId, userType });

    let subjectIds = [];
    let classes = [];
    let extra = {}; // Additional return fields for student/parent

    // ---------------- ROLE SWITCH ----------------
    switch (userType) {
      // ================= ADMIN =================
      case "admin":
      case "superadmin":
        classes = await Class.find()
          .populate("subjectId", "name code description")
          .populate("teacherId", "firstName lastName email");
        break;

      // ================= TEACHER =================
      case "teacher": {
        console.log("👨‍🏫 Teacher logic activated");

        // 1️⃣ Find subjects where teacher is assigned
        const teacherSubjects = await Subject.find({
          teachers: userId,
        }).select("_id name code description");

        subjectIds = teacherSubjects.map((subj) => subj._id);

        console.log("📘 Teacher's subjectIds:", subjectIds);

        // 2️⃣ Find classes that match those subjects
        classes = await Class.find({
          subjectId: { $in: subjectIds },
        })
          .populate("subjectId", "name code description")
          .populate("teacherId", "firstName lastName email");

        // Add subjects to response
        extra.subjects = teacherSubjects;
        break;
      }

      // ================= STUDENT =================
      case "student": {
        const student = await Student.findById(userId).populate(
          "subjects",
          "name code description"
        );

        if (!student) {
          return res.status(404).json({
            success: false,
            message: "Student not found",
          });
        }

        if (!student.isSubscribed) {
          return res.status(200).json({
            success: true,
            userType: "student",
            message: "Student is not subscribed",
            subjectIds: [],
            count: 0,
            data: [],
          });
        }

        subjectIds = student.subjects.map((s) => s._id);

        classes = await Class.find({ subjectId: { $in: subjectIds } })
          .populate("subjectId", "name code description")
          .populate("teacherId", "firstName lastName email");

        extra.subjects = student.subjects;
        break;
      }

      // ================= PARENT =================
      case "parent": {
        const parent = await Parent.findById(userId).populate({
          path: "children",
          populate: { path: "subjects", select: "name code description" },
        });

        if (!parent) {
          return res.status(404).json({
            success: false,
            message: "Parent not found",
          });
        }

        // Filter subscribed kids
        const subscribedChildren = parent.children.filter(
          (c) => c.isSubscribed === true
        );

        if (subscribedChildren.length === 0) {
          return res.status(200).json({
            success: true,
            userType: "parent",
            message: "No subscribed children",
            subjectIds: [],
            count: 0,
            data: [],
          });
        }

        subjectIds = subscribedChildren.flatMap((c) =>
          c.subjects.map((s) => s._id)
        );

        classes = await Class.find({ subjectId: { $in: subjectIds } })
          .populate("subjectId", "name code description")
          .populate("teacherId", "firstName lastName email");

        extra.children = subscribedChildren.map((c) => c._id);
        extra.subjects = subscribedChildren.map((c) => ({
          childId: c._id,
          subjects: c.subjects,
        }));
        break;
      }

      default:
        return res.status(400).json({
          success: false,
          message: "Invalid userType",
        });
    }

    // ---------------- CLASS STATUS + COUNTS ----------------
    const now = new Date();

    classes = classes.map((cls) => {
      const classObj = cls.toObject();

      const classStart = new Date(classObj.date);
      const [hours, minutes] = classObj.time.split(":").map(Number);
      classStart.setHours(hours, minutes, 0, 0);

      const classEnd = new Date(
        classStart.getTime() + classObj.duration * 60000
      );

      let status = "upcoming";
      if (now >= classStart && now <= classEnd) status = "ongoing";
      else if (now > classEnd) status = "finished";

      return {
        ...classObj,
        studentCount: classObj.studentIds.length,
        status,
      };
    });

    // ---------------- SUCCESS RESPONSE ----------------
    return res.status(200).json({
      success: true,
      userType,
      subjectIds,
      count: classes.length,
      ...extra,
      data: classes,
    });
  } catch (err) {
    console.error("❌ Error fetching classes:", err);

    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
        error: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to fetch classes",
      error: err.message,
    });
  }
});

// -------------------- GET ALL CLASSES --------------------
router.get("/:subjectId", async (req, res) => {
  try {
    const { subjectId } = req.params; // get from route params

    console.log(subjectId, "subjectIdsubjectIdsubjectId");

    const classes = await Class.find({ subjectId }) // use object for filtering
      .populate("subjectId", "name code description")
      .populate("teacherId", "firstName lastName email");

    return res.status(200).json({
      success: true,
      data: classes,
    });
  } catch (err) {
    console.error("❌ Failed to fetch classes:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch classes",
      error: err.message,
    });
  }
});
// -------------------- GET SINGLE CLASS --------------------
router.get("/:id", async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id)
      .populate("subjectId", "name code description")
      .populate("teacherId", "firstName lastName email");

    if (!classItem) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: classItem,
    });
  } catch (err) {
    console.error("❌ Failed to fetch class:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch class",
      error: err.message,
    });
  }
});

// -------------------- UPDATE CLASS --------------------
router.put("/:id", async (req, res) => {
  try {
    const updatedClass = await Class.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true,
      }
    ).lean(); // optional if you just need a plain JS object

    if (!updatedClass) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    // Populate separately using findById
    const populatedClass = await Class.findById(updatedClass._id)
      .populate("subjectId", "name code description")
      .populate("teacherId", "firstName lastName email");

    return res.status(200).json({
      success: true,
      message: "Class updated successfully",
      data: populatedClass,
    });
  } catch (err) {
    console.error("❌ Failed to update class:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to update class",
      error: err.message,
    });
  }
});

// -------------------- DELETE CLASS --------------------
router.delete("/:id", async (req, res) => {
  try {
    const deletedClass = await Class.findByIdAndDelete(req.params.id);

    if (!deletedClass) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Class deleted successfully",
    });
  } catch (err) {
    console.error("❌ Failed to delete class:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete class",
      error: err.message,
    });
  }
});

// GET lesson fees by user
// GET lesson fees by user
router.get("/lesson-fees/lesson-fees", async (req, res) => {
  try {
    console.log("🔹 /lesson-fees route hit");

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

    console.log("🔍 Fetching lesson fees for:", { userId, userType });

    let lessonFees = [];

    switch (userType) {
      case "superadmin":
      case "admin":
        // Return all lesson fees with FULL student schema
        lessonFees = await LessonFee.find()
          .populate("studentId") // ⬅ RETURN ENTIRE STUDENT OBJECT
          .sort({ createdAt: -1 })
          .exec();
        console.log(lessonFees, "lessonFees");
        break;

      case "parent": {
        const parent = await Parent.findById(userId).populate("children");
        if (!parent) {
          return res.status(404).json({
            success: false,
            message: "Parent not found",
          });
        }

        const childrenIds = parent.children.map((c) => c._id);

        lessonFees = await LessonFee.find({
          studentId: { $in: childrenIds },
        })
          .populate("studentId") // ⬅ FULL STUDENT DETAILS
          .sort({ createdAt: -1 })
          .exec();

        break;
      }

      case "student":
        lessonFees = await LessonFee.find({ studentId: userId })
          .populate("studentId") // ⬅ FULL STUDENT DETAILS
          .sort({ createdAt: -1 })
          .exec();
        break;

      default:
        return res.status(400).json({
          success: false,
          message: "Invalid userType",
        });
    }

    return res.status(200).json({
      success: true,
      userType,
      count: lessonFees.length,
      data: lessonFees,
    });
  } catch (err) {
    console.error("❌ Error fetching lesson fees:", err);

    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
        error: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to fetch lesson fees",
      error: err.message,
    });
  }
});

module.exports = router;
