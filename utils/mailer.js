// utils/sendEmail.js
const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, html, textFallback = null) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: { rejectUnauthorized: false },
  });

  // Extract OTP for plain text fallback
  const otpMatch = html.match(/<div class="otp-box">(\d+)<\/div>/);
  const otp = otpMatch ? otpMatch[1] : "XXXXXX";

  const plainText = textFallback || `
Hello,

Your OTP to complete registration is: ${otp}

Valid for 30 minutes only.
Do not share this code with anyone.

— Yare Team
  `.trim();

  await transporter.sendMail({
    from: `"Yare Admin" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text: plainText,
    html, // THIS MAKES IT RENDER AS HTML
  });

  console.log(`Email sent to: ${to}`);
};

module.exports = sendEmail;