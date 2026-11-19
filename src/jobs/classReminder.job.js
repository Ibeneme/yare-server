const cron = require("node-cron");
const Class = require("../models/Class");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const Parent = require("../models/Parent");
const ClassReminderLog = require("../models/ClassReminderLog");
const createAndSendNotification = require("../services/notification.service");
const { upcomingSessions } = require("../services/schedule.service");
const { resolveStudentIds } = require("../services/classAudience.service");
const { REMINDER_MINUTES_BEFORE } = require("../config/constants");

const MIN = 60 * 1000;
let running = false;

const fmtTime = (d) => d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });

const sendReminders = async (cls, startsAt) => {
  const title = cls.title;
  const subject = cls.subjectId?.name || cls.subjectId?.title || "your subject";
  const at = fmtTime(startsAt);
  const meta = {
    classId: String(cls._id),
    classTitle: title,
    subjectTitle: subject,
    subjectId: String(cls.subjectId?._id || cls.subjectId || ""),
  };
  const send = (recipient, text) =>
    createAndSendNotification({
      title: `Class starts in ${REMINDER_MINUTES_BEFORE} minutes`,
      description: text,
      recipientId: recipient.id,
      recipientModel: recipient.model,
      email: recipient.email,
      emailSubject: `Reminder: ${title} starts in ${REMINDER_MINUTES_BEFORE} minutes`,
      type: "class",
      relatedId: cls._id,
      meta,
      sendMail: true,
    }).catch((e) => console.error(`[reminder] failed for ${recipient.email}:`, e.message));

  const studentIds = await resolveStudentIds(cls);
  const [students, parents, teacher] = await Promise.all([
    Student.find({ _id: { $in: studentIds } }).select("firstName email").lean(),
    Parent.find({ children: { $in: studentIds } }).select("email children").populate("children", "firstName").lean(),
    cls.teacherId ? Teacher.findById(cls.teacherId).select("email").lean() : null,
  ]);

  const jobs = [];
  students.forEach((s) =>
    jobs.push(send({ id: s._id, model: "Student", email: s.email }, `"${title}" (${subject}) begins at ${at}. Join from your dashboard.`))
  );
  parents.forEach((p) => {
    const child = p.children?.find((c) => studentIds.includes(String(c._id)));
    jobs.push(
      send({ id: p._id, model: "Parent", email: p.email }, `${child?.firstName || "Your child"}'s class "${title}" (${subject}) begins at ${at}.`)
    );
  });
  if (teacher) {
    jobs.push(send({ id: teacher._id, model: "Teacher", email: teacher.email }, `You teach "${title}" (${subject}) at ${at}.`));
  }
  await Promise.all(jobs);
};

const tick = async () => {
  if (running) return; // never overlap runs
  running = true;
  try {
    const now = new Date();
    const classes = await Class.find({ "schedules.0": { $exists: true } }).populate("subjectId", "name").lean();
    // Window: 29–30 minutes ahead; a cron tick every minute hits each session exactly once.
    // The unique log row protects against a restart or a slow tick sending it twice.
    const from = (REMINDER_MINUTES_BEFORE - 1) * MIN;
    const to = REMINDER_MINUTES_BEFORE * MIN;
    for (const cls of classes) {
      for (const { startsAt } of upcomingSessions(cls, now, from, to)) {
        try {
          await ClassReminderLog.create({ classId: cls._id, startsAt });
        } catch (e) {
          if (e.code === 11000) continue; // already reminded
          throw e;
        }
        await sendReminders(cls, startsAt);
      }
    }
  } catch (err) {
    console.error("[reminder] job error:", err);
  } finally {
    running = false;
  }
};

const startClassReminderJob = () => {
  cron.schedule("* * * * *", tick, { timezone: process.env.TZ });
  console.log(`Class reminder job running (every minute, ${REMINDER_MINUTES_BEFORE} min before start)`);
};

module.exports = { startClassReminderJob, tick };
