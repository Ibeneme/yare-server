const express = require("express");
const router = express.Router();
const Class = require("../models/Class");
const Teacher = require("../models/Teacher");
const Subject = require("../models/Subject");
const Parent = require("../models/Parent");
const Student = require("../models/Student");
const LessonFee = require("../models/LessonFee");
const { verifyToken } = require("../utils/token");
const createAndSendNotification = require("../utils/createAndSendNotification");

// Checks a list of {startTime, endTime} slots against the current clock time.
const checkTimeSlots = (timeSlots, currentTimeString) => {
  console.log("⏱️ [checkTimeSlots] Evaluating timeSlots:", {
    timeSlots,
    currentTimeString,
  });
  if (!timeSlots || timeSlots.length === 0) {
    console.log(
      "⏱️ [checkTimeSlots] No time slots provided. Returning default."
    );
    return { ongoing: false, upcoming: true };
  }
  let ongoing = false;
  let upcoming = false;
  for (const slot of timeSlots) {
    if (
      currentTimeString >= slot.startTime &&
      currentTimeString <= slot.endTime
    ) {
      ongoing = true;
      console.log("⏱️ [checkTimeSlots] Slot is ongoing:", slot);
      break;
    } else if (currentTimeString < slot.startTime) {
      upcoming = true;
      console.log("⏱️ [checkTimeSlots] Slot is upcoming:", slot);
    }
  }
  console.log("⏱️ [checkTimeSlots] Result:", { ongoing, upcoming });
  return { ongoing, upcoming };
};

// Helper function to evaluate class status across all schedules.
const evaluateClassStatus = (schedules) => {
  console.log("📅 [evaluateClassStatus] Evaluating schedules:", schedules);
  if (!schedules || schedules.length === 0) {
    console.log(
      "📅 [evaluateClassStatus] No schedules found. Returning 'upcoming'"
    );
    return "upcoming";
  }
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  const currentDayOfMonth = now.getDate();
  const currentTimeString = now.toTimeString().slice(0, 5);
  console.log("📅 [evaluateClassStatus] Current context:", {
    now,
    currentDayOfWeek,
    currentDayOfMonth,
    currentTimeString,
  });
  let isAnySlotOngoing = false;
  let hasUpcoming = false;
  for (const schedule of schedules) {
    const {
      frequency,
      timeSlots,
      daysOfWeek,
      daysOfMonth,
      specificDates,
      startDate,
      endDate,
    } = schedule;
    if (startDate && new Date(startDate) > now) {
      console.log(
        "📅 [evaluateClassStatus] Schedule start date is in future:",
        startDate
      );
      hasUpcoming = true;
      continue;
    }
    if (endDate && new Date(endDate) < now) {
      console.log(
        "📅 [evaluateClassStatus] Schedule end date has passed:",
        endDate
      );
      continue;
    }
    if (frequency === "daily") {
      console.log("📅 [evaluateClassStatus] Processing daily frequency");
      const { ongoing, upcoming } = checkTimeSlots(
        timeSlots,
        currentTimeString
      );
      if (ongoing) isAnySlotOngoing = true;
      if (upcoming) hasUpcoming = true;
    } else if (frequency === "weekly") {
      console.log("📅 [evaluateClassStatus] Processing weekly frequency");
      const todayEntry = (daysOfWeek || []).find(
        (d) => d.day === currentDayOfWeek
      );
      if (todayEntry) {
        console.log(
          "📅 [evaluateClassStatus] Found weekly entry for today:",
          todayEntry
        );
        const { ongoing, upcoming } = checkTimeSlots(
          todayEntry.timeSlots,
          currentTimeString
        );
        if (ongoing) isAnySlotOngoing = true;
        if (upcoming) hasUpcoming = true;
      } else {
        console.log("📅 [evaluateClassStatus] No weekly entry for today");
        hasUpcoming = true;
      }
    } else if (frequency === "monthly") {
      console.log("📅 [evaluateClassStatus] Processing monthly frequency");
      const todayEntry = (daysOfMonth || []).find(
        (d) => d.day === currentDayOfMonth
      );
      if (todayEntry) {
        console.log(
          "📅 [evaluateClassStatus] Found monthly entry for today:",
          todayEntry
        );
        const { ongoing, upcoming } = checkTimeSlots(
          todayEntry.timeSlots,
          currentTimeString
        );
        if (ongoing) isAnySlotOngoing = true;
        if (upcoming) hasUpcoming = true;
      } else {
        console.log("📅 [evaluateClassStatus] No monthly entry for today");
        hasUpcoming = true;
      }
    } else if (frequency === "none") {
      console.log(
        "📅 [evaluateClassStatus] Processing one-off (none) frequency"
      );
      const todayEntry = (specificDates || []).find((d) => {
        const specDate = new Date(d.date);
        return (
          specDate.getFullYear() === now.getFullYear() &&
          specDate.getMonth() === now.getMonth() &&
          specDate.getDate() === now.getDate()
        );
      });
      if (todayEntry) {
        console.log(
          "📅 [evaluateClassStatus] Found specific date entry for today:",
          todayEntry
        );
        const { ongoing, upcoming } = checkTimeSlots(
          todayEntry.timeSlots,
          currentTimeString
        );
        if (ongoing) isAnySlotOngoing = true;
        if (upcoming) hasUpcoming = true;
      } else {
        console.log(
          "📅 [evaluateClassStatus] No specific date match for today"
        );
        hasUpcoming = true;
      }
    }
    if (isAnySlotOngoing) break;
  }
  let finalStatus = "finished";
  if (isAnySlotOngoing) finalStatus = "ongoing";
  else if (hasUpcoming) finalStatus = "upcoming";
  console.log("📅 [evaluateClassStatus] Final calculated status:", finalStatus);
  return finalStatus;
};

