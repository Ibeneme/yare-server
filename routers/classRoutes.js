const express = require("express");
const mongoose = require("mongoose");

const Class = require("../models/Class");
const Teacher = require("../models/Teacher");
const Course = require("../models/Course");
// Removed 'checkRole' from the import statement as it's no longer used here.
const authMiddleware = require("../middlewares/authMiddleware");
const Parent = require("../models/Parent");
const Student = require("../models/Student");
const router = express.Router();

// Use express.json() for this router
router.use(express.json());

// --- Helper Functions for Consistent Responses ---

const ApiResponse = (res, statusCode, message, data = null) => {
  const success = statusCode >= 200 && statusCode < 300;
  res.status(statusCode).json({ success, message, data });
};

const handleServerError = (
  res,
  error,
  message = "An unexpected server error occurred"
) => {
  console.error(`[Server Error] ${message}:`, error.message);
  ApiResponse(res, 500, message, { error: error.message });
};

const validateObjectId = (id, res) => {
  // Removed 'next' as it's not used here
  if (!mongoose.Types.ObjectId.isValid(id)) {
    ApiResponse(res, 400, "Invalid ID format");
    return false;
  }
  return true;
};

// --- Middleware for Role-Based Access Control (Removed checkAdminRole constant) ---
// The checkRole constant and its usage are removed as requested.

// GET all classes
// Removed checkAdminRole from this route


// GET all teachers
router.get('/dashboard-teachers', authMiddleware, async (req, res) => {
  try {
    const teachers = await Teacher.find().lean();

    if (!teachers || teachers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No teachers found',
      });
    }

    // Optionally sanitize the data
    const sanitizedTeachers = teachers.map((t) => ({
      _id: t._id,
      name: `${t.firstName} ${t.lastName}`,
      email: t.email,
      certifications: t.certifications || [],
      courseIds: t.courseIds || [],
      createdAt: t.createdAt,
      isSuspended: t.isSuspended || false,
    }));

    return res.status(200).json({
      success: true,
      data: sanitizedTeachers,
    });
  } catch (error) {
    console.error('🔥 Error fetching teachers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch teachers',
      error: error.message,
    });
  }
});



