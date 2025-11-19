// templates/paymentEmail.js
module.exports = ({ displayName, updatedPayments, reference }) => {
  console.log("Generating payment confirmation email for:", displayName);
  console.log("Number of subscriptions:", updatedPayments.length);
  console.log("Reference:", reference);

  const formatDate = (date) =>
    new Date(date).toLocaleDateString("en-NG", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  const formatTime = (date) =>
    new Date(date).toLocaleTimeString("en-NG", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  const totalAmount = updatedPayments.reduce((sum, p) => sum + p.amount, 0);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Subscription Confirmed - Yare</title>
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
              <p style="margin:0;font-size:16px;opacity:0.9;">Payment Confirmed</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 24px;">
              <h2 style="margin:0 0 16px 0;font-size:20px;font-weight:600;color:#1A5F3A;">Hi ${displayName},</h2>
              <p style="margin:0 0 24px 0;font-size:16px;color:#4B5563;">
                Your payment was successful! Your learner(s) now have full access to their classes.
              </p>

              <!-- Success Badge -->
              <div style="background:linear-gradient(135deg,#D1FAE5 0%,#A7F3D0 100%);border-radius:12px;padding:16px;text-align:center;margin:24px 0;border:1px solid #6EE7B7;">
                <p style="margin:0;font-size:20px;font-weight:700;color:#065F46;">
                  Payment Successful
                </p>
              </div>

              <!-- Subscription Cards -->
              ${updatedPayments
                .map(
                  (p) => `
              <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:12px;padding:16px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                  <p style="margin:0;font-weight:600;color:#1A5F3A;">${p.student?.name || "Student"}</p>
                  <p style="margin:0;font-size:12px;color:#6B7280;">Ref: ${reference}</p>
                </div>

                <table role="presentation" width="100%" style="font-size:14px;color:#4B5563;">
                  <tr>
                    <td style="padding:4px 0;"><strong>Amount:</strong></td>
                    <td style="text-align:right;">₦${p.amount.toLocaleString()}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;"><strong>Plan:</strong></td>
                    <td style="text-align:right;">${p.planName}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;"><strong>Duration:</strong></td>
                    <td style="text-align:right;">${p.duration} days</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;"><strong>Expires:</strong></td>
                    <td style="text-align:right;">${formatDate(p.expiresAt)}</td>
                  </tr>
                  <tr>
                    <td style="padding:4px 0;"><strong>Paid on:</strong></td>
                    <td style="text-align:right;">${formatDate(p.paid.timestamp)} at ${formatTime(p.paid.timestamp)}</td>
                  </tr>
                </table>
              </div>
              `
                )
                .join("")}

              <!-- Total -->
              <div style="background:#1A5F3A;color:white;border-radius:12px;padding:16px;text-align:center;margin:24px 0;">
                <p style="margin:0;font-size:14px;opacity:0.9;">Total Amount Paid</p>
                <p style="margin:8px 0 0 0;font-size:24px;font-weight:700;">₦${totalAmount.toLocaleString()}</p>
              </div>

              <!-- CTA Button -->
              <div style="text-align:center;margin:32px 0;">
                <a href="https://yare.ng/classes/dashboard/all" 
                   style="display:inline-block;background:#FCD34D;color:#1A5F3A !important;font-weight:700;font-size:16px;text-decoration:none;padding:14px 32px;border-radius:12px;box-shadow:0 4px 12px rgba(252,211,77,0.4);">
                  Go to Dashboard
                </a>
              </div>

              <p style="margin:24px 0 0 0;font-size:14px;color:#6B7280;text-align:center;">
                Need help? <a href="mailto:support@yare.ng" style="color:#1A5F3A;font-weight:500;">Contact Support</a>
              </p>
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
  `.trim();
};