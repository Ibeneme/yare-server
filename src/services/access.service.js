const { FEE_REMINDER_DAYS, GRACE_OPTIONS } = require("../config/constants");

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

/** Grace end for a lapse: the later of 14 days after expiry and the end of the expiry month. */
const computeExpiryGraceEnd = (expiredAt) => {
  const a = addDays(expiredAt, FEE_REMINDER_DAYS);
  const b = endOfMonth(expiredAt);
  return a > b ? a : b;
};

const graceEndFrom = (duration, from = new Date()) => {
  const opt = GRACE_OPTIONS[duration];
  if (!opt) return null;
  const d = new Date(from);
  if (opt.days) d.setDate(d.getDate() + opt.days);
  if (opt.months) d.setMonth(d.getMonth() + opt.months);
  return d;
};

/**
 * One place that decides what a student may do.
 *   mode: "full" | "read_only"
 *   reason (internal, never shown to the student): paid | admin_grace | expiry_grace | lapsed | not_subscribed
 */
const getAccessState = (student, now = new Date()) => {
  if (student.adminGraceUntil && new Date(student.adminGraceUntil) > now) {
    return { mode: "full", reason: "admin_grace", until: student.adminGraceUntil };
  }
  if (student.subscriptionExpiredAt) {
    const end = student.expiryGraceEndsAt || computeExpiryGraceEnd(new Date(student.subscriptionExpiredAt));
    if (now <= end) return { mode: "full", reason: "expiry_grace", until: end };
    return { mode: "read_only", reason: "lapsed", since: end };
  }
  if (student.isPaid) return { mode: "full", reason: "paid" };
  if (student.trialEndsAt) {
    const end = new Date(student.trialEndsAt);
    return now <= end ? { mode: "full", reason: "trial", until: end } : { mode: "read_only", reason: "trial_ended", since: end };
  }
  if (student.isSubscribed) return { mode: "full", reason: "paid" };
  // Never subscribed: unchanged from before (not blocked by the API here).
  return { mode: "full", reason: "not_subscribed" };
};

/** What the student's own client may see: no mention of fees. */
const publicAccessView = (state) => ({
  mode: state.mode,
  readOnly: state.mode === "read_only",
  message: state.mode === "read_only" ? "Your account is in view-only mode for now." : null,
});

module.exports = { getAccessState, publicAccessView, computeExpiryGraceEnd, graceEndFrom, addDays };