router.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const { id: userId, userType } = req.user;

    console.log("➡️ Entered /dashboard route");
    console.log("🔹 userId:", userId, "userType:", userType);

    const computeStatus = (cls) => {
      const classDate = new Date(cls.date);
      const [hours, minutes] = cls.time.split(":").map(Number);
      classDate.setHours(hours, minutes, 0, 0);

      const startTime = classDate.getTime();
      const endTime = startTime + cls.duration * 60 * 1000;
      const now = Date.now();

      if (now < startTime) return "upcoming";
      if (now >= startTime && now <= endTime) return "ongoing";
      return "finished";
    };

    // Helper to fetch full course details
    const fetchCourseDetails = async (courseIds) => {
      const courses = await Promise.all(
        courseIds.map(async (id) => await Course.findById(id).lean())
      );
      return courses.filter(Boolean);
    };

    if (userType === "teacher") {
      const teacher = await Teacher.findById(userId).lean();
      if (!teacher) return res.status(404).json({ message: "Teacher not found" });

      console.log("👩‍🏫 Teacher courses IDs:", teacher.courseIds);

      const classes = await Class.find({ courseId: { $in: teacher.courseIds } })
        .populate({ path: "studentIds", select: "firstName lastName email" })
        .lean();

      const formattedClasses = await Promise.all(
        classes.map(async (cls) => ({
          ...cls,
          status: computeStatus(cls),
          course: await Course.findById(cls.courseId).lean(), // Fetch full course
          students: cls.studentIds?.map((s) => ({
            _id: s._id,
            name: `${s.firstName} ${s.lastName}`,
            email: s.email,
          })) || [],
        }))
      );

      return res.status(200).json({
        success: true,
        teacher: {
          _id: teacher._id,
          name: `${teacher.firstName} ${teacher.lastName}`,
          email: teacher.email,
          certifications: teacher.certifications || [],
          courses: await fetchCourseDetails(teacher.courseIds),
          classes: formattedClasses,
        },
      });
    }

    if (userType === "student") {
      const student = await Student.findById(userId).lean();
      if (!student) return res.status(404).json({ message: "Student not found" });

      console.log("🎓 Student courses:", student.courses);

      const classes = await Class.find({ courseId: { $in: student.courses } })
        .populate({ path: "teacherId", select: "firstName lastName email" })
        .lean();

      const formattedClasses = await Promise.all(
        classes.map(async (cls) => ({
          ...cls,
          status: computeStatus(cls),
          course: await Course.findById(cls.courseId).lean(), // Fetch full course
          teacher: cls.teacherId
            ? {
                _id: cls.teacherId._id,
                name: `${cls.teacherId.firstName} ${cls.teacherId.lastName}`,
                email: cls.teacherId.email,
              }
            : null,
        }))
      );

      return res.status(200).json({
        success: true,
        student: {
          _id: student._id,
          name: `${student.firstName} ${student.lastName}`,
          email: student.email,
          courses: await fetchCourseDetails(student.courses),
          classes: formattedClasses,
        },
      });
    }

    if (userType === "parent") {
      const children = await Student.find({ parentId: userId }).lean();
      if (!children || children.length === 0)
        return res.status(404).json({ message: "No children found" });

      const childrenWithClasses = await Promise.all(
        children.map(async (child) => {
          const classes = await Class.find({ courseId: { $in: child.courses } })
            .populate({ path: "teacherId", select: "firstName lastName email" })
            .lean();

          const formattedClasses = await Promise.all(
            classes.map(async (cls) => ({
              ...cls,
              status: computeStatus(cls),
              course: await Course.findById(cls.courseId).lean(), // Fetch full course
              teacher: cls.teacherId
                ? {
                    _id: cls.teacherId._id,
                    name: `${cls.teacherId.firstName} ${cls.teacherId.lastName}`,
                    email: cls.teacherId.email,
                  }
                : null,
            }))
          );

          return {
            _id: child._id,
            name: `${child.firstName} ${child.lastName}`,
            email: child.email,
            courses: await fetchCourseDetails(child.courses),
            classes: formattedClasses,
          };
        })
      );

      return res.status(200).json({
        success: true,
        parent: {
          _id: userId,
          children: childrenWithClasses,
        },
      });
    }

    return res.status(403).json({ message: "Unauthorized user type" });
  } catch (error) {
    console.error("🔥 Error in /dashboard route:", error);
    return res.status(500).json({ message: "Failed to fetch dashboard data", error });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType;

    console.log("➡️ Entered /classes route");
    console.log("🔹 userId:", userId);
    console.log("🔹 userType:", userType);

    // 🔹 Helper to compute status
    const computeStatus = (classItem) => {
      const classDate = new Date(classItem.date);
      const [hours, minutes] = classItem.time.split(":").map(Number);
      classDate.setHours(hours, minutes, 0, 0);

      const startTime = classDate.getTime();
      const endTime = startTime + classItem.duration * 60 * 1000;
      const now = Date.now();

      if (now < startTime) return "upcoming";
      if (now >= startTime && now <= endTime) return "ongoing";
      return "finished";
    };

    // 👩‍🏫 TEACHER
    if (userType === "teacher") {
      const classes = await Class.find({ teacherId: userId })
        .populate({ path: "teacherId", select: "firstName lastName" })
        .populate({ path: "courseId", select: "title name" })
        .lean();

      const withStatus = classes.map((c) => ({ ...c, status: computeStatus(c) }));
      return ApiResponse(res, 200, "Teacher classes fetched successfully", withStatus);
    }

    // 🎓 STUDENT
    if (userType === "student") {
      const student = await Student.findById(userId).lean();

      if (!student) {
        return ApiResponse(res, 404, "Student not found");
      }

      if (!student.courses || student.courses.length === 0) {
        return ApiResponse(res, 200, "No courses enrolled yet", []);
      }

      console.log("📦 Student enrolled course IDs:", student.courses);

      // ✅ Fetch all classes linked to student's courses
      const classes = await Class.find({ courseId: { $in: student.courses } })
        .populate({ path: "teacherId", select: "firstName lastName" })
        .populate({ path: "courseId", select: "title name" })
        .lean();

      const withStatus = classes.map((c) => ({ ...c, status: computeStatus(c) }));

      console.log("✅ Student classes with status:", withStatus);
      return ApiResponse(res, 200, "Student classes fetched successfully", withStatus);
    }

    // 👨‍👩‍👧 PARENT
    if (userType === "parent") {
      const children = await Student.find({ parentId: userId })
        .populate({ path: "courses", select: "title _id" })
        .lean();

      if (!children || children.length === 0) {
        return ApiResponse(res, 404, "No children found for this parent");
      }

      const result = children.map((child) => ({
        studentId: child._id,
        studentName: `${child.firstName} ${child.lastName}`,
        courses: child.courses.map((course) => ({
          _id: course._id,
          title: course.title,
        })),
      }));

      return ApiResponse(res, 200, "Parent children courses fetched successfully", result);
    }

    // 🛠️ ADMIN
    if (userType === "admin") {
      const classes = await Class.find()
        .populate({ path: "teacherId", select: "firstName lastName" })
        .populate({ path: "courseId", select: "title name" })
        .lean();

      const withStatus = classes.map((c) => ({ ...c, status: computeStatus(c) }));
      return ApiResponse(res, 200, "All classes fetched successfully", withStatus);
    }

    return ApiResponse(res, 403, "Unauthorized user type");
  } catch (error) {
    console.error("🔥 Error in /classes route:", error);
    handleServerError(res, error, "Failed to fetch classes");
  }
});

