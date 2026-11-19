const { layout, p, esc, C } = require("./emailLayout");

/** The mail service pulls the code from `.otp-box` for its plain-text copy, so keep that class. */
module.exports = ({ displayName, isNewParent, otp }) =>
  layout({
    preheader: `Your code is ${otp}`,
    eyebrow: "Verification",
    title: isNewParent ? "Welcome. Confirm your email" : "Your verification code",
    body:
      p(`Hi ${esc(displayName || "there")}, enter this code to continue. It is valid for 30 minutes.`) +
      `<div class="otp-box" style="margin:0 0 20px;padding:18px;text-align:center;background:${C.yellowSoft};border-radius:20px;font-size:36px;font-weight:800;letter-spacing:10px;color:${C.deep};">${esc(otp)}</div>` +
      p(`<span style="color:${C.muted};font-size:14px;">Never share this code. Yare staff will not ask for it.</span>`),
  });
