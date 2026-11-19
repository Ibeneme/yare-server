const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Class = require("../models/Class");
const Teacher = require("../models/Teacher");
const Subject = require("../models/Subject");
const Parent = require("../models/Parent");
const Student = require("../models/Student");
const LessonFee = require("../models/LessonFee");
const { verifyToken } = require("../services/token.service");
const authMiddleware = require("../middlewares/auth.middleware");
const adminOnly = [authMiddleware, authMiddleware.requireRoles("admin")];
const Grade = require("../models/Grade");
const createAndSendNotification = require("../services/notification.service");

const StudentGroup = mongoose.models.StudentGroup || null;

// Checks a list of {startTime, endTime} slots against the current clock time.
const checkTimeSlots = (timeSlots, currentTimeString) => {
  if (!timeSlots || timeSlots.length === 0) {
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
      break;
    } else if (currentTimeString < slot.startTime) {
      upcoming = true;
    }
  }
  return { ongoing, upcoming };
};

// Helper function to evaluate class status across all schedules.
const evaluateClassStatus = (schedules) => {
  if (!schedules || schedules.length === 0) {
    return "upcoming";
  }
  const now = new Date();
  const currentDayOfWeek = now.getDay();
  const currentDayOfMonth = now.getDate();
  const currentTimeString = now.toTimeString().slice(0, 5);

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
      hasUpcoming = true;
      continue;
    }
    if (endDate && new Date(endDate) < now) {
      continue;
    }

    if (frequency === "daily") {
      const { ongoing, upcoming } = checkTimeSlots(
        timeSlots,
        currentTimeString,
      );
      if (ongoing) isAnySlotOngoing = true;
      if (upcoming) hasUpcoming = true;
    } else if (frequency === "weekly") {
      const todayEntry = (daysOfWeek || []).find(
        (d) => d.day === currentDayOfWeek,
      );
      if (todayEntry) {
        const { ongoing, upcoming } = checkTimeSlots(
          todayEntry.timeSlots,
          currentTimeString,
        );
        if (ongoing) isAnySlotOngoing = true;
        if (upcoming) hasUpcoming = true;
      } else {
        hasUpcoming = true;
      }
    } else if (frequency === "monthly") {
      const todayEntry = (daysOfMonth || []).find(
        (d) => d.day === currentDayOfMonth,
      );
      if (todayEntry) {
        const { ongoing, upcoming } = checkTimeSlots(
          todayEntry.timeSlots,
          currentTimeString,
        );
        if (ongoing) isAnySlotOngoing = true;
        if (upcoming) hasUpcoming = true;
      } else {
        hasUpcoming = true;
      }
    } else if (frequency === "none") {
      const todayEntry = (specificDates || []).find((d) => {
        const specDate = new Date(d.date);
        return (
          specDate.getFullYear() === now.getFullYear() &&
          specDate.getMonth() === now.getMonth() &&
          specDate.getDate() === now.getDate()
        );
      });
      if (todayEntry) {
        const { ongoing, upcoming } = checkTimeSlots(
          todayEntry.timeSlots,
          currentTimeString,
        );
        if (ongoing) isAnySlotOngoing = true;
        if (upcoming) hasUpcoming = true;
      } else {
        hasUpcoming = true;
      }
    }

    if (isAnySlotOngoing) break;
  }

  if (isAnySlotOngoing) return "ongoing";
  if (hasUpcoming) return "upcoming";
  return "finished";
};

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

      return `Unknown frequency${dateRange}`;
    })
    .join(" | ");
};

const extractStudentIds = (body = {}) => {
  const rawList = Array.isArray(body.studentIds)
    ? body.studentIds
    : Array.isArray(body.students)
      ? body.students
      : [];

  const ids = rawList
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") return item;
      if (typeof item === "object") return item._id || item.id || null;
      return null;
    })
    .filter(Boolean)
    .map((id) => id.toString());

  return [...new Set(ids)];
};

const extractGroupIds = (body = {}) => {
  const rawList = Array.isArray(body.groupIds) ? body.groupIds : [];
  const ids = rawList
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") return item;
      if (typeof item === "object") return item._id || item.id || null;
      return null;
    })
    .filter(Boolean)
    .map((id) => id.toString());

  return [...new Set(ids)];
};

