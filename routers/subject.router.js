const express = require("express");
const router = express.Router();
const Subject = require("../models/Subject");
const Student = require("../models/Student");
const Parent = require("../models/Parent");
const Teacher = require("../models/Teacher");
const { verifyToken } = require("../utils/token");

// Utility function to map gradeLevel to structured grades
const mapGrades = (subjects) => {
  return subjects.map((sub) => {
    const grades = sub.gradeLevel?.map((g) => ({
      id: g._id,
      title: g.title,
      description: g.description || "",
    }));
    return {
      ...sub.toObject(),
      grades,
    };
  });
};

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

// ---
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

      // Add children array via students who match subject
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

      // Only subscribed children
      const subscribedChildren = await Student.find({
        _id: { $in: parent.children.map((c) => c._id) },
        isSubscribed: true,
      }).populate({
        path: "subjects",
        populate: fullPopulate,
      });

      students = subscribedChildren;
      subjects = subscribedChildren.flatMap((c) => c.subjects || []);

      // Attach children array for each subject
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

      // Attach children list for each subject
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
    // 4️⃣ TEACHER (FIXED AS REQUESTED)
    // ================================
    if (decoded.userType === "teacher") {
      console.log("👨‍🏫 Teacher detected");
      const teacherId = decoded.id;

      // Subjects teacher is assigned to
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

      // For each subject → get subscribed students whose subject list contains this subject ID
      students = [];
      for (const subj of subjects) {
        const subjectStudents = await Student.find({
          subjects: subj._id, // 👈 MATCH SUBJECT ID
          isSubscribed: true, // 👈 MUST BE SUBSCRIBED
        }).select("firstName lastName email subjects gradeId");

        subj.children = subjectStudents; // 👈 Insert children array

        students.push(...subjectStudents);
      }

      return res.status(200).json({
        success: true,
        data: mapGrades(subjects),
        students,
      });
    }

    // ================================
    // Unknown userType
    // ================================
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

const mapGradess = (subjects) => {
  return subjects.map((sub) => {
    const grades = sub.gradeLevel?.map((g) => ({
      id: g._id,
      title: g.title,
      description: g.description || "",
    }));

    return {
      ...sub,  // <-- NO toObject() needed
      grades,
    };
  });
};

// -------------------- GET SINGLE SUBJECT --------------------
router.get("/:id", async (req, res) => {
  console.log("\n======================================");
  console.log("📌 SUBJECT FETCH ROUTE HIT");
  console.log("======================================");

  try {
    const subjectId = req.params.id;
    console.log("➡️ Extracted subjectId:", subjectId);

    // 1. Find subject
    console.log("\n🔍 Step 1: Fetching Subject...");
    const subject = await Subject.findById(subjectId)
      .populate("teachers", "firstName lastName email")
      .populate("classes", "name gradeLevel")
      .populate("gradeLevel", "title description");

    console.log("✔️ Subject Query Result:", subject);

    if (!subject) {
      console.log("❌ Subject not found in DB");
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    // 2. Find students whose subjects[] contains this subject
    console.log("\n🔍 Step 2: Fetching Students enrolled in this subject...");
    const students = await Student.find({
      subjects: subjectId,
      isSubscribed: true, // Optional filter
    }).select("firstName lastName email gradeId subjects isSubscribed");

    console.log("✔️ Students Found:", students.length);
    console.log("Student Data:", students);

    // 3. Attach students as children
    console.log("\n🔧 Step 3: Attaching students as children...");

    const subjectWithChildren = {
      ...subject.toObject(),
      children: students,
    };

    console.log("📦 Final Subject Object:", subjectWithChildren);

    // 4. Apply mapGrades
    console.log("\n🔄 Step 4: Applying mapGrades transform...");
    const finalData = mapGradess([subjectWithChildren])[0];

    console.log("🎉 FINAL OUTPUT:", finalData);

    return res.status(200).json({
      success: true,
      data: finalData,
    });

  } catch (err) {
    console.log("\n❌ ERROR OCCURRED:");
    console.log(err);

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

    // -------------------- ADMIN --------------------
    if (userType === "admin") {
      subjects = await Subject.find()
        .populate("teachers", "firstName lastName email")
        .populate("children", "firstName lastName email")
        .populate("classes", "name gradeLevel")
        .populate("gradeLevel", "title description");
    }

    // -------------------- TEACHER --------------------
    else if (userType === "teacher") {
      subjects = await Subject.find({ teachers: id })
        .populate("teachers", "firstName lastName email")
        .populate("children", "firstName lastName email")
        .populate("classes", "name gradeLevel")
        .populate("gradeLevel", "title description");
    }

    // -------------------- STUDENT --------------------
    else if (userType === "student") {
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
    }

    // -------------------- PARENT --------------------
    else if (userType === "parent") {
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
    }

    // -------------------- UNKNOWN ROLE --------------------
    else {
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
