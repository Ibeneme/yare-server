const { layout, p, facts, note, button, esc, date, APP_URL } = require("./emailLayout");

module.exports = ({ recipientName, studentName, title, description, perkText, expiresAt }) =>
  layout({
    preheader: `${studentName} earned an award: ${title}`,
    eyebrow: "New award",
    title: `${studentName} earned “${title}”`,
    body:
      p(`Hi ${esc(recipientName)}, congratulations. ${esc(description || "")}`) +
      (perkText ? facts([["Reward", perkText], ...(expiresAt ? [["Use by", date(expiresAt)]] : [])]) + note("Rewards apply automatically at your next payment, or can be redeemed from the Awards page.", "good") : "") +
      button("See awards", APP_URL + "/app/awards"),
  });
