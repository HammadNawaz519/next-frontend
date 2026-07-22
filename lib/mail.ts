import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USERNAME!,
    pass: process.env.MAIL_PASSWORD!,
  },
});

export async function sendVerificationEmail(to: string, code: string, username?: string | null) {
  if (!process.env.MAIL_USERNAME || !process.env.MAIL_PASSWORD) {
    throw new Error("Email server credentials (MAIL_USERNAME / MAIL_PASSWORD) are not configured in Vercel Environment Variables.");
  }

  const displayName = username || to.split("@")[0];

  await transporter.sendMail({
    from: `"Verify Your Account" <${process.env.MAIL_USERNAME}>`,
    to,
    subject: "Your verification code",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
        </head>
        <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
            <tr>
              <td align="center">
                <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
                  <!-- Header gradient bar -->
                  <tr>
                    <td style="background:linear-gradient(135deg,hsla(30, 100%, 0%, 1.00),hsl(38,100%,65%));height:6px;"></td>
                  </tr>
                  <!-- Body -->
                  <tr>
                    <td style="padding:48px 40px 40px;">
                      <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#111827;letter-spacing:-0.3px;">
                        Verify your email
                      </h1>
                      <p style="margin:0 0 32px;font-size:14px;color:#6b7280;line-height:1.6;">
                        Hey ${displayName}, use the code below to verify your email address. It expires in <strong>15 minutes</strong>.
                      </p>

                      <!-- OTP Box -->
                      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:16px;padding:28px;text-align:center;margin-bottom:32px;">
                        <p style="margin:0 0 8px;font-size:12px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Verification Code</p>
                        <p style="margin:0;font-size:42px;font-weight:700;letter-spacing:12px;color:#111827;font-variant-numeric:tabular-nums;">${code}</p>
                      </div>

                      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
                        If you didn't create an account, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:20px 40px;">
                      <p style="margin:0;font-size:12px;color:#d1d5db;text-align:center;">
                        This code is valid for 15 minutes · Do not share it with anyone
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `,
  });
}
