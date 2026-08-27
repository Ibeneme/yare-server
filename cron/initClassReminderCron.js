const cron = require("node-cron");
const Class = require("../models/Class");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Parent = require("../models/Parent");
const createAndSendNotification = require("../utils/createAndSendNotification");

/**
 * Helper to parse "HH:MM" into minutes from midnight
 */
const timeToMinutes = (timeStr) => {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
};

/**
 * Checks if a given class schedule occurs on a target date and returns matching time slots (as Date objects)
 */
const getOccurrencesForDate = (classItem, targetDate) => {
  const occurrences = [];
  const targetDayOfWeek = targetDate.getDay(); // 0 = Sun, 6 = Sat
  const targetDayOfMonth = targetDate.getDate(); // 1-31

  // Format target date to YYYY-MM-DD for precise date comparison
  const targetDateString = targetDate.toISOString().split("T")[0];

  if (!classItem.schedules || !Array.isArray(classItem.schedules))
    return occurrences;

  for (const schedule of classItem.schedules) {
    // Check global date boundaries if present
    if (schedule.startDate && new Date(schedule.startDate) > targetDate)
      continue;
    if (schedule.endDate && new Date(schedule.endDate) < targetDate) continue;

    let applicableTimeSlots = [];

    if (schedule.frequency === "daily") {
      applicableTimeSlots = schedule.timeSlots || [];
    } else if (schedule.frequency === "weekly") {
      const match = schedule.daysOfWeek?.find((d) => d.day === targetDayOfWeek);
      if (match) applicableTimeSlots = match.timeSlots || [];
    } else if (schedule.frequency === "monthly") {
      const match = schedule.daysOfMonth?.find(
        (d) => d.day === targetDayOfMonth
      );
      if (match) applicableTimeSlots = match.timeSlots || [];
    } else if (schedule.frequency === "none" && schedule.specificDates) {
      const match = schedule.specificDates.find((sd) => {
        return (
          new Date(sd.date).toISOString().split("T")[0] === targetDateString
        );
      });
      if (match) applicableTimeSlots = match.timeSlots || [];
    }

    // Convert time slots to absolute start Date objects
    for (const slot of applicableTimeSlots) {
      const [startHours, startMinutes] = slot.startTime.split(":").map(Number);
      const classStartTime = new Date(targetDate);
      classStartTime.setHours(startHours, startMinutes, 0, 0);
      occurrences.push({
        startTime: classStartTime,
        rawSlot: slot,
      });
    }
  }

  return occurrences;
};

/**
 * Main Cron Job Setup - Runs every minute
 */