const resolveStudentIdsFromGroups = async (groupIds = []) => {
  if (!StudentGroup || !Array.isArray(groupIds) || groupIds.length === 0) {
    return [];
  }
  const groups = await StudentGroup.find({ _id: { $in: groupIds } })
    .select("studentIds students children members")
    .lean();

  const ids = [];
  for (const g of groups) {
    const bucket =
      g.studentIds || g.students || g.children || g.members || [];
    for (const item of bucket) {
      const id = item && item._id ? item._id.toString() : item?.toString();
      if (id) ids.push(id);
    }
  }
  return [...new Set(ids)];
};

// Derived strictly from fields that exist in ClassSchema:
// audience === "grade" => "general"
// audience === "students" or "groups" (or non-empty studentIds/groupIds) => "specific"
const getEffectiveScope = (cls) => {
  if (cls?.audience === "grade") {
    return "general";
  }
  const hasStudents = Array.isArray(cls?.studentIds) && cls.studentIds.length > 0;
  const hasGroups = Array.isArray(cls?.groupIds) && cls.groupIds.length > 0;
  if (cls?.audience === "students" || cls?.audience === "groups" || hasStudents || hasGroups) {
    return "specific";
  }
  return "general";
};

const resolveAudience = (body = {}, targetStudentIds = [], groupIds = [], existing = null) => {
  if (body.scope === "general" || body.isGeneral === true || body.audience === "grade") {
    return "grade";
  }
  if (body.scope === "specific" || body.isGeneral === false) {
    return groupIds.length > 0 && targetStudentIds.length === 0 ? "groups" : "students";
  }
  if (body.audience === "groups" || body.audience === "students") {
    return body.audience;
  }
  if (groupIds.length > 0) {
    return "groups";
  }
  if (targetStudentIds.length > 0) {
    return "students";
  }
  if (existing?.audience) {
    return existing.audience;
  }
  return "grade";
};

const decodeOptionalAuthUser = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  try {
    return verifyToken(authHeader.split(" ")[1]);
  } catch (_) {
    return null;
  }
};

// Fetch all students enrolled in a subject (via Student.subjects or Subject.children)
const getStudentsForSubject = async (subjectId) => {
  const subject = await Subject.findById(subjectId)
    .select("children name code")
    .lean();

  const subjectChildIds = (subject?.children || []).map((id) => id.toString());

  const students = await Student.find({
    $or: [
      { subjects: subjectId },
      ...(subjectChildIds.length > 0
        ? [{ _id: { $in: subjectChildIds } }]
        : []),
    ],
  })
    .select("_id firstName lastName email parentId isSubscribed subjects")
    .lean();

  const studentIds = students.map((s) => s._id);
  const parents = await Parent.find({
    $or: [
      { children: { $in: studentIds } },
      { _id: { $in: students.map((s) => s.parentId).filter(Boolean) } },
    ],
  })
    .select("_id firstName lastName email children")
    .lean();

  return students.map((st) => {
    const stIdStr = st._id.toString();
    const linkedParents = parents.filter(
      (p) =>
        (Array.isArray(p.children) &&
          p.children.some((c) => c.toString() === stIdStr)) ||
        (st.parentId && p._id.toString() === st.parentId.toString()),
    );
    return {
      ...st,
      parents: linkedParents,
    };
  });
};

// Resolve the exact list of students for a class:
// - If scope === "specific", ONLY the selected studentIds (and group studentIds if any)
// - If scope === "general", all students in the subject
const resolveStudentsForClass = async (classData) => {
  const scope = getEffectiveScope(classData);
  const explicitIds = Array.from(
    new Set(
      (classData.studentIds || [])
        .map((s) => (s && s._id ? s._id.toString() : s ? s.toString() : null))
        .filter(Boolean),
    ),
  );
  const groupIds = extractGroupIds(classData);
  const groupStudentIds =
    groupIds.length > 0 ? await resolveStudentIdsFromGroups(groupIds) : [];
  const combinedSpecificIds = [...new Set([...explicitIds, ...groupStudentIds])];

  if (scope === "specific") {
    if (combinedSpecificIds.length === 0) return [];
    return Student.find({ _id: { $in: combinedSpecificIds } })
      .select("_id firstName lastName email parentId")
      .lean();
  }

  const subjectId = classData.subjectId?._id || classData.subjectId || null;
  let students = [];
  if (subjectId) {
    students = await getStudentsForSubject(subjectId);
  }

  return students;
};

