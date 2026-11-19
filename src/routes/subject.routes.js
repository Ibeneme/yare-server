const express = require("express");
const router = express.Router();
const Subject = require("../models/Subject");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const Teacher = require("../models/Teacher");
const { verifyToken } = require("../services/token.service");

// Utility function to map gradeLevel to structured grades
const mapGrades = (subjects) => {
  return subjects.map((sub) => {
    const grades = sub.gradeLevel?.map((g) => ({
      id: g._id,
      title: g.title,
      description: g.description || "",
    }));
    return {
      ...(typeof sub.toObject === "function" ? sub.toObject() : sub),
      grades,
    };
  });
};

// Admin verification helper using verifyToken
const requireAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    if (!["admin", "superadmin"].includes(decoded.userType)) {
      return res.status(403).json({
        success: false,
        message: "Admin access required",
      });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      error: err.message,
    });
  }
};

// Normalize single ID or array of IDs into unique string IDs
const normalizeIds = (input) => {
  const arr = Array.isArray(input) ? input : input ? [input] : [];
  return [...new Set(arr.map((id) => String(id).trim()).filter(Boolean))];
};

// Helper to fetch and format a single subject with populated teachers, students, and grades
const buildSubjectResponse = async (subjectId) => {
  const subject = await Subject.findById(subjectId)
    .populate("teachers", "firstName lastName email")
    .populate("classes", "name gradeLevel")
    .populate("gradeLevel", "title description");

  if (!subject) return null;

  const enrolledStudents = await Student.find({
    $or: [{ subjects: subjectId }, { _id: { $in: subject.children || [] } }],
  }).select("firstName lastName email gradeId subjects isSubscribed");

  const subjectObj = {
    ...subject.toObject(),
    children: enrolledStudents,
  };

  return mapGrades([subjectObj])[0];
};

// Core handler for adding or removing teachers and/or students on a subject
const handleSubjectMembers = async (req, res, defaultAction = "add") => {
  try {
    const subjectId = req.params.id;
    const action = req.body.action === "remove" ? "remove" : defaultAction;

    const teacherIds = normalizeIds(req.body.teacherIds ?? req.body.teacherId);
    const studentIds = normalizeIds(req.body.studentIds ?? req.body.studentId);

    if (teacherIds.length === 0 && studentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one teacherId/teacherIds or studentId/studentIds",
      });
    }

    const subject = await Subject.findById(subjectId);
    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    let validTeacherIds = [];
    if (teacherIds.length > 0) {
      if (action === "add") {
        const validTeachers = await Teacher.find({
          _id: { $in: teacherIds },
        }).select("_id");
        if (validTeachers.length !== teacherIds.length) {
          return res.status(404).json({
            success: false,
            message: "One or more teacher IDs were not found",
          });
        }
        validTeacherIds = validTeachers.map((t) => t._id);
      } else {
        // When removing, allow removing even if ID is already detached from subject
        validTeacherIds = teacherIds;
      }
    }

    let validStudentIds = [];
    if (studentIds.length > 0) {
      if (action === "add") {
        const validStudents = await Student.find({
          _id: { $in: studentIds },
        }).select("_id");
        if (validStudents.length !== studentIds.length) {
          return res.status(404).json({
            success: false,
            message: "One or more student IDs were not found",
          });
        }
        validStudentIds = validStudents.map((s) => s._id);
      } else {
        validStudentIds = studentIds;
      }
    }

    if (action === "remove") {
      await Subject.findByIdAndUpdate(subjectId, {
        $pull: {
          ...(validTeacherIds.length > 0
            ? { teachers: { $in: validTeacherIds } }
            : {}),
          ...(validStudentIds.length > 0
            ? { children: { $in: validStudentIds } }
            : {}),
        },
      });

      if (validStudentIds.length > 0) {
        await Student.updateMany(
          { _id: { $in: validStudentIds } },
          { $pull: { subjects: subjectId } },
        );
      }
    } else {
      await Subject.findByIdAndUpdate(subjectId, {
        $addToSet: {
          ...(validTeacherIds.length > 0
            ? { teachers: { $each: validTeacherIds } }
            : {}),
          ...(validStudentIds.length > 0
            ? { children: { $each: validStudentIds } }
            : {}),
        },
      });

      if (validStudentIds.length > 0) {
        await Student.updateMany(
          { _id: { $in: validStudentIds } },
          { $addToSet: { subjects: subjectId } },
        );
      }
    }

    const updatedSubject = await buildSubjectResponse(subjectId);

    return res.status(200).json({
      success: true,
      message:
        action === "remove"
          ? "Removed teachers/students from subject successfully"
          : "Added teachers/students to subject successfully",
      action,
      teachersCount: validTeacherIds.length,
      studentsCount: validStudentIds.length,
      data: updatedSubject,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to update subject members",
      error: err.message,
    });
  }
};

// -------------------- ADMIN: ADD / REMOVE TEACHERS OR STUDENTS --------------------
router.post("/:id/members", requireAdmin, (req, res) =>
  handleSubjectMembers(req, res, "add"),
);

