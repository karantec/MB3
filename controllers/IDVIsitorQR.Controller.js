// controllers/IDVIsitorQR.Controller.js
const QRModel = require("../models/User/IdVisitorQR.model");
const QRCode = require("qrcode");
const crypto = require("crypto");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// ============================
// EMAIL CONFIGURATION
// ============================

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ============================
// QR CODE GENERATION HELPERS
// ============================

const generateQRToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

const generateQRCodeImage = async (token) => {
  try {
    const qrDataUrl = await QRCode.toDataURL(token, {
      width: 300,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
      errorCorrectionLevel: "H",
    });
    return qrDataUrl;
  } catch (error) {
    console.error("QR generation error:", error);
    return `qr_${token.substring(0, 8)}`;
  }
};

const getExpiryDate = (hours = 24) => {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

const findValidVisitorByToken = async (token) => {
  if (!token || typeof token !== "string") return null;

  const normalizedToken = token.trim();
  if (!normalizedToken) return null;

  const now = new Date();

  return QRModel.findOne({
    qrToken: normalizedToken,
    qrExpiresAt: { $gt: now },
  }).lean();
};

// ============================
// PDF GENERATION HELPER
// ============================

const generateVisitorPDF = async (visitorData, qrCodeImage) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: "A4",
        margin: 50,
        info: {
          Title: `Visitor Pass - ${visitorData.visitorName}`,
          Author: "Visitor Management System",
        },
      });

      const buffers = [];
      doc.on("data", buffers.push.bind(buffers));
      doc.on("end", () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // Header
      doc
        .fontSize(24)
        .font("Helvetica-Bold")
        .fillColor("#1a237e")
        .text("VISITOR PASS", { align: "center" })
        .moveDown();

      // Divider
      doc
        .strokeColor("#1a237e")
        .lineWidth(2)
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke()
        .moveDown();

      // Visitor Details
      doc
        .fontSize(14)
        .font("Helvetica-Bold")
        .fillColor("#333")
        .text("Visitor Information", { underline: true })
        .moveDown(0.5);

      const details = [
        { label: "Name", value: visitorData.visitorName },
        { label: "Phone", value: visitorData.phoneNumber },
        { label: "Email", value: visitorData.email || "N/A" },
        { label: "Company", value: visitorData.company || "N/A" },
        { label: "ID Number", value: visitorData.idNumber || "N/A" },
        { label: "Purpose", value: visitorData.purpose || "Meeting" },
        {
          label: "Valid Until",
          value: new Date(visitorData.qrExpiresAt).toLocaleString(),
        },
        {
          label: "Status",
          value: visitorData.checkedIn ? "✓ Checked In" : "⏳ Not Checked In",
        },
      ];

      // Two column layout for details
      const midPoint = Math.ceil(details.length / 2);
      const leftCol = details.slice(0, midPoint);
      const rightCol = details.slice(midPoint);

      const startY = doc.y;
      let leftY = startY;
      let rightY = startY;

      // Left column
      leftCol.forEach((item) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#555")
          .text(`${item.label}: `, 50, leftY, { continued: true })
          .font("Helvetica")
          .fillColor("#000")
          .text(item.value)
          .moveDown(0.3);
        leftY = doc.y;
      });

      // Right column
      doc.y = startY;
      rightCol.forEach((item) => {
        doc
          .font("Helvetica-Bold")
          .fontSize(11)
          .fillColor("#555")
          .text(`${item.label}: `, 300, doc.y, { continued: true })
          .font("Helvetica")
          .fillColor("#000")
          .text(item.value)
          .moveDown(0.3);
      });

      doc.moveDown(2);

      // QR Code Section
      doc
        .font("Helvetica-Bold")
        .fontSize(14)
        .fillColor("#333")
        .text("QR Code", { underline: true })
        .moveDown(0.5);

      // Add QR Code Image
      if (qrCodeImage && qrCodeImage.startsWith("data:image")) {
        const base64Data = qrCodeImage.replace(/^data:image\/png;base64,/, "");
        const imageBuffer = Buffer.from(base64Data, "base64");
        doc.image(imageBuffer, {
          fit: [180, 180],
          align: "center",
          valign: "center",
        });
      } else {
        doc
          .fontSize(12)
          .fillColor("#999")
          .text("QR Code Token: " + visitorData.qrToken, { align: "center" });
      }

      doc.moveDown();

      // Footer with instructions
      doc
        .moveDown()
        .strokeColor("#ddd")
        .lineWidth(1)
        .moveTo(50, doc.y)
        .lineTo(550, doc.y)
        .stroke()
        .moveDown();

      doc
        .fontSize(10)
        .fillColor("#666")
        .text("INSTRUCTIONS:", { continued: true })
        .font("Helvetica")
        .text(" Please present this QR code at the reception for check-in.")
        .fontSize(9)
        .fillColor("#888")
        .text(
          "This is a system-generated visitor pass. Do not share this QR code with anyone.",
          { align: "center" },
        )
        .moveDown(0.3)
        .text(`Generated on: ${new Date().toLocaleString()}`, {
          align: "center",
        })
        .text(`Pass ID: ${visitorData._id}`, { align: "center" });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// ============================