const initClassReminderCron = () => {
  // Runs every minute: "* * * * *"
  cron.schedule("* * * * *", async () => {
    try {
      const now = new Date();
      // Check today and tomorrow (to cover the 12-hour ahead windows safely)
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);

      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Fetch active classes with populated subject info
      const classes = await Class.find({}).populate("subjectId");

      for (const cls of classes) {
        // Check occurrences for today and tomorrow
        const datesToCheck = [today, tomorrow];
        let classOccurrences = [];

        for (const d of datesToCheck) {
          const occs = getOccurrencesForDate(cls, d);
          classOccurrences.push(...occs);
        }

        for (const occurrence of classOccurrences) {
          const classStartTime = occurrence.startTime;
          const diffMs = classStartTime.getTime() - now.getTime();
          const diffMins = Math.round(diffMs / (1000 * 60));

          // Define target trigger windows in minutes (+/- 30 seconds buffer via cron execution per minute)
          // 12 hours = 720 mins
          // 6 hours = 360 mins
          // 3 hours = 180 mins
          // 1 hour = 60 mins
          // 30 mins = 30 mins
          // 15 mins = 15 mins
          const targetWindows = [720, 360, 180, 60, 30, 15];

          if (targetWindows.includes(diffMins)) {
            const timeLabel =
              diffMins >= 60
                ? `${diffMins / 60} hour(s)`
                : `${diffMins} minutes`;

            const subjectTitle =
              cls.subjectId?.title || cls.subjectId?.name || "Subject";
            const classTitle = cls.title;
            const classId = cls._id;
            const subjectId = cls.subjectId?._id || cls.subjectId;

            // Build dynamic route meta payload matching frontend requirements
            const meta = {
              classId: classId.toString(),
              classTitle: classTitle,
              subjectTitle: subjectTitle,
              subjectId: subjectId ? subjectId.toString() : "",
            };

            const startTimeString = classStartTime.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });

            // Gather all recipients (Students, Teachers, and Parents)
            const recipientQueries = [];

            // 1. Fetch Students
            if (cls.studentIds && cls.studentIds.length > 0) {
              recipientQueries.push(
                Student.find({ _id: { $in: cls.studentIds } })
                  .select("firstName lastName email")
                  .then((students) =>
                    students.map((s) => ({
                      id: s._id,
                      email: s.email,
                      model: "Student",
                      firstName: s.firstName,
                      title: `Reminder: "${classTitle}" starts in ${timeLabel}!`,
                      description: `Your class "${classTitle}" for ${subjectTitle} is scheduled to begin at ${startTimeString}. Get ready and join on time!`,
                      emailSubject: `Class Alert: ${classTitle} in ${timeLabel}`,
                    }))
                  )
              );

              // 2. Fetch Parents linked to these students
              recipientQueries.push(
                Parent.find({ children: { $in: cls.studentIds } })
                  .select("email children")
                  .populate("children", "firstName")
                  .then((parents) =>
                    parents.map((p) => {
                      // Find student name belonging to this parent for personalized messaging
                      const matchedChild = p.children?.find((c) =>
                        cls.studentIds.some(
                          (id) => id.toString() === c._id.toString()
                        )
                      );
                      const childName = matchedChild?.firstName || "your child";

                      return {
                        id: p._id,
                        email: p.email,
                        model: "Parent",
                        title: `Reminder: ${childName}'s class "${classTitle}" starts in ${timeLabel}!`,
                        description: `The class "${classTitle}" for ${childName} (${subjectTitle}) is scheduled to begin at ${startTimeString}.`,
                        emailSubject: `Parent Alert: ${childName}'s Class in ${timeLabel}`,
                      };
                    })
                  )
              );
            }

            // 3. Fetch Teacher
            if (cls.teacherId) {
              recipientQueries.push(
                Teacher.findById(cls.teacherId)
                  .select("email")
                  .then((teacher) =>
                    teacher
                      ? [
                          {
                            id: teacher._id,
                            email: teacher.email,
                            model: "Teacher",
                            title: `Reminder: "${classTitle}" starts in ${timeLabel}!`,
                            description: `Your teaching session for "${classTitle}" (${subjectTitle}) starts at ${startTimeString}.`,
                            emailSubject: `Teaching Alert: ${classTitle} in ${timeLabel}`,
                          },
                        ]
                      : []
                  )
              );
            }

            const recipientLists = await Promise.all(recipientQueries);
            const allRecipients = recipientLists.flat();

            // Dispatch notifications & emails concurrently
            await Promise.all(
              allRecipients.map(async (recipient) => {
                try {
                  await createAndSendNotification({
                    title: recipient.title,
                    description: recipient.description,
                    recipientId: recipient.id,
                    recipientModel: recipient.model,
                    email: recipient.email,
                    emailSubject: recipient.emailSubject,
                    type: "class",
                    relatedId: classId,
                    meta,
                    sendMail: true,
                  });
                } catch (innerErr) {
                  console.error(
                    `Failed to send reminder to ${recipient.email}:`,
                    innerErr
                  );
                }
              })
            );
          }
        }
      }
    } catch (error) {
      console.error("Error executing class reminder cron job:", error);
    }
  });
};

module.exports = initClassReminderCron;
