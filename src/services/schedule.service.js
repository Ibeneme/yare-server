/**
 * Works out when a class meets. A class has `schedules`; each is one of
 * daily / weekly / monthly / none (specific dates), with its own time slots.
 */
const isoDay = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

/** Start times (Date[]) of every session of `cls` on the calendar day of `day`. */
const occurrencesOnDay = (cls, day) => {
  const out = [];
  const dow = day.getDay();
  const dom = day.getDate();
  const dayKey = isoDay(day);
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(day);
  dayEnd.setHours(23, 59, 59, 999);

  for (const sch of cls.schedules || []) {
    if (sch.startDate && new Date(sch.startDate) > dayEnd) continue;
    if (sch.endDate && new Date(sch.endDate) < dayStart) continue;

    let slots = [];
    if (sch.frequency === "daily") slots = sch.timeSlots || [];
    else if (sch.frequency === "weekly") slots = (sch.daysOfWeek || []).find((d) => d.day === dow)?.timeSlots || [];
    else if (sch.frequency === "monthly") slots = (sch.daysOfMonth || []).find((d) => d.day === dom)?.timeSlots || [];
    else if (sch.frequency === "none") {
      slots = (sch.specificDates || []).find((sd) => isoDay(sd.date) === dayKey)?.timeSlots || [];
    }

    for (const slot of slots) {
      const [h, m] = String(slot.startTime).split(":").map(Number);
      const startsAt = new Date(day);
      startsAt.setHours(h, m, 0, 0);
      out.push({ startsAt, slot });
    }
  }
  return out;
};

/** Sessions starting within (fromMs, toMs] milliseconds from `now`. */
const upcomingSessions = (cls, now, fromMs, toMs) => {
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return [...occurrencesOnDay(cls, today), ...occurrencesOnDay(cls, tomorrow)].filter((o) => {
    const diff = o.startsAt.getTime() - now.getTime();
    return diff > fromMs && diff <= toMs;
  });
};

/** Is a class in session right now? (used by the classroom to open the door) */
const isLiveNow = (cls, now = new Date(), graceMinutes = 15) => {
  const hhmm = (d) => d.getHours() * 60 + d.getMinutes();
  const nowMin = hhmm(now);
  return occurrencesOnDay(cls, now).some(({ startsAt, slot }) => {
    const [eh, em] = String(slot.endTime).split(":").map(Number);
    return nowMin >= hhmm(startsAt) - graceMinutes && nowMin <= eh * 60 + em + graceMinutes;
  });
};

module.exports = { occurrencesOnDay, upcomingSessions, isLiveNow };
