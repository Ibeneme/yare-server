const cron = require("node-cron");
const LessonFee = require("../models/LessonFee");
const Student = require("../models/Student");
const { computeExpiryGraceEnd } = require("../services/access.service");
const { runFeeReminders, reconcileFlags } = require("../services/feeReminder.service");

/**
 * Marks lapsed subscriptions. The student is NOT locked out here: they enter the grace
 * period (see access.service) and the parent starts getting daily reminders.
 */
const markLapsed = async () => {
  const now = new Date();
  const paid = await LessonFee.find({ "paid.isPaid": true, expired: { $ne: true } });
  for (const sub of paid) {
    const start = sub.paid?.timestamp;
    const days = parseInt(sub.duration, 10);
    if (!start || !(days > 0)) continue;
    const expiry = new Date(start);
    expiry.setDate(expiry.getDate() + days);
    if (now < expiry) continue;

    sub.expired = true;
    sub.expiresAt = expiry;
    await sub.save();

    if (!sub.studentId) continue;
    // A newer paid plan for the same student means they have not actually lapsed.
    const stillPaid = await LessonFee.exists({
      studentId: sub.studentId,
      _id: { $ne: sub._id },
      "paid.isPaid": true,
      expired: { $ne: true },
    });
    if (stillPaid) continue;

    await Student.updateOne(
      { _id: sub.studentId, subscriptionExpiredAt: null },
      {
        subscriptionExpiredAt: expiry,
        expiryGraceEndsAt: computeExpiryGraceEnd(expiry),
        feeReminderLastOn: "",
        feeReminderCount: 0,
        readOnlyNotified: false,
      }
    );
  }
};

const startSubscriptionExpiryJob = () => {
  const safe = (name, fn) => async () => {
    try {
      await fn();
    } catch (e) {
      console.error(`[${name}] failed:`, e);
    }
  };
  cron.schedule("5 0 * * *", safe("markLapsed", markLapsed), { timezone: process.env.TZ });
  cron.schedule("0 9 * * *", safe("feeReminders", () => runFeeReminders()), { timezone: process.env.TZ });
  cron.schedule("10 * * * *", safe("reconcileFlags", reconcileFlags), { timezone: process.env.TZ });
  console.log("Subscription jobs running (lapse check 00:05, parent reminders 09:00, hourly flag sync)");
};

module.exports = { startSubscriptionExpiryJob, markLapsed };