// ─────────────────────────────────────────────────────────────
// FIXED: Format schedules into a readable string that correctly
// extracts the day(s) + time slots according to the real schema.
// ─────────────────────────────────────────────────────────────
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const formatTimeSlots = (slots) => {
  if (!slots || slots.length === 0) return "";
  return slots.map((s) => `${s.startTime} - ${s.endTime}`).join(", ");
};

const formatSchedules = (schedules) => {
  if (!schedules || schedules.length === 0) {
    return "No specific schedule provided.";
  }

  return schedules
    .map((sch) => {
      const {
        frequency,
        timeSlots,
        daysOfWeek,
        daysOfMonth,
        specificDates,
        startDate,
        endDate,
      } = sch;

      let dateRange = "";
      if (startDate || endDate) {
        const start = startDate
          ? new Date(startDate).toLocaleDateString()
          : "…";
        const end = endDate ? new Date(endDate).toLocaleDateString() : "…";
        dateRange = ` (${start} → ${end})`;
      }

      if (frequency === "daily") {
        const times = formatTimeSlots(timeSlots);
        return `Daily${times ? `: ${times}` : ""}${dateRange}`;
      }

      if (frequency === "weekly") {
        if (!daysOfWeek || daysOfWeek.length === 0) {
          return `Weekly (no days set)${dateRange}`;
        }
        const parts = daysOfWeek.map((entry) => {
          const dayName = DAY_NAMES[entry.day] ?? `Day ${entry.day}`;
          const times = formatTimeSlots(entry.timeSlots);
          return `${dayName}${times ? ` (${times})` : ""}`;
        });
        return `Weekly: ${parts.join(", ")}${dateRange}`;
      }

      if (frequency === "monthly") {
        if (!daysOfMonth || daysOfMonth.length === 0) {
          return `Monthly (no days set)${dateRange}`;
        }
        const parts = daysOfMonth.map((entry) => {
          const times = formatTimeSlots(entry.timeSlots);
          return `Day ${entry.day}${times ? ` (${times})` : ""}`;
        });
        return `Monthly: ${parts.join(", ")}${dateRange}`;
      }

      // frequency === "none"  →  specific one-off dates
      if (frequency === "none") {
        if (!specificDates || specificDates.length === 0) {
          return `One-time (no dates set)${dateRange}`;
        }
        const parts = specificDates.map((entry) => {
          const d = new Date(entry.date);
          const dateStr = d.toLocaleDateString(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
          });
          const times = formatTimeSlots(entry.timeSlots);
          return `${dateStr}${times ? ` (${times})` : ""}`;
        });
        return `One-time: ${parts.join(", ")}${dateRange}`;
      }

      // fallback
      return `Unknown frequency${dateRange}`;
    })
    .join(" | ");
};

