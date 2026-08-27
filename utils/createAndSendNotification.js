const Notification = require("../models/Notifications");
const sendEmail = require("./mailer"); // or "./sendEmail" depending on your file name

/**
 * Create a notification + optionally email the user
 *
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.description
 * @param {string|ObjectId} options.recipientId
 * @param {"Teacher"|"Student"|"Parent"|"Admin"} options.recipientModel
 * @param {string} [options.email] - if provided, an email will be sent
 * @param {string} [options.emailSubject] - defaults to title
 * @param {string} [options.html] - custom HTML body (optional)
 * @param {string} [options.type="general"]
 * @param {string|ObjectId} [options.relatedId]
 * @param {string|ObjectId} [options.senderId]
 * @param {"Teacher"|"Student"|"Parent"|"Admin"} [options.senderModel]
 * @param {Object} [options.meta={}]
 * @param {boolean} [options.sendMail=true]
 */

const YARE_URL = "https://www.yareheightlearninghub.com/";

// Inline SVG icons (email-safe, no external requests, no emoji rendering issues)
const ICONS = {
  bell: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3a6 6 0 0 0-6 6v3.2c0 .6-.24 1.18-.66 1.6L4 15.17V17h16v-1.83l-1.34-1.37a2.27 2.27 0 0 1-.66-1.6V9a6 6 0 0 0-6-6Z" stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round"/><path d="M9.5 20a2.5 2.5 0 0 0 5 0" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  reminder: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="13" r="7.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 9.5V13l2.5 1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 3h6M5.5 6.5 7 5M18.5 6.5 17 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  alert: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3.5 21.5 20h-19L12 3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17" r="0.9" fill="currentColor"/></svg>`,
  success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8"/><path d="M8.3 12.3l2.5 2.5 5-5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  schedule: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  message: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 5.5h16v10.5H9.5L5.5 19v-3H4V5.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`,
  general: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 8v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16" r="0.9" fill="currentColor"/></svg>`,
  support: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;margin-right:4px;"><path d="M4 6.5 12 12l8-5.5" stroke="#1A5F3A" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><rect x="3.5" y="5" width="17" height="14" rx="2.3" stroke="#1A5F3A" stroke-width="1.7"/></svg>`,
  leaf: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 19c8.5 0 14-5.5 14-14 0 0-9 0-13 4S5 19 5 19Z" stroke="#1A5F3A" stroke-width="1.7" stroke-linejoin="round"/><path d="M6 18c2-4 4.5-7 9-9.5" stroke="#1A5F3A" stroke-width="1.7" stroke-linecap="round"/></svg>`,
};

const TYPE_STYLES = {
  general: {
    label: "Update",
    bg: "#EEF2FF",
    color: "#4338CA",
    icon: ICONS.general,
  },
  reminder: {
    label: "Reminder",
    bg: "#FFF7ED",
    color: "#C2410C",
    icon: ICONS.reminder,
  },
  alert: { label: "Alert", bg: "#FEF2F2", color: "#B91C1C", icon: ICONS.alert },
  success: {
    label: "Success",
    bg: "#F0FDF4",
    color: "#15803D",
    icon: ICONS.success,
  },
  schedule: {
    label: "Schedule",
    bg: "#F0F9FF",
    color: "#0369A1",
    icon: ICONS.schedule,
  },
  message: {
    label: "Message",
    bg: "#FAF5FF",
    color: "#7E22CE",
    icon: ICONS.message,
  },
};

