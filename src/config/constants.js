const ROLES = Object.freeze({
  SUPER_ADMIN: "superadmin",
  ADMIN: "admin",
  TEACHER: "teacher",
  STUDENT: "student",
  PARENT: "parent",
});
const CURRENCIES = Object.freeze(["NGN", "USD"]);
const REMINDER_MINUTES_BEFORE = 30;
// After a subscription lapses the student keeps full access, the parent is reminded daily
// for FEE_REMINDER_DAYS, and access stays full until the end of that calendar month, then read-only.
const FEE_REMINDER_DAYS = 14;
const GRACE_OPTIONS = Object.freeze({ "3d": { days: 3 }, "1w": { days: 7 }, "4w": { days: 28 }, "3m": { months: 3 } });

module.exports = {
  FEE_REMINDER_DAYS,
  GRACE_OPTIONS, ROLES, CURRENCIES, REMINDER_MINUTES_BEFORE };
