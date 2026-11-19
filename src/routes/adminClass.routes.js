const express = require("express");
const mongoose = require("mongoose");

const Class = require("../models/Class");
const Teacher = require("../models/Teacher");
const Course = require("../models/Course");
const authMiddleware = require("../middlewares/auth.middleware");
const Parent = require("../models/Parent");
const Student = require("../models/Student");

const router = express.Router();
router.use(express.json());

// --- Helper Functions ---

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
  if (!mongoose.Types.ObjectId.isValid(id)) {
    ApiResponse(res, 400, "Invalid ID format");
    return false;
  }
  return true;
};

const isAdminUser = (userType) =>
  userType === "admin" || userType === "superadmin";

const hasCourseIdPath = Boolean(Class.schema?.path("courseId"));
const hasTeacherIdPath = Boolean(Class.schema?.path("teacherId"));
const hasStudentIdsPath = Boolean(Class.schema?.path("studentIds"));

const applyClassPopulates = (query, includeStudents = false) => {
  let q = query;
  if (hasTeacherIdPath) {
    q = q.populate({
      path: "teacherId",
      select: "firstName lastName name email",
      strictPopulate: false,
    });
  }
  if (hasCourseIdPath) {
    q = q.populate({
      path: "courseId",
      select: "title name",
      strictPopulate: false,
    });
  }
  if (includeStudents && hasStudentIdsPath) {
    q = q.populate({
      path: "studentIds",
      select: "firstName lastName email",
      strictPopulate: false,
    });
  }
  return q;
};

const computeStatus = (classItem) => {
  const classDate = new Date(classItem.date);
  if (Number.isNaN(classDate.getTime())) return classItem.status || "upcoming";

  const [hours = 0, minutes = 0] = String(classItem.time || "00:00")
    .split(":")
    .map(Number);
  classDate.setHours(hours, minutes, 0, 0);

  const startTime = classDate.getTime();
  const durationMs = (Number(classItem.duration) || 0) * 60 * 1000;
  const endTime = startTime + durationMs;
  const now = Date.now();

  if (now < startTime) return "upcoming";
  if (now >= startTime && now <= endTime) return "ongoing";
  return "finished";
};

// GET all teachers
router.get("/dashboard-teachers", authMiddleware, async (req, res) => {
  try {
    const teachers = await Teacher.find().lean();

    if (!teachers || teachers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No teachers found",
      });
    }

    const sanitizedTeachers = teachers.map((t) => ({
      _id: t._id,
      name: t.name || `${t.firstName || ""} ${t.lastName || ""}`.trim(),
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
    console.error("🔥 Error fetching teachers:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch teachers",
      error: error.message,
    });
  }
});

