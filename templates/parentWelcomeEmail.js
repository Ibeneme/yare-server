module.exports = ({ parentName, parentEmail, parentPassword, children }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to Yare</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#333;line-height:1.6;">
  
  <!-- Outer Table -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.05);border:1px solid #e5e7eb;" cellspacing="0" cellpadding="0">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1A5F3A 0%,#2D7A56 100%);color:white;padding:32px 24px;text-align:center;">
              <h1 style="margin:0 0 8px 0;font-size:32px;font-weight:700;letter-spacing:-0.5px;">Yare</h1>
              <p style="margin:0;font-size:16px;opacity:0.9;">Digital School from Home</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 24px;">
              <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1A5F3A;">Hello ${parentName},</h2>
              <p style="margin:0 0 24px 0;font-size:16px;color:#4B5563;">
                Your family account has been successfully created. Below are your login details:
              </p>

              <!-- Parent Credentials -->
              <table role="presentation" width="100%" style="background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:24px;font-family:'Courier New',monospace;" cellspacing="0" cellpadding="0">
                <tr><td style="padding:0 0 12px 0;font-size:15px;"><strong style="color:#1F2937;">Email:</strong> ${parentEmail}</td></tr>
                <tr><td style="padding:0;font-size:15px;"><strong style="color:#1F2937;">Password:</strong> ${parentPassword}</td></tr>
              </table>

              <div style="background-color:#FFFBEB;border:1px solid #FCD34D;border-radius:10px;padding:16px;margin:20px 0;font-size:14px;color:#92400E;">
                <strong style="color:#B45309;">Please change your password after your first login.</strong>
              </div>

              <!-- Children List -->
              ${
                children.length > 0
                  ? `
                <h3 style="margin:24px 0 16px 0;font-size:18px;font-weight:600;color:#1A5F3A;">Your Children</h3>
                ${children
                  .map(
                    (c) => `
                  <div style="background-color:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin-bottom:16px;font-family:'Courier New',monospace;">
                    <p style="margin:0 0 8px 0;font-size:15px;"><strong style="color:#1F2937;">Name:</strong> ${c.firstName}</p>
                    <p style="margin:0 0 8px 0;font-size:15px;"><strong style="color:#1F2937;">Email:</strong> ${c.email}</p>
                    <p style="margin:0;font-size:15px;"><strong style="color:#1F2937;">Password:</strong> ${c.password}</p>
                  </div>
                `
                  )
                  .join("")}
              `
                  : ""
              }

              <!-- CTA Button -->
              <div style="text-align:center;margin:32px 0;">
                <a href="https://yare.ng/login" 
                   style="display:inline-block;background:linear-gradient(135deg,#FCD34D 0%,#FBBF24 100%);color:#1A5F3A !important;font-weight:600;font-size:16px;text-decoration:none;padding:14px 32px;border-radius:12px;box-shadow:0 4px 12px rgba(252,211,77,0.3);">
                  Login to Your Dashboard
                </a>
              </div>

              <!-- Support -->
              <p style="margin:24px 0 0 0;font-size:15px;color:#4B5563;text-align:center;">
                Need help? 
                <a href="https://wa.me/2349012345678" style="color:#1A5F3A;text-decoration:none;font-weight:600;">Chat with us on WhatsApp</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F9FAFB;padding:24px;text-align:center;font-size:13px;color:#6B7280;border-top:1px solid #E5E7EB;">
              <p style="margin:0;">© 2025 <strong>Yare</strong> • Lagos, Nigeria</p>
              <p style="margin:8px 0 0 0;">
                <a href="https://yare.ng" style="color:#1A5F3A;text-decoration:none;font-weight:500;">yare.ng</a> • 
                <a href="mailto:support@yare.ng" style="color:#1A5F3A;text-decoration:none;font-weight:500;">support@yare.ng</a>
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