// Notify ONLY the resolved students and their linked parents (deduplicated per email per event)
const notifyStudentsAndParents = async ({
  students,
  classData,
  mode = "create",
}) => {
  if (!students || students.length === 0) return;

  const subjectName = classData.subjectId?.name || "Subject";
  const scheduleDetails = formatSchedules(classData.schedules);
  const isSpecific = getEffectiveScope(classData) === "specific";
  const sentEmails = new Set();

  const sendUniqueNotification = async (payload) => {
    const emailKey = (payload.email || "").trim().toLowerCase();
    if (emailKey) {
      if (sentEmails.has(emailKey)) return;
      sentEmails.add(emailKey);
    }
    await createAndSendNotification(payload);
  };

  const studentTitle =
    mode === "update"
      ? `Class Updated: ${classData.title}`
      : isSpecific
        ? `Specific Class Booked: ${classData.title}`
        : `New Class Scheduled: ${classData.title}`;

  const studentDescription =
    mode === "update"
      ? `The schedule or details for your ${
          isSpecific ? "specific " : ""
        }class "${classData.title}" (${subjectName}) have been updated.\nNew Schedule: ${scheduleDetails}`
      : isSpecific
        ? `A specific class has been booked for you in ${subjectName}: "${classData.title}".\nSchedule: ${scheduleDetails}`
        : `A new class for ${subjectName} ("${classData.title}") has been scheduled.\nSchedule: ${scheduleDetails}`;

  for (const student of students) {
    await sendUniqueNotification({
      title: studentTitle,
      description: studentDescription,
      recipientId: student._id,
      recipientModel: "Student",
      email: student.email,
      type: "class_schedule",
      relatedId: classData._id,
    });

    const parents = await Parent.find({
      $or: [{ children: student._id }, { _id: student.parentId }],
    }).select("_id email firstName lastName");

    for (const parent of parents) {
      const childLabel = student.firstName || "your child";
      const parentTitle =
        mode === "update"
          ? `Class Updated for ${childLabel}`
          : isSpecific
            ? `Specific Class Booked for ${childLabel}`
            : `Class Scheduled for ${childLabel}`;

      const parentDescription =
        mode === "update"
          ? `The ${
              isSpecific ? "specific " : ""
            }class schedule for ${childLabel} ("${
              classData.title
            }") has been updated.\nNew Schedule: ${scheduleDetails}`
          : `${childLabel} has been booked for ${
              isSpecific ? "a specific class" : "a class"
            }: ${classData.title} (${subjectName}).\nSchedule: ${scheduleDetails}`;

      await sendUniqueNotification({
        title: parentTitle,
        description: parentDescription,
        recipientId: parent._id,
        recipientModel: "Parent",
        email: parent.email,
        type: "class_schedule",
        relatedId: classData._id,
      });
    }
  }
};

// Dispatch notifications on create
const notifyClassParticipantsOnCreate = async (classData) => {
  try {
    const subjectName = classData.subjectId?.name || "Subject";
    const scheduleDetails = formatSchedules(classData.schedules);
    const isSpecific = getEffectiveScope(classData) === "specific";

    if (classData.teacherId) {
      await createAndSendNotification({
        title: `New Class Scheduled: ${classData.title}`,
        description: `A new ${
          isSpecific ? "specific " : ""
        }class for ${subjectName} ("${
          classData.title
        }") has been added.\nSchedule: ${scheduleDetails}`,
        recipientId: classData.teacherId._id,
        recipientModel: "Teacher",
        email: classData.teacherId.email,
        type: "class_schedule",
        relatedId: classData._id,
      });
    }

    const studentsToNotify = await resolveStudentsForClass(classData);

    await notifyStudentsAndParents({
      students: studentsToNotify,
      classData,
      mode: "create",
    });
  } catch (error) {
    console.error("⚠️ Failed to dispatch creation notifications:", error);
  }
};