const computeStatus = (classItem) => {
  const classDate = new Date(classItem.date);
  const [hours, minutes] = classItem.time.split(":").map(Number);

  classDate.setHours(hours, minutes, 0, 0);

  const startTime = classDate.getTime();
  const endTime = startTime + classItem.duration * 60 * 1000;
  const now = Date.now();

  if (now < startTime) return "upcoming";
  if (now >= startTime && now <= endTime) return "ongoing";
  return "finished";
};

// ================= TEACHER CLASSES =================
router.get("/teacher/:teacherId", authMiddleware, async (req, res) => {
  try {
    const teacherId = req.params.teacherId;
    console.log("➡️ Entered /classes/teacher/:teacherId route");
    console.log("🔹 teacherId:", teacherId);

    const classes = await Class.find({ teacherId })
      .populate({ path: "teacherId", select: "firstName lastName" })
      .populate({ path: "courseId", select: "title name" })
      .populate({ path: "studentIds", select: "firstName lastName email" })
      .lean();

    if (!classes || classes.length === 0) {
      return ApiResponse(res, 404, "No classes found for this teacher");
    }

    const withStudents = await Promise.all(
      classes.map(async (cls) => {
        // 🔹 FIX: use cls.courseId._id instead of cls.courseId
        const enrolledStudents = await Student.find({
          courses: cls.courseId?._id,
        })
          .select("firstName lastName email")
          .lean();

        return {
          ...cls,
          status: computeStatus(cls),
          students:
            cls.studentIds?.map((s) => ({
              _id: s._id,
              name: `${s.firstName} ${s.lastName}`,
              email: s.email,
            })) || [],
          enrolledStudents:
            enrolledStudents.map((s) => ({
              _id: s._id,
              name: `${s.firstName} ${s.lastName}`,
              email: s.email,
            })) || [],
        };
      })
    );

    console.log("✅ Teacher classes with students + enrolled:", withStudents);
    return ApiResponse(
      res,
      200,
      "Teacher classes with students and enrolled students fetched successfully",
      withStudents
    );
  } catch (error) {
    console.error("🔥 Error in /classes/teacher/:teacherId route:", error);
    return ApiResponse(res, 500, "Failed to fetch teacher classes with students");
  }
});

// GET a class by ID
// Removed checkAdminRole from this route
router.get("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  if (!validateObjectId(id, res)) return;

  try {
    const classItem = await Class.findById(id)
      .populate({ path: "teacherId", select: "firstName lastName" })
      .populate({ path: "courseId", select: "title name" })
      .lean();

    if (!classItem) {
      return ApiResponse(res, 404, "Class not found");
    }

    ApiResponse(res, 200, "Class fetched successfully", classItem);
  } catch (error) {
    handleServerError(res, error, "Failed to fetch class");
  }
});

// CREATE a new class
// Removed checkAdminRole from this route
router.post("/", authMiddleware, async (req, res) => {
  // Check if the user is an admin

  console.log(req.user.userType);

  if (req.user.userType !== "admin") {
    return ApiResponse(
      res,
      403,
      "Access denied. Only an admin can create a class."
    );
  }

  try {
    const { title, course, courseId, teacherId, date, time, duration, status } =
      req.body;

    const requiredFields = {
      title,
      course,
      courseId,
      teacherId,
      date,
      time,
      duration,
    };
    const missingFields = Object.entries(requiredFields).filter(
      ([_, value]) => !value
    );

    if (missingFields.length > 0) {
      return ApiResponse(
        res,
        400,
        `Missing required fields: ${missingFields
          .map(([key]) => key)
          .join(", ")}`
      );
    }

    if (!validateObjectId(courseId, res) || !validateObjectId(teacherId, res))
      return;

    const [courseExists, teacherExists] = await Promise.all([
      Course.findById(courseId),
      Teacher.findById(teacherId),
    ]);

    if (!courseExists) return ApiResponse(res, 404, "Course not found");
    if (!teacherExists) return ApiResponse(res, 404, "Teacher not found");

    const newClass = new Class({
      title,
      course,
      courseId,
      teacherId,
      date: new Date(date),
      time,
      duration,
      status: status || "upcoming",
    });

    const savedClass = await newClass.save();

    const populatedClass = await Class.findById(savedClass._id)
      .populate({ path: "teacherId", select: "firstName lastName" })
      .populate({ path: "courseId", select: "title name" })
      .lean();

    ApiResponse(res, 201, "Class created successfully", populatedClass);
  } catch (error) {
    handleServerError(res, error, "Error creating class");
  }
});