// TEMPORARY LOGIN HELPER
// ============================

const generateTemporaryPassword = () => {
  // Generate a readable 8-character password
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let password = "";
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const generateVisitorToken = (visitorId) => {
  return jwt.sign(
    {
      visitorId,
      type: "visitor",
      timestamp: Date.now(),
    },
    process.env.JWT_SECRET || "visitor_secret_key",
    { expiresIn: "24h" },
  );
};

// ============================
// AUTHENTICATION MIDDLEWARE
// ============================

exports.verifyVisitorToken = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1] || req.query.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "visitor_secret_key",
    );

    if (decoded.type !== "visitor") {
      return res.status(403).json({
        success: false,
        message: "Visitor access required",
      });
    }

    req.user = decoded;
    req.user.visitorId = decoded.visitorId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired session",
    });
  }
};

// ============================
// CREATE VISITOR
// ============================

exports.createVisitor = async (req, res) => {
  try {
    const {
      visitorName,
      phoneNumber,
      email,
      company,
      idNumber,
      purpose = "Meeting",
      expiryHours = 24,
    } = req.body;

    if (!visitorName || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: visitorName, phoneNumber",
      });
    }

    const qrToken = generateQRToken();
    const qrCodeImage = await generateQRCodeImage(qrToken);

    const visitorData = {
      visitorName: visitorName.trim(),
      phoneNumber: phoneNumber.trim(),
      qrCode: qrCodeImage,
      qrToken: qrToken,
      qrExpiresAt: getExpiryDate(expiryHours),
      checkedIn: false,
      purpose: purpose,
    };

    if (email) visitorData.email = email.trim();
    if (company) visitorData.company = company.trim();
    if (idNumber) visitorData.idNumber = idNumber.trim();

    const visitor = new QRModel(visitorData);
    await visitor.save();

    res.status(201).json({
      success: true,
      message: "Visitor created successfully",
      data: {
        id: visitor._id,
        visitorName: visitor.visitorName,
        phoneNumber: visitor.phoneNumber,
        email: visitor.email,
        company: visitor.company,
        idNumber: visitor.idNumber,
        qrCode: visitor.qrCode,
        qrToken: visitor.qrToken,
        qrExpiresAt: visitor.qrExpiresAt,
        checkedIn: visitor.checkedIn,
        purpose: visitor.purpose,
        createdAt: visitor.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "QR token already exists. Please try again.",
      });
    }
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: errors,
      });
    }
    console.error("Error creating visitor:", error);
    res.status(500).json({
      success: false,
      message: "Error creating visitor",
      error: error.message,
    });
  }
};