router.patch("/:id/members", requireAdmin, (req, res) =>
  handleSubjectMembers(req, res, req.body?.action || "add"),
);

router.put("/:id/members", requireAdmin, (req, res) =>
  handleSubjectMembers(req, res, req.body?.action || "add"),
);

router.delete("/:id/members", requireAdmin, (req, res) =>
  handleSubjectMembers(req, res, "remove"),
);

// Add / remove teachers
router.post("/:id/teachers", requireAdmin, (req, res) =>
  handleSubjectMembers(
    {
      ...req,
      body: {
        teacherIds: req.body.teacherIds ?? req.body.teacherId,
        action: req.body.action === "remove" ? "remove" : "add",
      },
    },
    res,
    req.body?.action === "remove" ? "remove" : "add",
  ),
);

router.post("/:id/teachers/remove", requireAdmin, (req, res) =>
  handleSubjectMembers(
    {
      ...req,
      body: {
        teacherIds: req.body.teacherIds ?? req.body.teacherId,
        action: "remove",
      },
    },
    res,
    "remove",
  ),
);

router.delete("/:id/teachers/:teacherId", requireAdmin, (req, res) =>
  handleSubjectMembers(
    {
      ...req,
      body: {
        teacherIds: [req.params.teacherId],
        action: "remove",
      },
    },
    res,
    "remove",
  ),
);

// Add / remove students
router.post("/:id/students", requireAdmin, (req, res) =>
  handleSubjectMembers(
    {
      ...req,
      body: {
        studentIds: req.body.studentIds ?? req.body.studentId,
        action: req.body.action === "remove" ? "remove" : "add",
      },
    },
    res,
    req.body?.action === "remove" ? "remove" : "add",
  ),
);

router.post("/:id/students/remove", requireAdmin, (req, res) =>
  handleSubjectMembers(
    {
      ...req,
      body: {
        studentIds: req.body.studentIds ?? req.body.studentId,
        action: "remove",
      },
    },
    res,
    "remove",
  ),
);

router.delete("/:id/students/:studentId", requireAdmin, (req, res) =>
  handleSubjectMembers(
    {
      ...req,
      body: {
        studentIds: [req.params.studentId],
        action: "remove",
      },
    },
    res,
    "remove",
  ),
);

// -------------------- CREATE SUBJECT --------------------
router.post("/", async (req, res) => {
  try {
    const { name, code, description, gradeLevel, isActive, teachers } =
      req.body;

    // Check for existing code
    const existing = await Subject.findOne({ code });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Subject code already exists",
      });
    }

    // Create subject
    let newSubject = await Subject.create({
      name,
      code,
      description,
      gradeLevel,
      isActive,
      teachers: Array.isArray(teachers) ? teachers : [], // accept array of teacher IDs
    });

    // Populate gradeLevel for response
    newSubject = await newSubject.populate("gradeLevel", "title description");

    return res.status(201).json({
      success: true,
      message: "Subject created",
      data: mapGrades([newSubject])[0],
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to create subject",
      error: err.message,
    });
  }
});

// -------------------- GET ALL SUBJECTS --------------------
router.get("/", async (req, res) => {
  try {
    const subjects = await Subject.find()
      .populate("teachers", "firstName lastName email")
      .populate("children", "firstName lastName email")
      .populate("classes", "name gradeLevel")
      .populate("gradeLevel", "title description");

    return res.status(200).json({
      success: true,
      data: mapGrades(subjects),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch subjects",
      error: err.message,
    });
  }
});