// ─────────────────────────────────────────────────────────────
// NEW / FIXED: Find ALL students that have this subject in their
// subjects array, then notify the student + every parent.
// Also notifies the subject’s teachers.
// ─────────────────────────────────────────────────────────────
const notifySubjectParticipants = async (subjectId, options = {}) => {
  console.log(
    "📢 [notifySubjectParticipants] Starting for subjectId:",
    subjectId
  );
  try {
    const subject = await Subject.findById(subjectId)
      .populate("teachers", "firstName lastName email")
      .lean();

    if (!subject) {
      console.log("⚠️ [notifySubjectParticipants] Subject not found");
      return { success: false, message: "Subject not found" };
    }

    const subjectName = subject.name || "Subject";
    const title = options.title || `Update for ${subjectName}`;
    const description =
      options.description ||
      `There is a new update related to the subject "${subjectName}".`;
    const type = options.type || "subject_notification";
    const relatedId = options.relatedId || subjectId;

    // 1. Notify all teachers linked to the subject
    if (subject.teachers && subject.teachers.length > 0) {
      console.log(
        `📢 [notifySubjectParticipants] Notifying ${subject.teachers.length} teacher(s)`
      );
      for (const teacher of subject.teachers) {
        await createAndSendNotification({
          title,
          description,
          recipientId: teacher._id,
          recipientModel: "Teacher",
          email: teacher.email,
          type,
          relatedId,
        });
      }
    }

    // 2. Find EVERY student that has this subjectId in their subjects array
    const students = await Student.find({
      subjects: subjectId,
    }).select("_id firstName lastName email parentId");

    console.log(
      `📢 [notifySubjectParticipants] Found ${students.length} student(s) with subject in their array`
    );

    for (const student of students) {
      // Notify the student
      console.log(
        "📢 [notifySubjectParticipants] Notifying student:",
        student._id
      );
      await createAndSendNotification({
        title,
        description,
        recipientId: student._id,
        recipientModel: "Student",
        email: student.email,
        type,
        relatedId,
      });

      // Notify all parents of this student
      // (supports both Parent.children array and Student.parentId)
      const parents = await Parent.find({
        $or: [{ children: student._id }, { _id: student.parentId }],
      }).select("_id email firstName lastName");

      console.log(
        `📢 [notifySubjectParticipants] Found ${parents.length} parent(s) for student ${student._id}`
      );

      for (const parent of parents) {
        await createAndSendNotification({
          title:
            options.parentTitle ||
            `Update for ${student.firstName || "your child"}`,
          description:
            options.parentDescription ||
            `${
              student.firstName || "Your child"
            } has an update regarding the subject "${subjectName}".\n${description}`,
          recipientId: parent._id,
          recipientModel: "Parent",
          email: parent.email,
          type,
          relatedId,
        });
      }
    }

    return {
      success: true,
      message: "Notifications sent to teachers, students and parents",
      teacherCount: subject.teachers?.length || 0,
      studentCount: students.length,
    };
  } catch (error) {
    console.error("❌ [notifySubjectParticipants] Error:", error);
    return {
      success: false,
      message: "Failed to send subject notifications",
      error: error.message,
    };
  }
};