// ============================
// BULK CREATE VISITORS
// ============================

exports.bulkCreateVisitors = async (req, res) => {
  try {
    const visitorsData = req.body;

    if (!Array.isArray(visitorsData)) {
      return res.status(400).json({
        success: false,
        message: "Request body must be an array of visitors",
      });
    }

    if (visitorsData.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No visitors data provided",
      });
    }

    const results = [];
    const errors = [];
    const createdVisitors = [];

    for (let i = 0; i < visitorsData.length; i++) {
      const data = visitorsData[i];

      try {
        if (!data.visitorName || !data.phoneNumber) {
          errors.push({
            index: i,
            data: data,
            error: "Missing required fields: visitorName, phoneNumber",
          });
          continue;
        }

        const qrToken = generateQRToken();
        const qrCodeImage = await generateQRCodeImage(qrToken);

        const visitorData = {
          visitorName: data.visitorName.trim(),
          phoneNumber: data.phoneNumber.trim(),
          qrCode: qrCodeImage,
          qrToken: qrToken,
          qrExpiresAt: getExpiryDate(data.expiryHours || 24),
          checkedIn: false,
          purpose: data.purpose || "Meeting",
        };

        if (data.email) visitorData.email = data.email.trim();
        if (data.company) visitorData.company = data.company.trim();
        if (data.idNumber) visitorData.idNumber = data.idNumber.trim();

        const visitor = new QRModel(visitorData);
        await visitor.save();

        createdVisitors.push({
          id: visitor._id,
          visitorName: visitor.visitorName,
          phoneNumber: visitor.phoneNumber,
          qrToken: visitor.qrToken,
          qrExpiresAt: visitor.qrExpiresAt,
        });

        results.push({
          index: i,
          success: true,
          data: visitor,
        });
      } catch (error) {
        errors.push({
          index: i,
          data: data,
          error: error.message,
        });
      }
    }

    res.status(201).json({
      success: true,
      message: `Created ${createdVisitors.length} visitors successfully`,
      total: visitorsData.length,
      created: createdVisitors.length,
      failed: errors.length,
      data: {
        created: createdVisitors,
        errors: errors,
      },
    });
  } catch (error) {
    console.error("Error in bulk create:", error);
    res.status(500).json({
      success: false,
      message: "Error creating visitors",
      error: error.message,
    });
  }
};

// ============================
// GET ALL VISITORS
// ============================

exports.getAllVisitors = async (req, res) => {
  try {
    const { status = "all", page = 1, limit = 10, search } = req.query;
    const now = new Date();
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let filter = {};

    // Status filters
    if (status === "active") {
      filter = { qrExpiresAt: { $gt: now }, checkedIn: false };
    } else if (status === "expired") {
      filter = { qrExpiresAt: { $lt: now } };
    } else if (status === "checked-in") {
      filter = { checkedIn: true };
    }

    // Search filter
    if (search) {
      const searchRegex = new RegExp(search, "i");
      filter.$or = [
        { visitorName: searchRegex },
        { phoneNumber: searchRegex },
        { email: searchRegex },
        { company: searchRegex },
      ];
    }

    const [visitors, total] = await Promise.all([
      QRModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      QRModel.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      count: total,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      data: visitors,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching visitors",
      error: error.message,
    });
  }
};

// ============================
// GET VISITOR BY ID
// ============================

exports.getVisitorById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visitor ID",
      });
    }

    const visitor = await QRModel.findById(id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    res.status(200).json({
      success: true,
      data: visitor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching visitor",
      error: error.message,
    });
  }
};

// ============================
// GET VISITOR BY TOKEN
// ============================

exports.getVisitorByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const now = new Date();

    const visitor = await QRModel.findOne({
      qrToken: token,
      qrExpiresAt: { $gt: now },
    });

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Invalid or expired QR token",
      });
    }

    res.status(200).json({
      success: true,
      data: visitor,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error validating QR token",
      error: error.message,
    });
  }
};