// Dispatch notifications on update
const notifyClassParticipantsOnUpdate = async (classData) => {
  try {
    const subjectName = classData.subjectId?.name || "Subject";
    const scheduleDetails = formatSchedules(classData.schedules);

    if (classData.teacherId) {
      await createAndSendNotification({
        title: `Class Updated: ${classData.title}`,
        description: `The schedule or details for your class "${classData.title}" (${subjectName}) have been updated.\nNew Schedule: ${scheduleDetails}`,
        recipientId: classData.teacherId._id,
        recipientModel: "Teacher",
        email: classData.teacherId.email,
        type: "class_schedule",
        relatedId: classData._id,
      });
    }

    const studentsToNotify = await resolveStudentsForClass(classData);

    await notifyStudentsAndParents({
      students: studentsToNotify,
      classData,
      mode: "update",
    });
  } catch (error) {
    console.error("⚠️ Failed to dispatch update notifications:", error);
  }
};

// Filter classes so specific classes only appear for their assigned students
const filterClassesForStudents = (classes, studentIdSet) => {
  return classes.filter((cls) => {
    const classScope = getEffectiveScope(cls);
    if (classScope !== "specific") return true;

    const assignedIds = (cls.studentIds || []).map((s) =>
      s && s._id ? s._id.toString() : s.toString(),
    );
    return assignedIds.some((id) => studentIdSet.has(id));
  });
};

const formatClassResponse = (cls) => {
  const classObj = cls.toObject ? cls.toObject() : cls;
  const scope = getEffectiveScope(classObj);
  return {
    ...classObj,
    scope,
    isGeneral: scope === "general",
    studentCount: classObj.studentIds ? classObj.studentIds.length : 0,
    status: evaluateClassStatus(classObj.schedules),
    scheduleDisplay: formatSchedules(classObj.schedules),
  };
};

// -------------------- GET ALL STUDENTS FOR A SUBJECT --------------------
router.get("/students/:subjectId", async (req, res) => {
  try {
    const { subjectId } = req.params;
    const subject = await Subject.findById(subjectId)
      .select("name code")
      .lean();

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    const students = await getStudentsForSubject(subjectId);

    return res.status(200).json({
      success: true,
      subjectId,
      subjectName: subject.name,
      count: students.length,
      data: students,
    });
  } catch (err) {
    console.error("❌ Failed to fetch students for subject:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch students for subject",
      error: err.message,
    });
  }
});