// Helper: Dispatch Class Creation Notifications
// FIXED – now finds students via their subjects array instead of only studentIds
const notifyClassParticipantsOnCreate = async (classData) => {
  console.log(
    "🔔 [notifyClassParticipantsOnCreate] Dispatching creation notifications for class:",
    classData._id
  );
  try {
    const subjectName = classData.subjectId?.name || "Subject";
    const scheduleDetails = formatSchedules(classData.schedules);

    const title = `New Class Scheduled: ${classData.title}`;
    const description = `A new class for ${subjectName} ("${classData.title}") has been added.\nSchedule: ${scheduleDetails}`;

    // 1. Notify Teacher
    if (classData.teacherId) {
      console.log(
        "🔔 [notifyClassParticipantsOnCreate] Notifying teacher:",
        classData.teacherId._id
      );
      await createAndSendNotification({
        title,
        description,
        recipientId: classData.teacherId._id,
        recipientModel: "Teacher",
        email: classData.teacherId.email,
        type: "class_schedule",
        relatedId: classData._id,
      });
    }

    // 2. Find ALL students that have this subject in their subjects array
    const subjectId = classData.subjectId?._id || classData.subjectId || null;

    let studentsToNotify = [];

    if (subjectId) {
      studentsToNotify = await Student.find({
        subjects: subjectId,
      }).select("_id firstName lastName email parentId");
      console.log(
        `🔔 [notifyClassParticipantsOnCreate] Found ${studentsToNotify.length} student(s) with subject in their array`
      );
    }

    // Fallback: also include any explicitly assigned studentIds (in case they don't have the subject yet)
    if (classData.studentIds && classData.studentIds.length > 0) {
      const explicitIds = classData.studentIds.map((s) =>
        s._id ? s._id.toString() : s.toString()
      );
      const alreadyIds = new Set(studentsToNotify.map((s) => s._id.toString()));
      const missingIds = explicitIds.filter((id) => !alreadyIds.has(id));

      if (missingIds.length > 0) {
        const extraStudents = await Student.find({
          _id: { $in: missingIds },
        }).select("_id firstName lastName email parentId");
        studentsToNotify = [...studentsToNotify, ...extraStudents];
        console.log(
          `🔔 [notifyClassParticipantsOnCreate] Added ${extraStudents.length} extra student(s) from studentIds`
        );
      }
    }

    // 3. Notify every student + their parents
    for (const student of studentsToNotify) {
      console.log(
        "🔔 [notifyClassParticipantsOnCreate] Notifying student:",
        student._id
      );
      await createAndSendNotification({
        title,
        description,
        recipientId: student._id,
        recipientModel: "Student",
        email: student.email,
        type: "class_schedule",
        relatedId: classData._id,
      });

      const parents = await Parent.find({
        $or: [{ children: student._id }, { _id: student.parentId }],
      }).select("_id email firstName lastName");

      console.log(
        `🔔 [notifyClassParticipantsOnCreate] Found ${parents.length} parent(s) for student:`,
        student._id
      );

      for (const parent of parents) {
        console.log(
          "🔔 [notifyClassParticipantsOnCreate] Notifying parent:",
          parent._id
        );
        await createAndSendNotification({
          title: `Class Scheduled for ${student.firstName || "your child"}`,
          description: `${
            student.firstName || "Your child"
          } has been enrolled in a new class: ${
            classData.title
          } (${subjectName}).\nSchedule: ${scheduleDetails}`,
          recipientId: parent._id,
          recipientModel: "Parent",
          email: parent.email,
          type: "class_schedule",
          relatedId: classData._id,
        });
      }
    }
  } catch (error) {
    console.error("⚠️ Failed to dispatch creation notifications:", error);
  }
};