// ============================
// SEND QR WITH PDF VIA EMAIL
// ============================

exports.sendQR = async (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumber, email } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visitor ID",
      });
    }

    const visitor = await QRModel.findById(id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    if (visitor.isExpired()) {
      return res.status(400).json({
        success: false,
        message: "QR code has expired. Please generate a new one.",
      });
    }

    const recipientEmail = email || visitor.email;
    if (!recipientEmail) {
      return res.status(400).json({
        success: false,
        message: "Email address is required to send QR code",
      });
    }

    // Generate temporary password and token for visitor login
    const tempPassword = generateTemporaryPassword();
    const visitorToken = generateVisitorToken(visitor._id);

    // Hash the temporary password
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    visitor.tempLoginToken = visitorToken;
    visitor.tempPasswordHash = hashedPassword;
    visitor.tempPasswordCreated = new Date();
    visitor.qrSentViaEmail = true;
    await visitor.save();

    // Generate PDF
    const pdfBuffer = await generateVisitorPDF(visitor, visitor.qrCode);

    // Prepare email
    const mailOptions = {
      from: process.env.SMTP_FROM || "noreply@visitor-system.com",
      to: recipientEmail,
      subject: `Your Visitor Pass - ${visitor.visitorName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1a237e; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f5f5f5; padding: 30px; border-radius: 0 0 8px 8px; }
            .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .login-info { background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 4px solid #2e7d32; }
            .button { display: inline-block; padding: 12px 24px; background: #1a237e; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
            .footer { margin-top: 20px; font-size: 12px; color: #888; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🎫 Visitor Pass</h1>
          </div>
          <div class="content">
            <h2>Hello ${visitor.visitorName},</h2>
            <p>Your visitor pass has been generated. Please find the QR code attached as a PDF.</p>
            
            <div class="details">
              <h3>📋 Visitor Details</h3>
              <p><strong>Name:</strong> ${visitor.visitorName}</p>
              <p><strong>Phone:</strong> ${visitor.phoneNumber}</p>
              ${visitor.email ? `<p><strong>Email:</strong> ${visitor.email}</p>` : ""}
              ${visitor.company ? `<p><strong>Company:</strong> ${visitor.company}</p>` : ""}
              ${visitor.idNumber ? `<p><strong>ID Number:</strong> ${visitor.idNumber}</p>` : ""}
              <p><strong>Purpose:</strong> ${visitor.purpose || "Meeting"}</p>
              <p><strong>Valid Until:</strong> ${new Date(visitor.qrExpiresAt).toLocaleString()}</p>
            </div>

            <div class="login-info">
              <h3>🔐 Visitor Portal Access</h3>
              <p>You can now login to your visitor portal using the credentials below:</p>
              <p><strong>Email:</strong> ${recipientEmail}</p>
              <p><strong>Temporary Password:</strong> <span style="font-size: 18px; background: #fff; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${tempPassword}</span></p>
              <p style="font-size: 14px; color: #555;">Please change your password after first login.</p>
              <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/visitor/login?token=${visitorToken}" class="button">
                Login to Visitor Portal
              </a>
            </div>

            <p><strong>📎 Attachment:</strong> Your visitor pass with QR code is attached as a PDF file.</p>
            
            <p style="margin-top: 20px;">
              <strong>Instructions:</strong>
              <ol>
                <li>Open the attached PDF file</li>
                <li>Show the QR code at the reception for check-in</li>
                <li>Use the temporary password to login to your visitor portal</li>
              </ol>
            </p>

            <div class="footer">
              <p>This is an automated message. Please do not reply to this email.</p>
              <p>© ${new Date().getFullYear()} Visitor Management System</p>
            </div>
          </div>
        </body>
        </html>
      `,
      attachments: [
        {
          filename: `visitor_pass_${visitor.visitorName.replace(/\s/g, "_")}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    await transporter.sendMail(mailOptions);

    visitor.lastQRSentAt = new Date();
    visitor.pdfSentAt = new Date();
    visitor.pdfDownloadCount = (visitor.pdfDownloadCount || 0) + 1;
    await visitor.save();

    res.status(200).json({
      success: true,
      message: "QR code sent successfully via email with PDF attachment",
      data: {
        id: visitor._id,
        visitorName: visitor.visitorName,
        email: recipientEmail,
        qrCode: visitor.qrCode,
        qrToken: visitor.qrToken,
        expiresAt: visitor.qrExpiresAt,
        tempPassword: tempPassword,
        loginToken: visitorToken,
      },
    });
  } catch (error) {
    console.error("Error sending QR email:", error);
    res.status(500).json({
      success: false,
      message: "Error sending QR code",
      error: error.message,
    });
  }
};

// ============================
// RESEND QR VIA EMAIL
// ============================

exports.resendQR = async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visitor ID",
      });
    }

    const visitor = await QRModel.findById(id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    if (visitor.isExpired()) {
      return res.status(400).json({
        success: false,
        message: "QR code has expired. Please regenerate the QR code.",
      });
    }

    const recipientEmail = email || visitor.email;
    if (!recipientEmail) {
      return res.status(400).json({
        success: false,
        message: "Email address is required to resend QR code",
      });
    }

    // Regenerate password if token is old or missing
    let tempPassword = null;
    let visitorToken = visitor.tempLoginToken;

    const passwordAge = visitor.tempPasswordCreated
      ? (Date.now() - new Date(visitor.tempPasswordCreated).getTime()) /
        (1000 * 60)
      : 999;

    if (!visitor.tempLoginToken || passwordAge > 60) {
      // 1 hour expiry for temp password
      tempPassword = generateTemporaryPassword();
      visitorToken = generateVisitorToken(visitor._id);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      visitor.tempLoginToken = visitorToken;
      visitor.tempPasswordHash = hashedPassword;
      visitor.tempPasswordCreated = new Date();
      await visitor.save();
    }

    // Generate PDF
    const pdfBuffer = await generateVisitorPDF(visitor, visitor.qrCode);

    const mailOptions = {
      from: process.env.SMTP_FROM || "noreply@visitor-system.com",
      to: recipientEmail,
      subject: `Resent: Your Visitor Pass - ${visitor.visitorName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1a237e; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f5f5f5; padding: 30px; border-radius: 0 0 8px 8px; }
            .warning { background: #fff3e0; padding: 15px; border-radius: 8px; border-left: 4px solid #e65100; margin: 20px 0; }
            .button { display: inline-block; padding: 12px 24px; background: #1a237e; color: white; text-decoration: none; border-radius: 4px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📧 Visitor Pass Resent</h1>
          </div>
          <div class="content">
            <h2>Hello ${visitor.visitorName},</h2>
            <p>Your visitor pass has been resent. Please find the QR code attached as a PDF.</p>
            
            <div class="warning">
              <p><strong>⚠️ Important:</strong> Your QR code expires on ${new Date(visitor.qrExpiresAt).toLocaleString()}</p>
            </div>

            ${
              tempPassword
                ? `
              <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h3>🔄 New Temporary Password</h3>
                <p><strong>Password:</strong> <span style="font-size: 18px; background: #fff; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${tempPassword}</span></p>
                <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/visitor/login?token=${visitorToken}" class="button">
                  Login to Visitor Portal
                </a>
              </div>
            `
                : `
              <p>You can continue using your existing login credentials.</p>
              <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}/visitor/login?token=${visitorToken}" class="button">
                Login to Visitor Portal
              </a>
            `
            }

            <div class="footer">
              <p>This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      attachments: [
        {
          filename: `visitor_pass_${visitor.visitorName.replace(/\s/g, "_")}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    };

    await transporter.sendMail(mailOptions);

    visitor.lastQRSentAt = new Date();
    visitor.pdfSentAt = new Date();
    visitor.pdfDownloadCount = (visitor.pdfDownloadCount || 0) + 1;
    await visitor.save();

    res.status(200).json({
      success: true,
      message: "QR code resent successfully",
      data: {
        id: visitor._id,
        visitorName: visitor.visitorName,
        email: recipientEmail,
        expiresAt: visitor.qrExpiresAt,
        ...(tempPassword && { tempPassword }),
      },
    });
  } catch (error) {
    console.error("Error resending QR:", error);
    res.status(500).json({
      success: false,
      message: "Error resending QR code",
      error: error.message,
    });
  }
};

// ============================
// VISITOR LOGIN
// ============================

exports.visitorLogin = async (req, res) => {
  try {
    const { email, password, token } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const visitor = await QRModel.findOne({
      email: email.toLowerCase().trim(),
      qrExpiresAt: { $gt: new Date() },
    });

    if (!visitor) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid credentials or QR expired. Please request a new QR code.",
      });
    }

    if (!visitor.tempPasswordHash) {
      return res.status(401).json({
        success: false,
        message: "No login credentials found. Please request a new QR code.",
      });
    }

    const isValidPassword = await bcrypt.compare(
      password,
      visitor.tempPasswordHash,
    );
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid password. Please check your temporary password.",
      });
    }

    // Generate session token
    const sessionToken = jwt.sign(
      {
        visitorId: visitor._id,
        email: visitor.email,
        type: "visitor",
        loginTime: Date.now(),
      },
      process.env.JWT_SECRET || "visitor_session_secret",
      { expiresIn: "24h" },
    );

    visitor.lastLoginAt = new Date();
    await visitor.save();

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        visitorId: visitor._id,
        visitorName: visitor.visitorName,
        email: visitor.email,
        company: visitor.company,
        sessionToken,
        expiresAt: visitor.qrExpiresAt,
        checkedIn: visitor.checkedIn,
        qrToken: visitor.qrToken,
        qrCode: visitor.qrCode,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      success: false,
      message: "Error during login",
      error: error.message,
    });
  }
};

// ============================
// GET VISITOR DASHBOARD
// ============================

exports.getVisitorDashboard = async (req, res) => {
  try {
    const visitorId = req.user?.visitorId || req.query.visitorId;

    if (!visitorId || !mongoose.Types.ObjectId.isValid(visitorId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visitor ID",
      });
    }

    const visitor = await QRModel.findById(visitorId);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        visitorName: visitor.visitorName,
        email: visitor.email,
        phoneNumber: visitor.phoneNumber,
        company: visitor.company,
        purpose: visitor.purpose,
        checkedIn: visitor.checkedIn,
        checkedInAt: visitor.checkedInAt,
        qrExpiresAt: visitor.qrExpiresAt,
        qrCode: visitor.qrCode,
        qrToken: visitor.qrToken,
        createdAt: visitor.createdAt,
        lastLoginAt: visitor.lastLoginAt,
        pdfSentAt: visitor.pdfSentAt,
        isExpired: visitor.isExpired(),
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard data",
      error: error.message,
    });
  }
};

// ============================
// CHECK-IN VISITOR
// ============================

exports.checkInVisitor = async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visitor ID",
      });
    }

    const visitor = await QRModel.findById(id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    if (visitor.checkedIn) {
      return res.status(400).json({
        success: false,
        message: "Visitor already checked in",
      });
    }

    if (visitor.isExpired()) {
      return res.status(400).json({
        success: false,
        message: "QR code has expired. Please generate a new one.",
      });
    }

    if (token && visitor.qrToken !== token) {
      return res.status(401).json({
        success: false,
        message: "Invalid QR token",
      });
    }

    visitor.checkedIn = true;
    visitor.checkedInAt = new Date();
    await visitor.save();

    res.status(200).json({
      success: true,
      message: "Visitor checked in successfully",
      data: {
        id: visitor._id,
        visitorName: visitor.visitorName,
        phoneNumber: visitor.phoneNumber,
        checkedIn: visitor.checkedIn,
        checkedInAt: visitor.checkedInAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error during check-in",
      error: error.message,
    });
  }
};

// ============================
// REGENERATE QR
// ============================

exports.regenerateQR = async (req, res) => {
  try {
    const { id } = req.params;
    const { expiryHours = 24 } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visitor ID",
      });
    }

    const visitor = await QRModel.findById(id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    const newToken = generateQRToken();
    const newQRCode = await generateQRCodeImage(newToken);

    visitor.qrToken = newToken;
    visitor.qrCode = newQRCode;
    visitor.qrExpiresAt = getExpiryDate(expiryHours);
    visitor.checkedIn = false;
    visitor.checkedInAt = null;
    // Reset login credentials so new ones will be generated
    visitor.tempLoginToken = null;
    visitor.tempPasswordHash = null;
    visitor.tempPasswordCreated = null;
    await visitor.save();

    res.status(200).json({
      success: true,
      message: "QR code regenerated successfully",
      data: {
        id: visitor._id,
        qrCode: visitor.qrCode,
        qrToken: visitor.qrToken,
        qrExpiresAt: visitor.qrExpiresAt,
        checkedIn: visitor.checkedIn,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Token conflict. Please try again.",
      });
    }
    res.status(500).json({
      success: false,
      message: "Error regenerating QR",
      error: error.message,
    });
  }
};

// ============================
// DELETE VISITOR
// ============================

exports.deleteVisitor = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visitor ID",
      });
    }

    const visitor = await QRModel.findByIdAndDelete(id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Visitor deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting visitor",
      error: error.message,
    });
  }
};

// ============================
// BULK DELETE VISITORS
// ============================

exports.bulkDeleteVisitors = async (req, res) => {
  try {
    const { type = "expired" } = req.query;
    let filter = {};

    if (type === "expired") {
      filter = { qrExpiresAt: { $lt: new Date() } };
    } else if (type === "checked-in") {
      filter = { checkedIn: true };
    } else if (type === "all") {
      filter = {};
    }

    const result = await QRModel.deleteMany(filter);

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} visitors`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting visitors",
      error: error.message,
    });
  }
};

// ============================
// SCAN QR
// ============================

exports.scanVisitorQR = async (req, res) => {
  try {
    const token =
      req.params?.token ||
      req.body?.token ||
      req.body?.qrToken ||
      req.query?.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "QR token is required",
      });
    }

    const visitor = await findValidVisitorByToken(token);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "QR code is invalid or expired",
        isValid: false,
      });
    }

    res.status(200).json({
      success: true,
      message: "QR scanned successfully",
      isValid: true,
      data: {
        id: visitor._id,
        visitorName: visitor.visitorName,
        phoneNumber: visitor.phoneNumber,
        email: visitor.email || "",
        company: visitor.company || "",
        idNumber: visitor.idNumber || "",
        purpose: visitor.purpose || "Meeting",
        checkedIn: visitor.checkedIn || false,
        checkedInAt: visitor.checkedInAt || null,
        qrExpiresAt: visitor.qrExpiresAt,
        createdAt: visitor.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error scanning QR",
      error: error.message,
    });
  }
};

// ============================
// VALIDATE QR
// ============================

exports.validateQR = async (req, res) => {
  try {
    const { token } = req.params;
    const visitor = await findValidVisitorByToken(token);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "QR code is invalid or expired",
        isValid: false,
      });
    }

    res.status(200).json({
      success: true,
      message: "QR code is valid",
      isValid: true,
      data: {
        id: visitor._id,
        visitorName: visitor.visitorName,
        phoneNumber: visitor.phoneNumber,
        checkedIn: visitor.checkedIn || false,
        expiresAt: visitor.qrExpiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error validating QR",
      error: error.message,
    });
  }
};
