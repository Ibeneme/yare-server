const { layout, p, facts, note, button, esc, money, date, time, APP_URL } = require("./emailLayout");

/** Payment receipt. Signature unchanged: ({ displayName, updatedPayments, reference }). */
module.exports = ({ displayName, updatedPayments = [], reference }) => {
  const cur = updatedPayments[0]?.currency || "NGN";
  const total = updatedPayments.reduce((s, x) => s + (x.amount || 0), 0);
  const paidAt = updatedPayments[0]?.paid?.timestamp;
  const rows = updatedPayments.map((x) => [`${x.student?.name || "Student"} · ${x.planName || "Lessons"}`, money(x.amount, x.currency || cur)]);
  const body =
    p(`Hi ${esc(displayName)}, thank you. Your payment went through and learning access is active.`) +
    facts([...rows, ["Total paid", money(total, cur)], ["Reference", reference || "-"], ...(paidAt ? [["Paid on", `${date(paidAt)}, ${time(paidAt)}`]] : [])]) +
    updatedPayments.map((x) => (x.expiresAt ? note(`<b>${esc(x.student?.name || "Student")}</b> has access until <b>${esc(date(x.expiresAt))}</b>.`, "good") : "")).join("") +
    button("Open Yare Height", APP_URL + "/app/transactions");
  return layout({ preheader: `Receipt ${reference || ""}: ${money(total, cur)}`, eyebrow: "Payment receipt", title: "Payment confirmed", body, footerNote: "Keep this email as your receipt." });
};