// Helper: Dispatch Class Update Notifications
// FIXED – same student-lookup logic as create
const notifyClassParticipantsOnUpdate = async (classData) => {
  console.log(
    "🔔 [notifyClassParticipantsOnUpdate] Dispatching update notifications for class:",
    classData._id
  );
  try {
    const subjectName = classData.subjectId?.name || "Subject";
    const scheduleDetails = formatSchedules(classData.schedules);

    const title = `Class Updated: ${classData.title}`;
    const description = `The schedule or details for your class "${classData.title}" (${subjectName}) have been updated.\nNew Schedule: ${scheduleDetails}`;

    // 1. Notify Teacher
    if (classData.teacherId) {
      console.log(
        "🔔 [notifyClassParticipantsOnUpdate] Notifying teacher:",
        classData.teacherId._id
      );
      await createAndSendNotification({
        title,
        description,
        recipientId: classData.teacherId._id,
        recipientModel: "Teacher",
        email: classData.teacherId.email,
        type: "class_schedule",
        relatedId: classData._id,
      });
    }

    // 2. Find ALL students that have this subject in their subjects array
    const subjectId = classData.subjectId?._id || classData.subjectId || null;

    let studentsToNotify = [];

    if (subjectId) {
      studentsToNotify = await Student.find({
        subjects: subjectId,
      }).select("_id firstName lastName email parentId");
      console.log(
        `🔔 [notifyClassParticipantsOnUpdate] Found ${studentsToNotify.length} student(s) with subject in their array`
      );
    }

    // Fallback: also include any explicitly assigned studentIds
    if (classData.studentIds && classData.studentIds.length > 0) {
      const explicitIds = classData.studentIds.map((s) =>
        s._id ? s._id.toString() : s.toString()
      );
      const alreadyIds = new Set(studentsToNotify.map((s) => s._id.toString()));
      const missingIds = explicitIds.filter((id) => !alreadyIds.has(id));

      if (missingIds.length > 0) {
        const extraStudents = await Student.find({
          _id: { $in: missingIds },
        }).select("_id firstName lastName email parentId");
        studentsToNotify = [...studentsToNotify, ...extraStudents];
        console.log(
          `🔔 [notifyClassParticipantsOnUpdate] Added ${extraStudents.length} extra student(s) from studentIds`
        );
      }
    }

    // 3. Notify every student + their parents
    for (const student of studentsToNotify) {
      console.log(
        "🔔 [notifyClassParticipantsOnUpdate] Notifying student:",
        student._id
      );
      await createAndSendNotification({
        title,
        description,
        recipientId: student._id,
        recipientModel: "Student",
        email: student.email,
        type: "class_schedule",
        relatedId: classData._id,
      });

      const parents = await Parent.find({
        $or: [{ children: student._id }, { _id: student.parentId }],
      }).select("_id email firstName lastName");

      console.log(
        `🔔 [notifyClassParticipantsOnUpdate] Found ${parents.length} parent(s) for student:`,
        student._id
      );

      for (const parent of parents) {
        console.log(
          "🔔 [notifyClassParticipantsOnUpdate] Notifying parent:",
          parent._id
        );
        await createAndSendNotification({
          title: `Class Updated for ${student.firstName || "your child"}`,
          description: `The class schedule for ${
            student.firstName || "your child"
          } ("${
            classData.title
          }") has been updated.\nNew Schedule: ${scheduleDetails}`,
          recipientId: parent._id,
          recipientModel: "Parent",
          email: parent.email,
          type: "class_schedule",
          relatedId: classData._id,
        });
      }
    }
  } catch (error) {
    console.error("⚠️ Failed to dispatch update notifications:", error);
  }
};

// -------------------- SEND NOTIFICATION BY SUBJECT ID --------------------
router.post("/send-subject-notification/:subjectId", async (req, res) => {
  console.log(
    "📢 [POST /send-subject-notification/:subjectId] Request params:",
    req.params
  );
  try {
    const { subjectId } = req.params;
    const { title, description, type } = req.body;

    const result = await notifySubjectParticipants(subjectId, {
      title,
      description,
      type,
    });

    if (!result.success) {
      return res.status(404).json(result);
    }

    return res.status(200).json({
      success: true,
      message:
        "Notification sent to subject teachers, students, and parents successfully.",
      teacherCount: result.teacherCount,
      studentCount: result.studentCount,
    });
  } catch (err) {
    console.error("❌ Failed to send subject notification:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send notification",
      error: err.message,
    });
  }
});

