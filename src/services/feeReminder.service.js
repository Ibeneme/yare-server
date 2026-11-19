const Student = require("../models/Student");
const Parent = require("../models/Parent");
const createAndSendNotification = require("./notification.service");
const { getAccessState } = require("./access.service");
const { FEE_REMINDER_DAYS } = require("../config/constants");

const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const notifyParents = async (student, title, description, subject) => {
  const parents = await Parent.find({ $or: [{ children: student._id }, { _id: student.parentId }] })
    .select("email")
    .lean();
  await Promise.all(
    parents.map((p) =>
      createAndSendNotification({
        title,
        description,
        recipientId: p._id,
        recipientModel: "Parent",
        email: p.email,
        emailSubject: subject,
        type: "general",
        relatedId: student._id,
        sendMail: true,
      }).catch((e) => console.error("[fees] notify failed:", e.message))
    )
  );
};

/**
 * Daily: parents of lapsed students get a reminder every day for FEE_REMINDER_DAYS after the
 * lapse. When the grace ends, one final notice says the child is now view-only. Admin-granted
 * grace pauses reminders. Idempotent per day.
 */
const runFeeReminders = async (now = new Date()) => {
  const today = dayKey(now);
  // Free trial: one heads-up the day before it ends, one when it has ended.
  const trialStudents = await Student.find({ trialEndsAt: { $ne: null }, isPaid: { $ne: true }, subscriptionExpiredAt: null }).lean();
  for (const s of trialStudents) {
    const end = new Date(s.trialEndsAt);
    const hoursLeft = (end - now) / 3600000;
    if (hoursLeft > 0 && hoursLeft <= 48 && !s.trialNoticeSent) {
      await notifyParents(s, `${s.firstName}'s free trial ends soon`, `${s.firstName}'s free trial ends on ${end.toDateString()}. Subscribe to keep full access.`, `${s.firstName}'s Yare free trial ends soon`);
      await Student.updateOne({ _id: s._id }, { trialNoticeSent: true });
    } else if (hoursLeft <= 0 && !s.trialEndNotified && getAccessState(s, now).reason === "trial_ended") {
      await notifyParents(s, `${s.firstName}'s free trial has ended`, `${s.firstName}'s account is now view-only. Subscribe any time to restore full access, including live classes.`, `${s.firstName}'s Yare free trial has ended`);
      await Student.updateOne({ _id: s._id }, { trialEndNotified: true, isSubscribed: false });
    }
  }

  const students = await Student.find({ subscriptionExpiredAt: { $ne: null } }).lean();

  for (const s of students) {
    const state = getAccessState(s, now);
    if (state.reason === "admin_grace" || state.reason === "paid") continue;
    const name = s.firstName;
    const daysSince = Math.floor((now - new Date(s.subscriptionExpiredAt)) / 86400000);

    if (state.reason === "expiry_grace" && daysSince >= 0 && daysSince < FEE_REMINDER_DAYS && s.feeReminderLastOn !== today) {
      const left = Math.max(1, Math.ceil((new Date(state.until) - now) / 86400000));
      await notifyParents(
        s,
        `${name}'s subscription has expired`,
        `${name} can still learn for now, but ${name}'s subscription has ended. Please renew to avoid ${name}'s account becoming view-only (about ${left} day(s) left). Reminder ${daysSince + 1} of ${FEE_REMINDER_DAYS}.`,
        `Renew ${name}'s Yare subscription`
      );
      await Student.updateOne({ _id: s._id }, { feeReminderLastOn: today, $inc: { feeReminderCount: 1 } });
    } else if (state.reason === "lapsed" && !s.readOnlyNotified) {
      await notifyParents(
        s,
        `${name}'s account is now view-only`,
        `${name}'s subscription was not renewed, so ${name} can view lessons and materials but cannot join live classes or submit work. Renew any time to restore full access.`,
        `${name}'s Yare account is view-only`
      );
      await Student.updateOne({ _id: s._id }, { readOnlyNotified: true, isSubscribed: false, isPaid: false });
    }
  }
};

/** Keeps the legacy isSubscribed flag in step with reality (hourly). */
const reconcileFlags = async (now = new Date()) => {
  const students = await Student.find({
    $or: [{ adminGraceUntil: { $ne: null } }, { subscriptionExpiredAt: { $ne: null } }, { trialEndsAt: { $ne: null } }],
  }).lean();
  for (const s of students) {
    const st = getAccessState(s, now);
    const patch = {};
    if (st.reason === "admin_grace" && !s.isSubscribed) patch.isSubscribed = true;
    if (s.adminGraceUntil && new Date(s.adminGraceUntil) <= now) {
      Object.assign(patch, { adminGraceUntil: null, adminGraceDuration: null, adminGraceBy: null });
      if (st.mode === "read_only" || st.reason === "not_subscribed") patch.isSubscribed = false;
    }
    if (st.mode === "read_only" && s.isSubscribed) patch.isSubscribed = false;
    if (Object.keys(patch).length) await Student.updateOne({ _id: s._id }, patch);
  }
};

module.exports = { runFeeReminders, reconcileFlags };
