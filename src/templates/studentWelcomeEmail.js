const { layout, p, facts, note, button, esc, APP_URL } = require("./emailLayout");

module.exports = ({ firstName, email, password }) =>
  layout({
    preheader: "Your Yare Height account is ready",
    eyebrow: "Welcome",
    title: `Welcome, ${firstName}`,
    body:
      p("Your student account is ready. Sign in with the details below and change your password from your profile.") +
      facts([["Email", email], ["Temporary password", password]]) +
      note("Keep these details private.", "warn") +
      button("Sign in", APP_URL + "/sign-in?type=student"),
  });