router.get("/dashboard", authMiddleware, async (req, res) => {
  try {
    const { id: userId, userType } = req.user;

    const fetchCourseDetails = async (courseIds = []) => {
      const courses = await Promise.all(
        courseIds.map(async (id) => await Course.findById(id).lean())
      );
      return courses.filter(Boolean);
    };

    if (userType === "teacher") {
      const teacher = await Teacher.findById(userId).lean();
      if (!teacher) {
        return res.status(404).json({ message: "Teacher not found" });
      }

      const classes = await Class.find({ courseId: { $in: teacher.courseIds || [] } })
        .populate({
          path: "studentIds",
          select: "firstName lastName email",
          strictPopulate: false,
        })
        .lean();

      const formattedClasses = await Promise.all(
        classes.map(async (cls) => ({
          ...cls,
          status: computeStatus(cls),
          course: cls.courseId ? await Course.findById(cls.courseId).lean() : null,
          students:
            cls.studentIds?.map((s) => ({
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
      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      const courseIds = student.courses || [];
      const classes = await Class.find({ courseId: { $in: courseIds } })
        .populate({
          path: "teacherId",
          select: "firstName lastName email",
          strictPopulate: false,
        })
        .lean();

      const formattedClasses = await Promise.all(
        classes.map(async (cls) => ({
          ...cls,
          status: computeStatus(cls),
          course: cls.courseId ? await Course.findById(cls.courseId).lean() : null,
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
          courses: await fetchCourseDetails(courseIds),
          classes: formattedClasses,
        },
      });
    }

    if (userType === "parent") {
      const children = await Student.find({ parentId: userId }).lean();
      if (!children || children.length === 0) {
        return res.status(404).json({ message: "No children found" });
      }

      const childrenWithClasses = await Promise.all(
        children.map(async (child) => {
          const courseIds = child.courses || [];
          const classes = await Class.find({ courseId: { $in: courseIds } })
            .populate({
              path: "teacherId",
              select: "firstName lastName email",
              strictPopulate: false,
            })
            .lean();

          const formattedClasses = await Promise.all(
            classes.map(async (cls) => ({
              ...cls,
              status: computeStatus(cls),
              course: cls.courseId ? await Course.findById(cls.courseId).lean() : null,
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
            courses: await fetchCourseDetails(courseIds),
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
    return res
      .status(500)
      .json({ message: "Failed to fetch dashboard data", error });
  }
});

router.get("/", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.user.userType;

    // 👩‍🏫 TEACHER
    if (userType === "teacher") {
      const classes = await applyClassPopulates(
        Class.find({ teacherId: userId }).lean()
      );
      const withStatus = classes.map((c) => ({ ...c, status: computeStatus(c) }));
      return ApiResponse(
        res,
        200,
        "Teacher classes fetched successfully",
        withStatus
      );
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

      const classes = await applyClassPopulates(
        Class.find({ courseId: { $in: student.courses } }).lean()
      );
      const withStatus = classes.map((c) => ({ ...c, status: computeStatus(c) }));
      return ApiResponse(
        res,
        200,
        "Student classes fetched successfully",
        withStatus
      );
    }

    // 👨‍👩‍👧 PARENT
    if (userType === "parent") {
      const children = await Student.find({ parentId: userId })
        .populate({ path: "courses", select: "title _id", strictPopulate: false })
        .lean();

      if (!children || children.length === 0) {
        return ApiResponse(res, 404, "No children found for this parent");
      }

      const result = children.map((child) => ({
        studentId: child._id,
        studentName: `${child.firstName} ${child.lastName}`,
        courses: (child.courses || []).map((course) => ({
          _id: course._id,
          title: course.title,
        })),
      }));

      return ApiResponse(
        res,
        200,
        "Parent children courses fetched successfully",
        result
      );
    }

    // 🛠️ ADMIN / SUPERADMIN
    if (isAdminUser(userType)) {
      const classes = await applyClassPopulates(Class.find().lean());
      const withStatus = classes.map((c) => ({ ...c, status: computeStatus(c) }));
      return ApiResponse(res, 200, "All classes fetched successfully", withStatus);
    }

    return ApiResponse(res, 403, "Unauthorized user type");
  } catch (error) {
    console.error("🔥 Error in /classes route:", error);
    handleServerError(res, error, "Failed to fetch classes");
  }
});

// ================= TEACHER CLASSES =================
router.get("/teacher/:teacherId", authMiddleware, async (req, res) => {
  try {
    const teacherId = req.params.teacherId;
    if (!validateObjectId(teacherId, res)) return;

    const classes = await applyClassPopulates(
      Class.find({ teacherId }).lean(),
      true
    );

    if (!classes || classes.length === 0) {
      return ApiResponse(res, 404, "No classes found for this teacher");
    }

    const withStudents = await Promise.all(
      classes.map(async (cls) => {
        const courseRefId = cls.courseId?._id || cls.courseId;
        const enrolledStudents = courseRefId
          ? await Student.find({ courses: courseRefId })
              .select("firstName lastName email")
              .lean()
          : [];

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

    return ApiResponse(
      res,
      200,
      "Teacher classes with students and enrolled students fetched successfully",
      withStudents
    );
  } catch (error) {
    console.error("🔥 Error in /classes/teacher/:teacherId route:", error);
    return ApiResponse(
      res,
      500,
      "Failed to fetch teacher classes with students"
    );
  }
});

// GET a class by ID
router.get("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  if (!validateObjectId(id, res)) return;

  try {
    const classItem = await applyClassPopulates(Class.findById(id).lean());

    if (!classItem) {
      return ApiResponse(res, 404, "Class not found");
    }

    ApiResponse(res, 200, "Class fetched successfully", classItem);
  } catch (error) {
    handleServerError(res, error, "Failed to fetch class");
  }
});

// CREATE a new class
router.post("/", authMiddleware, async (req, res) => {
  if (!isAdminUser(req.user.userType)) {
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

    if (!validateObjectId(courseId, res) || !validateObjectId(teacherId, res)) {
      return;
    }

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
    const populatedClass = await applyClassPopulates(
      Class.findById(savedClass._id).lean()
    );

    ApiResponse(res, 201, "Class created successfully", populatedClass);
  } catch (error) {
    handleServerError(res, error, "Error creating class");
  }
});

// UPDATE a class
router.put("/:id", authMiddleware, async (req, res) => {
  if (!isAdminUser(req.user.userType)) {
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

    const updatedClass = await applyClassPopulates(
      Class.findByIdAndUpdate(id, updateData, {
        new: true,
        runValidators: true,
      }).lean()
    );

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
  if (!isAdminUser(req.user.userType)) {
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

    if (userType === "student") {
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