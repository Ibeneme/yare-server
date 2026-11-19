const { layout, p, note, button, esc } = require("./emailLayout");
const LABEL = { general: "Update", reminder: "Reminder", alert: "Alert", success: "Success", schedule: "Schedule", message: "Message" };
const TONE = { alert: "bad", reminder: "warn", success: "good" };

/** Default body for any in-app notification that is also emailed (class reminders, fee notices, awards…). */
module.exports = ({ title, description, type = "general", link }) =>
  layout({
    preheader: String(description || "").slice(0, 110),
    eyebrow: LABEL[type] || "Update",
    title,
    body: p(esc(description || "").replace(/\n/g, "<br>")) + (TONE[type] ? "" : "") + (link ? button("Open Yare Height", link) : ""),
    footerNote: "You are receiving this because you have a Yare Height account.",
  });
