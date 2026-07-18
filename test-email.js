// test-email.js
const nodemailer = require("nodemailer");
require("dotenv").config();

async function testEmail() {
  console.log("📧 Testing email configuration...");
  console.log("From:", process.env.SMTP_USER);
  console.log("Host:", process.env.SMTP_HOST);
  console.log("Port:", process.env.SMTP_PORT);

  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Verify connection
    console.log("🔍 Verifying connection...");
    await transporter.verify();
    console.log("✅ Connection verified successfully!");

    // Send test email (send it to yourself)
    const mailOptions = {
      from: `"Visitor System" <${process.env.SMTP_FROM}>`,
      to: "sonutech04@gmail.com", // Sending to yourself for testing
      subject: "✅ Test Email from Visitor Management System",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1a237e; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f5f5f5; padding: 30px; border-radius: 0 0 8px 8px; }
            .success { color: #2e7d32; font-size: 24px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Email Test Successful!</h1>
            </div>
            <div class="content">
              <h2 class="success">✅ Your email configuration is working!</h2>
              <p>This is a test email from your Visitor Management System.</p>
              <p><strong>Email Account:</strong> ${process.env.SMTP_USER}</p>
              <p><strong>Sent at:</strong> ${new Date().toLocaleString()}</p>
              <p>You can now send QR codes via email to your visitors.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };

    console.log("📤 Sending test email...");
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Email sent successfully!");
    console.log("📨 Message ID:", info.messageId);
    console.log("📬 Response:", info.response);
    console.log(`\n📧 Check your inbox at: sonutech04@gmail.com`);
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.response) {
      console.error("📝 Response:", error.response);
    }
  }
}

testEmail();