// -------------------- CREATE CLASS --------------------
router.post("/", async (req, res) => {
  console.log("➕ [POST /] Request body:", req.body);
  try {
    const { title, subjectId, schedules, studentIds, teacherId } = req.body;

    // Only title + subjectId are required now
    if (!title || !subjectId) {
      return res.status(400).json({
        success: false,
        message: "title and subjectId are required",
      });
    }

    // 1. Find the subject and populate its teachers + children
    const subject = await Subject.findById(subjectId)
      .populate("teachers", "firstName lastName email")
      .populate("children", "firstName lastName email");

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    // 2. Decide teacher & students
    let finalTeacherId = teacherId;
    let finalStudentIds = studentIds || [];

    // If no teacher was sent in request → try taking the first teacher from the subject
    if (!finalTeacherId) {
      if (subject.teachers && subject.teachers.length > 0) {
        finalTeacherId = subject.teachers[0]._id;
      } else {
        // If you want a strict rule that a teacher IS required, change this back to a 400 error.
        // Setting it to null allows class creation if your schema permits optional teachers.
        finalTeacherId = null;
      }
    }

    // If no students were sent → take all children from the subject
    // (notifications still go to every student that has the subject in their array)
    if (!studentIds || studentIds.length === 0) {
      finalStudentIds = (subject.children || []).map((s) => s._id);
    }

    // 3. Create the class
    const newClass = await Class.create({
      title,
      subjectId,
      teacherId: finalTeacherId,
      studentIds: finalStudentIds,
      schedules: schedules || [],
    });

    console.log("➕ [POST /] Created class document:", newClass._id);

    // 4. Populate for response + notifications (handle case where teacherId might be null)
    const populatePaths = [
      { path: "subjectId", select: "name code description" },
      { path: "studentIds", select: "firstName lastName email" },
    ];

    if (newClass.teacherId) {
      populatePaths.push({
        path: "teacherId",
        select: "firstName lastName email",
      });
    }

    await newClass.populate(populatePaths);

    // 5. Send notifications (only if function handles missing teacher gracefully)
    if (typeof notifyClassParticipantsOnCreate === "function") {
      await notifyClassParticipantsOnCreate(newClass);
      console.log("✅ [POST /] Notifications sent for class:", newClass._id);
    }

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

// -------------------- FETCH CLASSES BY USER --------------------
router.get("/by-user", async (req, res) => {
  try {
    console.log("🔹 [GET /by-user] Route hit");

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log(
        "⚠️ [GET /by-user] Missing or malformed authorization header"
      );
      return res.status(401).json({
        success: false,
        message: "No token provided or malformed authorization header",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    const userId = decoded.id;
    const userType = decoded.userType;

    console.log("🔍 [GET /by-user] Token decoded:", { userId, userType });

    let subjectIds = [];
    let classes = [];
    let extra = {};

    switch (userType) {
      case "admin":
      case "superadmin":
        console.log("👑 [GET /by-user] Admin/Superadmin logic activated");
        classes = await Class.find()
          .populate("subjectId", "name code description")
          .populate("teacherId", "firstName lastName email")
          .populate("studentIds", "firstName lastName email");
        break;

      case "teacher": {
        console.log("👨‍🏫 [GET /by-user] Teacher logic activated");
        const teacherSubjects = await Subject.find({
          teachers: userId,
        }).select("_id name code description");

        subjectIds = teacherSubjects.map((subj) => subj._id);
        console.log("👨‍🏫 [GET /by-user] Teacher subject IDs:", subjectIds);

        classes = await Class.find({
          subjectId: { $in: subjectIds },
        })
          .populate("subjectId", "name code description")
          .populate("teacherId", "firstName lastName email")
          .populate("studentIds", "firstName lastName email");

        extra.subjects = teacherSubjects;
        break;
      }

      case "student": {
        console.log("🎓 [GET /by-user] Student logic activated");
        const student = await Student.findById(userId).populate(
          "subjects",
          "name code description"
        );

        if (!student) {
          console.log("⚠️ [GET /by-user] Student record not found:", userId);
          return res.status(404).json({
            success: false,
            message: "Student not found",
          });
        }

        if (!student.isSubscribed) {
          console.log("⚠️ [GET /by-user] Student is not subscribed:", userId);
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
        console.log("🎓 [GET /by-user] Student subject IDs:", subjectIds);

        classes = await Class.find({ subjectId: { $in: subjectIds } })
          .populate("subjectId", "name code description")
          .populate("teacherId", "firstName lastName email")
          .populate("studentIds", "firstName lastName email");

        extra.subjects = student.subjects;
        break;
      }

      case "parent": {
        console.log("👨‍👩‍👧 [GET /by-user] Parent logic activated");
        const parent = await Parent.findById(userId).populate({
          path: "children",
          populate: { path: "subjects", select: "name code description" },
        });

        if (!parent) {
          console.log("⚠️ [GET /by-user] Parent record not found:", userId);
          return res.status(404).json({
            success: false,
            message: "Parent not found",
          });
        }

        const subscribedChildren = parent.children.filter(
          (c) => c.isSubscribed === true
        );
        console.log(
          `👨‍👩‍👧 [GET /by-user] Found ${subscribedChildren.length} subscribed children out of ${parent.children.length}`
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
        console.log(
          "👨‍👩‍👧 [GET /by-user] Parent children subject IDs:",
          subjectIds
        );

        classes = await Class.find({ subjectId: { $in: subjectIds } })
          .populate("subjectId", "name code description")
          .populate("teacherId", "firstName lastName email")
          .populate("studentIds", "firstName lastName email");

        extra.children = subscribedChildren.map((c) => c._id);
        extra.subjects = subscribedChildren.map((c) => ({
          childId: c._id,
          subjects: c.subjects,
        }));
        break;
      }

      default:
        console.log("⚠️ [GET /by-user] Unknown userType:", userType);
        return res.status(400).json({
          success: false,
          message: "Invalid userType",
        });
    }

    console.log(
      `🔹 [GET /by-user] Total raw classes retrieved: ${classes.length}`
    );

    classes = classes.map((cls) => {
      const classObj = cls.toObject();
      const status = evaluateClassStatus(classObj.schedules);
      // Also attach a human-readable schedule string so the frontend can display the days easily
      const scheduleDisplay = formatSchedules(classObj.schedules);
      return {
        ...classObj,
        studentCount: classObj.studentIds ? classObj.studentIds.length : 0,
        status,
        scheduleDisplay, // ← new field with the formatted days + times
      };
    });

    console.log("🔹 [GET /by-user] Sending response payload");

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

// -------------------- GET CLASSES BY SUBJECT --------------------
router.get("/:subjectId", async (req, res) => {
  const { subjectId } = req.params;
  console.log(
    "📚 [GET /:subjectId] Fetching classes for subjectId:",
    subjectId
  );
  try {
    const classes = await Class.find({ subjectId })
      .populate("subjectId", "name code description")
      .populate("teacherId", "firstName lastName email")
      .populate("studentIds", "firstName lastName email");

    console.log(`📚 [GET /:subjectId] Found ${classes.length} classes`);

    const withStatus = classes.map((cls) => {
      const classObj = cls.toObject();
      return {
        ...classObj,
        studentCount: classObj.studentIds ? classObj.studentIds.length : 0,
        status: evaluateClassStatus(classObj.schedules),
        scheduleDisplay: formatSchedules(classObj.schedules), // ← added
      };
    });

    return res.status(200).json({
      success: true,
      data: withStatus,
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

// -------------------- GET LESSON FEES --------------------
router.get("/lesson-fees/lesson-fees", async (req, res) => {
  try {
    console.log("💵 [GET /lesson-fees/lesson-fees] Route hit");

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log(
        "⚠️ [GET /lesson-fees] Missing or malformed authorization header"
      );
      return res.status(401).json({
        success: false,
        message: "No token provided or malformed authorization header",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    const userId = decoded.id;
    const userType = decoded.userType;

    console.log("🔍 [GET /lesson-fees] Token decoded:", { userId, userType });

    let lessonFees = [];

    switch (userType) {
      case "superadmin":
      case "admin":
        console.log("👑 [GET /lesson-fees] Admin/Superadmin logic activated");
        lessonFees = await LessonFee.find()
          .populate("studentId")
          .sort({ createdAt: -1 })
          .exec();
        break;

      case "parent": {
        console.log("👨‍👩‍👧 [GET /lesson-fees] Parent logic activated");
        const parent = await Parent.findById(userId).populate("children");

        if (!parent) {
          console.log("⚠️ [GET /lesson-fees] Parent record not found:", userId);
          return res.status(404).json({
            success: false,
            message: "Parent not found",
          });
        }

        const childrenIds = parent.children.map((c) => c._id);
        console.log("👨‍👩‍👧 [GET /lesson-fees] Parent children IDs:", childrenIds);

        lessonFees = await LessonFee.find({
          studentId: { $in: childrenIds },
        })
          .populate("studentId")
          .sort({ createdAt: -1 })
          .exec();
        break;
      }

      case "student":
        console.log(
          "🎓 [GET /lesson-fees] Student logic activated for student:",
          userId
        );
        lessonFees = await LessonFee.find({ studentId: userId })
          .populate("studentId")
          .sort({ createdAt: -1 })
          .exec();
        break;

      default:
        console.log("⚠️ [GET /lesson-fees] Unknown userType:", userType);
        return res.status(400).json({
          success: false,
          message: "Invalid userType",
        });
    }

    console.log(
      `💵 [GET /lesson-fees] Retrieved ${lessonFees.length} lesson fee records`
    );

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

// -------------------- GET SINGLE CLASS --------------------
router.get("/:id", async (req, res) => {
  console.log("🔍 [GET /:id] Fetching single class by ID:", req.params.id);
  try {
    const classItem = await Class.findById(req.params.id)
      .populate("subjectId", "name code description")
      .populate("teacherId", "firstName lastName email")
      .populate("studentIds", "firstName lastName email");

    if (!classItem) {
      console.log("⚠️ [GET /:id] Class not found for ID:", req.params.id);
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    const classObj = classItem.toObject();
    const status = evaluateClassStatus(classObj.schedules);

    console.log("🔍 [GET /:id] Class retrieved successfully:", classItem._id);

    return res.status(200).json({
      success: true,
      data: {
        ...classObj,
        studentCount: classObj.studentIds ? classObj.studentIds.length : 0,
        status,
        scheduleDisplay: formatSchedules(classObj.schedules), // ← added
      },
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
  console.log(
    "✏️ [PUT /:id] Updating class ID:",
    req.params.id,
    "with payload:",
    req.body
  );
  try {
    const { title, subjectId, studentIds, teacherId, schedules } = req.body;

    const updatedClass = await Class.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          ...(title && { title }),
          ...(subjectId && { subjectId }),
          ...(studentIds && { studentIds }),
          ...(teacherId && { teacherId }),
          ...(schedules && { schedules }),
        },
      },
      {
        new: true,
        runValidators: true,
      }
    )
      .populate("subjectId", "name code description")
      .populate("teacherId", "firstName lastName email")
      .populate("studentIds", "firstName lastName email");

    if (!updatedClass) {
      console.log("⚠️ [PUT /:id] Class not found for update:", req.params.id);
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    console.log("✏️ [PUT /:id] Class updated successfully:", updatedClass._id);

    notifyClassParticipantsOnUpdate(updatedClass);

    const classObj = updatedClass.toObject();

    return res.status(200).json({
      success: true,
      message: "Class updated successfully",
      data: {
        ...classObj,
        studentCount: classObj.studentIds ? classObj.studentIds.length : 0,
        status: evaluateClassStatus(classObj.schedules),
        scheduleDisplay: formatSchedules(classObj.schedules), // ← added
      },
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
  console.log("🗑️ [DELETE /:id] Deleting class ID:", req.params.id);
  try {
    const deletedClass = await Class.findByIdAndDelete(req.params.id);

    if (!deletedClass) {
      console.log(
        "⚠️ [DELETE /:id] Class not found for deletion:",
        req.params.id
      );
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    console.log("🗑️ [DELETE /:id] Class deleted successfully:", req.params.id);

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

module.exports = router;
