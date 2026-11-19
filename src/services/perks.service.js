const AwardGrant = require("../models/AwardGrant");
const LessonFee = require("../models/LessonFee");
const Student = require("../models/Student");
const { addDays } = require("./access.service");

const usable = (now = new Date()) => ({
  "perk.redeemedAt": null,
  $or: [{ "perk.expiresAt": null }, { "perk.expiresAt": { $gt: now } }],
});

/** Human text for a perk, used in emails and the UI. */
const perkText = (perk) => {
  if (!perk || perk.kind === "none") return "";
  if (perk.kind === "free_month") return "1 month of free lessons";
  if (perk.kind === "discount") return `${perk.discountPercent}% off your next payment`;
  return perk.note || "Special reward";
};

/**
 * Applies unredeemed discount awards to a priced basket. quote.items carry studentId.
 * One discount per student (the biggest). Returns { items, amount, appliedPerks }.
 */
const applyDiscounts = async (studentIds, items, currency) => {
  const grants = await AwardGrant.find({ studentId: { $in: studentIds }, "perk.kind": "discount", ...usable() }).lean();
  if (!grants.length) return { items, amount: items.reduce((t, i) => t + i.amount, 0), appliedPerks: [] };
  const best = new Map();
  for (const g of grants) {
    const k = String(g.studentId);
    if (!best.has(k) || g.perk.discountPercent > best.get(k).perk.discountPercent) best.set(k, g);
  }
  const out = items.map((i) => {
    const g = i.studentId && best.get(String(i.studentId));
    return g ? { ...i, amount: Math.round(i.amount * (1 - g.perk.discountPercent / 100) * 100) / 100 } : i;
  });
  return { items: out, amount: out.reduce((t, i) => t + i.amount, 0), appliedPerks: [...best.values()].map((g) => g._id) };
};

const markRedeemed = (ids) =>
  ids?.length ? AwardGrant.updateMany({ _id: { $in: ids } }, { $set: { "perk.redeemedAt": new Date() } }) : null;

/** Free month: a zero-amount paid LessonFee, extending from the current expiry if there is one. */
const redeemFreeMonth = async (grant, payerId) => {
  const now = new Date();
  const latest = await LessonFee.findOne({ studentId: grant.studentId, "paid.isPaid": true }).sort({ expiresAt: -1 });
  const from = latest?.expiresAt && latest.expiresAt > now ? latest.expiresAt : now;
  const expiresAt = addDays(from, 30);
  const fee = await LessonFee.create({
    studentId: grant.studentId, payerId, planName: `Award: ${grant.title}`, duration: "30", amount: 0,
    expired: false, expiresAt, reference: `award_${grant._id}`,
    paid: { isPaid: true, timestamp: now, paymentMethod: "award", paymentService: "yare" },
  });
  await Student.findByIdAndUpdate(grant.studentId, {
    isSubscribed: true, isPaid: true, lessonFeeId: fee._id, subscriptionExpiredAt: null, expiryGraceEndsAt: null,
    feeReminderLastOn: "", feeReminderCount: 0, readOnlyNotified: false,
  });
  grant.perk.redeemedAt = now;
  await grant.save();
  return fee;
};

module.exports = { perkText, applyDiscounts, markRedeemed, redeemFreeMonth, usable };