const escapeHtml = (str = "") =>
  str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const createAndSendNotification = async ({
  title,
  description,
  recipientId,
  recipientModel,
  email = null,
  emailSubject = null,
  html = null,
  type = "general",
  relatedId = null,
  senderId = null,
  senderModel = null,
  meta = {},
  sendMail = true,
}) => {
  // 1. ALWAYS create the notification in DB first so it's guaranteed to be added to the schema
  const notification = await Notification.create({
    title,
    description,
    recipient: recipientId,
    recipientModel,
    sender: senderId || undefined,
    senderModel: senderModel || undefined,
    type,
    relatedId,
    meta,
    isRead: false,
  });

  // 2. Optionally send email (wrapped in try/catch so email failures don't crash the flow)
  if (sendMail && email) {
    try {
      const subject = emailSubject || title;

      const safeDescription = escapeHtml(description || "").replace(
        /\n/g,
        "<br>"
      );
      const safeTitle = escapeHtml(title || "");

      const badge = TYPE_STYLES[type] || TYPE_STYLES.general;

      const emailHtml =
        html ||
        `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject} · Yare</title>
</head>
<body style="margin:0;padding:0;background-color:#eef1f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">

  <!-- Preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">
    ${safeTitle} — ${safeDescription.replace(/<br>/g, " ").slice(0, 120)}
  </div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef1f5;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Wordmark above the card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;margin-bottom:22px;">
          <tr>
            <td align="center">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding-right:6px;vertical-align:middle;">${
                    ICONS.leaf
                  }</td>
                  <td style="vertical-align:middle;font-size:15px;font-weight:700;color:#1A5F3A;letter-spacing:0.5px;">YARE</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.08);border:1px solid #e9ecf1;">

          <!-- Header strip: icon left, label right -->
          <tr>
            <td style="background:linear-gradient(135deg,#1A5F3A 0%,#2D7A56 55%,#3E9169 100%);padding:26px 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td width="44" style="vertical-align:middle;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="44" height="44" style="background-color:rgba(255,255,255,0.16);border-radius:12px;">
                      <tr><td align="center" valign="middle">${
                        ICONS.bell
                      }</td></tr>
                    </table>
                  </td>
                  <td style="vertical-align:middle;padding-left:12px;">
                    <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.92);text-transform:uppercase;letter-spacing:2px;">Notification</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:30px 32px 28px 32px;">

              <!-- Type badge with icon -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:16px;">
                <tr>
                  <td style="background-color:${badge.bg};color:${
          badge.color
        };border-radius:999px;padding:6px 14px;">
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                      <tr>
                        <td style="vertical-align:middle;padding-right:6px;line-height:0;color:${
                          badge.color
                        };">${badge.icon}</td>
                        <td style="vertical-align:middle;font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:${
                          badge.color
                        };">${badge.label}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Title -->
              <h1 style="margin:0 0 18px 0;font-size:21px;font-weight:700;color:#0f172a;line-height:1.35;">
                ${safeTitle}
              </h1>

              <!-- Content block, left accent bar -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8fafc;border-radius:12px;">
                <tr>
                  <td width="4" style="background-color:#1A5F3A;border-radius:4px 0 0 4px;">&nbsp;</td>
                  <td style="padding:18px 22px;">
                    <p style="margin:0;font-size:15px;line-height:1.7;color:#334155;">
                      ${safeDescription}
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;">
                <tr>
                  <td style="background-color:#1A5F3A;border-radius:10px;">
                    <a href="${YARE_URL}" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Open Yare
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <div style="height:1px;background-color:#eef1f5;margin:30px 0 20px 0;"></div>

              <!-- Help link -->
              <p style="margin:0;font-size:13px;color:#64748b;text-align:center;">
                ${
                  ICONS.support
                }Need help? <a href="mailto:support@yareheightlearninghub.com" style="color:#1A5F3A;font-weight:600;text-decoration:none;">Contact Support</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:22px 32px;text-align:center;border-top:1px solid #eef1f5;">
              <p style="margin:0 0 6px 0;font-size:12px;color:#64748b;">
                © ${new Date().getFullYear()} <strong style="color:#334155;">Yare Height Learning Hub</strong>
              </p>
              <p style="margin:0;">
                <a href="${YARE_URL}" style="font-size:12px;color:#1A5F3A;text-decoration:none;font-weight:600;">yareheightlearninghub.com</a>
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

        <!-- Sub-footer note -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;margin-top:20px;">
          <tr>
            <td align="center">
              <p style="margin:0;font-size:11px;color:#94a3b8;">
                You're receiving this because you have an active Yare account.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>
    `;

      await sendEmail(email, subject, emailHtml);
    } catch (emailError) {
      console.error("Failed to send notification email:", emailError);
      // The notification is already safely stored in the database schema above,
      // so we just log the email failure here without breaking execution.
    }
  }

  return notification;
};

module.exports = createAndSendNotification;
