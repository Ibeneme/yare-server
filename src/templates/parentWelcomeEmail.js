const { layout, p, facts, note, button, esc, APP_URL } = require("./emailLayout");

module.exports = ({ parentName, parentEmail, parentPassword, children = [] }) =>
  layout({
    preheader: "Your Yare Height parent account is ready",
    eyebrow: "Welcome",
    title: `Welcome, ${parentName}`,
    body:
      p("Your parent account is ready. You can manage your children, choose their subjects and pay securely from one place.") +
      facts([["Email", parentEmail], ["Temporary password", parentPassword]]) +
      (children.length
        ? p("<b>Your children</b>") + facts(children.map((c) => [`${c.firstName}`, `${c.email} · ${c.password}`]))
        : "") +
      note("Change your password from your profile after signing in.", "warn") +
      button("Sign in", APP_URL + "/sign-in?type=parent"),
  });
