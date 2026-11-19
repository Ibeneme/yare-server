const Pricing = require("../models/Pricing");
const Student = require("../models/Student");

/**
 * Prices a basket of wards server-side from the Pricing table, so the client can no
 * longer choose its own total. For each ward: the grade price + each enrolled subject price.
 * Returns null if no pricing rows apply (caller decides on a fallback).
 */
const quoteForStudents = async (studentIds, currency) => {
  const students = await Student.find({ _id: { $in: studentIds } })
    .select("gradeId subjects")
    .lean();
  if (!students.length) return null;

  const gradeIds = students.map((s) => s.gradeId).filter(Boolean);
  const subjectIds = students.flatMap((s) => s.subjects || []);
  const rows = await Pricing.find({
    isActive: true,
    $or: [
      { kind: "grade", refId: { $in: gradeIds } },
      { kind: "subject", refId: { $in: subjectIds } },
    ],
  }).lean();
  if (!rows.length) return null;

  const byKey = new Map(rows.map((r) => [`${r.kind}:${r.refId}`, r]));
  const items = [];
  let durationDays = 30;
  for (const s of students) {
    const g = s.gradeId && byKey.get(`grade:${s.gradeId}`);
    if (g) {
      items.push({ kind: "grade", studentId: s._id, refId: g.refId, name: g.name, amount: g.prices[currency] });
      durationDays = g.durationDays || durationDays;
    }
    for (const sub of s.subjects || []) {
      const r = byKey.get(`subject:${sub}`);
      if (r) items.push({ kind: "subject", studentId: s._id, refId: r.refId, name: r.name, amount: r.prices[currency] });
    }
  }
  if (!items.length) return null;
  const amount = items.reduce((t, i) => t + i.amount, 0);
  return { items, amount, durationDays };
};

module.exports = { quoteForStudents };
