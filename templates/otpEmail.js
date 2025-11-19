module.exports = ({ displayName, isNewParent, otp }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Your Yare OTP</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#333;line-height:1.6;">
  
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f4f4;padding:20px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.05);border:1px solid #e5e7eb;" cellspacing="0" cellpadding="0">
          
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1A5F3A 0%,#2D7A56 100%);color:white;padding:32px 24px;text-align:center;">
              <h1 style="margin:0 0 8px 0;font-size:32px;font-weight:700;letter-spacing:-0.5px;">Yare</h1>
              <p style="margin:0;font-size:16px;opacity:0.9;">Secure Access</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 24px;">
              <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1A5F3A;">Hi ${displayName},</h2>
              <p style="margin:0 0 24px 0;font-size:16px;color:#4B5563;">
                ${
                  isNewParent
                    ? "Your One-Time Password (OTP) to complete your registration is:"
                    : "Here is your OTP to continue:"
                }
              </p>

              <!-- OTP Box -->
              <div style="background:linear-gradient(135deg,#FCD34D 0%,#FBBF24 100%);border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
                <p style="margin:0;font-size:32px;font-weight:700;color:#1A5F3A;letter-spacing:8px;font-family:'Courier New',monospace;">
                  ${otp}
                </p>
              </div>

              <p style="margin:24px 0 0 0;font-size:14px;color:#6B7280;text-align:center;">
                This OTP expires in <strong>10 minutes</strong>. Do not share it with anyone.
              </p>

              <!-- CTA Button -->
              <div style="text-align:center;margin:32px 0;">
                <a href="https://yare.ng/verify-otp" 
                   style="display:inline-block;background:#1A5F3A;color:white !important;font-weight:600;font-size:16px;text-decoration:none;padding:14px 32px;border-radius:12px;box-shadow:0 4px 12px rgba(26,95,58,0.3);">
                  Verify Now
                </a>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#F9FAFB;padding:24px;text-align:center;font-size:13px;color:#6B7280;border-top:1px solid #E5E7EB;">
              <p style="margin:0;">© 2025 <strong>Yare</strong> • Lagos, Nigeria</p>
              <p style="margin:8px 0 0 0;">
                <a href="https://yare.ng" style="color:#1A5F3A;text-decoration:none;font-weight:500;">yare.ng</a>
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