// -------------------- SEND NOTIFICATION BY SUBJECT ID --------------------
router.post("/send-subject-notification/:subjectId", async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { title, description, type } = req.body;

    const subject = await Subject.findById(subjectId)
      .populate("teachers", "firstName lastName email")
      .lean();

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    const subjectName = subject.name || "Subject";
    const notifTitle = title || `Update for ${subjectName}`;
    const notifDescription =
      description ||
      `There is a new update related to the subject "${subjectName}".`;
    const notifType = type || "subject_notification";

    if (subject.teachers && subject.teachers.length > 0) {
      for (const teacher of subject.teachers) {
        await createAndSendNotification({
          title: notifTitle,
          description: notifDescription,
          recipientId: teacher._id,
          recipientModel: "Teacher",
          email: teacher.email,
          type: notifType,
          relatedId: subjectId,
        });
      }
    }

    const students = await getStudentsForSubject(subjectId);
    for (const student of students) {
      await createAndSendNotification({
        title: notifTitle,
        description: notifDescription,
        recipientId: student._id,
        recipientModel: "Student",
        email: student.email,
        type: notifType,
        relatedId: subjectId,
      });

      const parents = await Parent.find({
        $or: [{ children: student._id }, { _id: student.parentId }],
      }).select("_id email firstName lastName");

      for (const parent of parents) {
        await createAndSendNotification({
          title: `Update for ${student.firstName || "your child"}`,
          description: `${
            student.firstName || "Your child"
          } has an update regarding the subject "${subjectName}".\n${notifDescription}`,
          recipientId: parent._id,
          recipientModel: "Parent",
          email: parent.email,
          type: notifType,
          relatedId: subjectId,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message:
        "Notification sent to subject teachers, students, and parents successfully.",
      teacherCount: subject.teachers?.length || 0,
      studentCount: students.length,
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
router.post("/", ...adminOnly, async (req, res) => {
  try {
    const { title, subjectId, schedules, teacherId, gradeId } = req.body;

    if (!title || !subjectId) {
      return res.status(400).json({
        success: false,
        message: "title and subjectId are required",
      });
    }

    const groupIds = extractGroupIds(req.body);
    const explicitStudentIds = extractStudentIds(req.body);
    const groupStudentIds =
      groupIds.length > 0 ? await resolveStudentIdsFromGroups(groupIds) : [];
    const combinedTargetStudentIds = [
      ...new Set([...explicitStudentIds, ...groupStudentIds]),
    ];

    const audience = resolveAudience(
      req.body,
      combinedTargetStudentIds,
      groupIds,
    );

    if (audience === "grade" && !gradeId) {
      // Allow grade-less general subject classes if gradeId wasn't passed
    }
    if (audience === "groups" && groupIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "groupIds is required when audience is groups",
      });
    }

    const isSpecific = audience !== "grade";
    if (isSpecific && combinedTargetStudentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one student or group for a specific class",
      });
    }

    const subject = await Subject.findById(subjectId)
      .populate("teachers", "firstName lastName email")
      .populate("children", "firstName lastName email");

    if (!subject) {
      return res.status(404).json({
        success: false,
        message: "Subject not found",
      });
    }

    let finalTeacherId = teacherId || null;
    if (!finalTeacherId && subject.teachers && subject.teachers.length > 0) {
      finalTeacherId = subject.teachers[0]._id;
    }

    const finalStudentIds = isSpecific ? combinedTargetStudentIds : [];

    const newClass = await Class.create({
      title,
      subjectId,
      teacherId: finalTeacherId,
      studentIds: finalStudentIds,
      gradeId: gradeId || undefined,
      audience,
      groupIds: audience === "groups" ? groupIds : [],
      schedules: schedules || [],
    });

    const populatePaths = [
      { path: "subjectId", select: "name code description" },
      { path: "studentIds", select: "firstName lastName email parentId" },
    ];

    if (newClass.teacherId) {
      populatePaths.push({
        path: "teacherId",
        select: "firstName lastName email",
      });
    }

    await newClass.populate(populatePaths);
    await notifyClassParticipantsOnCreate(newClass);

    return res.status(201).json({
      success: true,
      message: "Class created successfully",
      data: formatClassResponse(newClass),
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

    let subjectIds = [];
    let classes = [];
    let extra = {};

    switch (userType) {
      case "admin":
      case "superadmin":
        classes = await Class.find()
          .populate("subjectId", "name code description")
          .populate("teacherId", "firstName lastName email")
          .populate("studentIds", "firstName lastName email parentId");
        break;

      case "teacher": {
        const teacherSubjects = await Subject.find({
          teachers: userId,
        }).select("_id name code description");

        subjectIds = teacherSubjects.map((subj) => subj._id);

        classes = await Class.find({
          subjectId: { $in: subjectIds },
        })
          .populate("subjectId", "name code description")
          .populate("teacherId", "firstName lastName email")
          .populate("studentIds", "firstName lastName email parentId");

        extra.subjects = teacherSubjects;
        break;
      }

      case "student": {
        const student = await Student.findById(userId).populate(
          "subjects",
          "name code description",
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

        const rawClasses = await Class.find({ subjectId: { $in: subjectIds } })
          .populate("subjectId", "name code description")
          .populate("teacherId", "firstName lastName email")
          .populate("studentIds", "firstName lastName email parentId");

        classes = filterClassesForStudents(
          rawClasses,
          new Set([student._id.toString()]),
        );
        extra.subjects = student.subjects;
        break;
      }

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

        const subscribedChildren = parent.children.filter(
          (c) => c.isSubscribed === true,
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
          c.subjects.map((s) => s._id),
        );
        const childIdSet = new Set(
          subscribedChildren.map((c) => c._id.toString()),
        );

        const rawClasses = await Class.find({ subjectId: { $in: subjectIds } })
          .populate("subjectId", "name code description")
          .populate("teacherId", "firstName lastName email")
          .populate("studentIds", "firstName lastName email parentId");

        classes = filterClassesForStudents(rawClasses, childIdSet);
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

    const formattedClasses = classes.map(formatClassResponse);

    return res.status(200).json({
      success: true,
      userType,
      subjectIds,
      count: formattedClasses.length,
      ...extra,
      data: formattedClasses,
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
  const { studentId } = req.query;

  try {
    let classes = await Class.find({ subjectId })
      .populate("subjectId", "name code description")
      .populate("teacherId", "firstName lastName email")
      .populate("studentIds", "firstName lastName email parentId");

    if (studentId) {
      classes = filterClassesForStudents(
        classes,
        new Set([studentId.toString()]),
      );
    } else {
      const decoded = decodeOptionalAuthUser(req);
      if (decoded?.userType === "student") {
        classes = filterClassesForStudents(
          classes,
          new Set([decoded.id.toString()]),
        );
      } else if (decoded?.userType === "parent") {
        const parent = await Parent.findById(decoded.id)
          .select("children")
          .lean();
        const childIds = new Set(
          (parent?.children || []).map((c) => c.toString()),
        );
        classes = filterClassesForStudents(classes, childIds);
      }
    }

    return res.status(200).json({
      success: true,
      data: classes.map(formatClassResponse),
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

    let lessonFees = [];

    switch (userType) {
      case "superadmin":
      case "admin":
        lessonFees = await LessonFee.find()
          .populate("studentId")
          .sort({ createdAt: -1 })
          .exec();
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
          .populate("studentId")
          .sort({ createdAt: -1 })
          .exec();
        break;
      }

      case "student":
        lessonFees = await LessonFee.find({ studentId: userId })
          .populate("studentId")
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

// -------------------- GET SINGLE CLASS --------------------
router.get("/:id", async (req, res) => {
  try {
    const classItem = await Class.findById(req.params.id)
      .populate("subjectId", "name code description")
      .populate("teacherId", "firstName lastName email")
      .populate("studentIds", "firstName lastName email parentId");

    if (!classItem) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    const decoded = decodeOptionalAuthUser(req);
    if (decoded?.userType === "student") {
      const allowed = filterClassesForStudents(
        [classItem],
        new Set([decoded.id.toString()]),
      );
      if (allowed.length === 0) {
        return res.status(403).json({
          success: false,
          message: "Not assigned to this class",
        });
      }
    } else if (decoded?.userType === "parent") {
      const parent = await Parent.findById(decoded.id)
        .select("children")
        .lean();
      const childIds = new Set(
        (parent?.children || []).map((c) => c.toString()),
      );
      const allowed = filterClassesForStudents([classItem], childIds);
      if (allowed.length === 0) {
        return res.status(403).json({
          success: false,
          message: "No child assigned to this class",
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: formatClassResponse(classItem),
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
router.put("/:id", ...adminOnly, async (req, res) => {
  try {
    const { title, subjectId, teacherId, schedules, gradeId } = req.body;

    const existing = await Class.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Class not found",
      });
    }

    const hasExplicitStudents =
      Array.isArray(req.body.studentIds) || Array.isArray(req.body.students);
    const extractedStudentIds = hasExplicitStudents
      ? extractStudentIds(req.body)
      : (existing.studentIds || []).map((id) => id.toString());

    const groupIds = Array.isArray(req.body.groupIds)
      ? extractGroupIds(req.body)
      : extractGroupIds(existing);
    const groupStudentIds =
      groupIds.length > 0 ? await resolveStudentIdsFromGroups(groupIds) : [];

    const combinedStudentIds = [
      ...new Set([...extractedStudentIds, ...groupStudentIds]),
    ];

    const nextAudience = resolveAudience(
      req.body,
      combinedStudentIds,
      groupIds,
      existing,
    );
    const isSpecific = nextAudience !== "grade";

    if (isSpecific && combinedStudentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one student or group for a specific class",
      });
    }

    const updateFields = {
      ...(title && { title }),
      ...(subjectId && { subjectId }),
      ...(teacherId && { teacherId }),
      ...(schedules && { schedules }),
      ...(gradeId && { gradeId }),
      audience: nextAudience,
      groupIds: nextAudience === "groups" ? groupIds : [],
      studentIds: isSpecific ? combinedStudentIds : [],
    };

    const updatedClass = await Class.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true },
    )
      .populate("subjectId", "name code description")
      .populate("teacherId", "firstName lastName email")
      .populate("studentIds", "firstName lastName email parentId");

    await notifyClassParticipantsOnUpdate(updatedClass);

    return res.status(200).json({
      success: true,
      message: "Class updated successfully",
      data: formatClassResponse(updatedClass),
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
router.delete("/:id", ...adminOnly, async (req, res) => {
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

module.exports = router;