// UPDATE a class
router.put("/:id", authMiddleware, async (req, res) => {
  // Check if the user is an admin
  if (req.user.userType !== "admin") {
    return ApiResponse(
      res,
      403,
      "Access denied. Only an admin can update a class."
    );
  }

  const { id } = req.params;
  const updateData = req.body;

  if (!validateObjectId(id, res)) return;

  try {
    if (updateData.date) updateData.date = new Date(updateData.date);

    if (updateData.courseId && !(await Course.findById(updateData.courseId))) {
      return ApiResponse(res, 404, "Course not found");
    }

    if (
      updateData.teacherId &&
      !(await Teacher.findById(updateData.teacherId))
    ) {
      return ApiResponse(res, 404, "Teacher not found");
    }

    const updatedClass = await Class.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate({ path: "teacherId", select: "firstName lastName" })
      .populate({ path: "courseId", select: "title name" })
      .lean();

    if (!updatedClass) {
      return ApiResponse(res, 404, "Class not found");
    }

    ApiResponse(res, 200, "Class updated successfully", updatedClass);
  } catch (error) {
    handleServerError(res, error, "Failed to update class");
  }
});

// DELETE a class
router.delete("/:id", authMiddleware, async (req, res) => {
  // Check if the user is an admin
  if (req.user.userType !== "admin") {
    return ApiResponse(
      res,
      403,
      "Access denied. Only an admin can delete a class."
    );
  }

  const { id } = req.params;
  if (!validateObjectId(id, res)) return;

  try {
    const deletedClass = await Class.findByIdAndDelete(id);

    if (!deletedClass) {
      return ApiResponse(res, 404, "Class not found");
    }

    ApiResponse(res, 200, "Class deleted successfully", deletedClass);
  } catch (error) {
    handleServerError(res, error, "Failed to delete class");
  }
});

router.get("/children/children", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userType = req.user.userType;

    if (userType === "parent") {
      console.log(`🔍 Fetching children for parent ID: ${userId}`);

      const parent = await Parent.findById(userId).lean();

      if (!parent) {
        return res.status(404).json({
          success: false,
          message: "Parent not found.",
        });
      }

      const parentName = `${parent.firstName} ${parent.lastName}`;

      const children = await Student.find({ parentId: userId })
        .select("-password")
        .lean();

      if (!children || children.length === 0) {
        return res.status(200).json({
          success: true,
          message: "No children found.",
          parentId: userId,
          parentName,
          children: [],
        });
      }

      const childrenWithDetails = await Promise.all(
        children.map(async (child) => {
          const courseIds = child.courses || [];

          const courses = await Course.find({ _id: { $in: courseIds } })
            .select("title teacherIds")
            .lean();

          const courseDetails = courses.map((course) => ({
            courseId: course._id,
            title: course.title,
            teacherIds: course.teacherIds,
          }));

          const classes = await Class.find({
            courseId: { $in: courseIds },
          }).lean();

          return {
            ...child,
            courseDetails,
            classes,
          };
        })
      );

      return res.status(200).json({
        success: true,
        userType,
        parentId: userId,
        parentName,
        children: childrenWithDetails,
      });
    }

    // ✅ If user is a student
    if (userType === "student") {
      console.log(`🔍 Fetching self info for student ID: ${userId}`);

      const student = await Student.findById(userId).select("-password").lean();

      if (!student) {
        return res.status(404).json({
          success: false,
          message: "Student not found.",
        });
      }

      const courseIds = student.courses || [];

      const courses = await Course.find({ _id: { $in: courseIds } })
        .select("title teacherIds")
        .lean();

      const courseDetails = courses.map((course) => ({
        courseId: course._id,
        title: course.title,
        teacherIds: course.teacherIds,
      }));

      const classes = await Class.find({
        courseId: { $in: courseIds },
      }).lean();

      // 👇 Mimic parent response structure with one student
      return res.status(200).json({
        success: true,
        userType,
        children: [
          {
            ...student,
            courseDetails,
            classes,
          },
        ],
      });
    }

    // ❌ Unknown userType
    return res.status(403).json({
      success: false,
      message: "Unauthorized or unknown user type.",
    });
  } catch (error) {
    console.error("❌ Error fetching children and classes:", error.message);
    res.status(500).json({
      success: false,
      error: "Server error while fetching children and classes.",
    });
  }
});

module.exports = router;