router.get("/token", async (req, res) => {
  try {
    console.log("🔹 /token route hit");

    // Validate token
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    const fullPopulate = [
      { path: "teachers", select: "firstName lastName email" },
      { path: "children", select: "firstName lastName email" },
      { path: "classes", select: "name gradeLevel" },
      { path: "gradeLevel", select: "title description" },
    ];

    let subjects = [];
    let students = [];

    // ================================
    // 1️⃣ ADMIN / SUPERADMIN
    // ================================
    if (["admin", "superadmin"].includes(decoded.userType)) {
      subjects = await Subject.find().populate(fullPopulate);

      for (const subj of subjects) {
        const subjectStudents = await Student.find({
          subjects: subj._id,
          isSubscribed: true,
        }).select("firstName lastName email gradeId");

        subj.children = subjectStudents;
      }

      return res.status(200).json({
        success: true,
        data: mapGrades(subjects),
        students: [],
      });
    }

    // ================================
    // 2️⃣ PARENT
    // ================================
    if (decoded.userType === "parent") {
      const parent = await Parent.findById(decoded.id).populate({
        path: "children",
        select: "_id subjects firstName lastName email gradeId isSubscribed",
      });

      if (!parent) {
        return res.status(404).json({
          success: false,
          message: "Parent not found",
        });
      }

      const subscribedChildren = await Student.find({
        _id: { $in: parent.children.map((c) => c._id) },
        isSubscribed: true,
      }).populate({
        path: "subjects",
        populate: fullPopulate,
      });

      students = subscribedChildren;
      subjects = subscribedChildren.flatMap((c) => c.subjects || []);

      for (const subj of subjects) {
        const subjectStudents = await Student.find({
          subjects: subj._id,
          isSubscribed: true,
        }).select("firstName lastName email gradeId");

        subj.children = subjectStudents;
      }

      return res.status(200).json({
        success: true,
        data: mapGrades(subjects),
        students,
      });
    }

    // ================================
    // 3️⃣ STUDENT
    // ================================
    if (decoded.userType === "student") {
      const student = await Student.findOne({
        _id: decoded.id,
        isSubscribed: true,
      }).populate({
        path: "subjects",
        populate: fullPopulate,
      });

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found or not subscribed",
        });
      }

      subjects = student.subjects;

      for (const subj of subjects) {
        const subjectStudents = await Student.find({
          subjects: subj._id,
          isSubscribed: true,
        }).select("firstName lastName email gradeId");

        subj.children = subjectStudents;
      }

      return res.status(200).json({
        success: true,
        data: mapGrades(subjects),
        students: [student],
      });
    }

    // ================================
    // 4️⃣ TEACHER
    // ================================
    if (decoded.userType === "teacher") {
      console.log("👨‍🏫 Teacher detected");
      const teacherId = decoded.id;

      subjects = await Subject.find({
        teachers: teacherId,
      }).populate(fullPopulate);

      if (!subjects.length) {
        return res.status(200).json({
          success: true,
          data: [],
          students: [],
          message: "No subjects assigned to this teacher",
        });
      }

      students = [];
      for (const subj of subjects) {
        const subjectStudents = await Student.find({
          subjects: subj._id,
          isSubscribed: true,
        }).select("firstName lastName email subjects gradeId");

        subj.children = subjectStudents;
        students.push(...subjectStudents);
      }

      return res.status(200).json({
        success: true,
        data: mapGrades(subjects),
        students,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Unknown userType",
    });
  } catch (err) {
    console.error("❌ Error:", err);

    if (["JsonWebTokenError", "TokenExpiredError"].includes(err.name)) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
        error: err.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to fetch subjects",
      error: err.message,
    });
  }
});

// -------------------- GET SINGLE SUBJECT --------------------
router.get("/:id", async (req, res) => {
  try {
    const subjectId = req.params.id;
    const formatted = await buildSubjectResponse(subjectId);

    if (!formatted) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch subject",
      error: err.message,
    });
  }
});

// -------------------- UPDATE SUBJECT --------------------
router.put("/:id", async (req, res) => {
  try {
    const { teachers } = req.body;

    let updateData = { ...req.body };
    if (teachers) {
      updateData.teachers = Array.isArray(teachers) ? teachers : [];
    }

    let updated = await Subject.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    updated = await updated.populate("gradeLevel", "title description");

    return res.status(200).json({
      success: true,
      message: "Subject updated",
      data: mapGrades([updated])[0],
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to update subject",
      error: err.message,
    });
  }
});

// -------------------- DELETE SUBJECT --------------------
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Subject.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Subject deleted",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to delete subject",
      error: err.message,
    });
  }
});

// -------------------- FILTER SUBJECTS BY USER ROLE --------------------
router.post("/filter-by-user", async (req, res) => {
  try {
    const { userType, id } = req.body;

    if (!userType || !id) {
      return res.status(400).json({
        success: false,
        message: "userType and id are required",
      });
    }

    let subjects = [];

    if (userType === "admin") {
      subjects = await Subject.find()
        .populate("teachers", "firstName lastName email")
        .populate("children", "firstName lastName email")
        .populate("classes", "name gradeLevel")
        .populate("gradeLevel", "title description");
    } else if (userType === "teacher") {
      subjects = await Subject.find({ teachers: id })
        .populate("teachers", "firstName lastName email")
        .populate("children", "firstName lastName email")
        .populate("classes", "name gradeLevel")
        .populate("gradeLevel", "title description");
    } else if (userType === "student") {
      const student = await Student.findById(id);
      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found",
        });
      }

      subjects = await Subject.find({ _id: { $in: student.subjects } })
        .populate("teachers", "firstName lastName email")
        .populate("children", "firstName lastName email")
        .populate("classes", "name gradeLevel")
        .populate("gradeLevel", "title description");
    } else if (userType === "parent") {
      const parent = await Parent.findById(id).populate("children");

      if (!parent) {
        return res.status(404).json({
          success: false,
          message: "Parent not found",
        });
      }

      const childrenIds = parent.children.map((c) => c._id);

      subjects = await Subject.find({ children: { $in: childrenIds } })
        .populate("teachers", "firstName lastName email")
        .populate("children", "firstName lastName email")
        .populate("classes", "name gradeLevel")
        .populate("gradeLevel", "title description");
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid userType",
      });
    }

    return res.status(200).json({
      success: true,
      data: mapGrades(subjects),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to filter subjects",
      error: err.message,
    });
  }
});

module.exports = router;
