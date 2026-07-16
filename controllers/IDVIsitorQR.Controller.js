// controllers/visitorController.js
const QRModel = require("../models/User/IdVisitorQR.model");
const QRCode = require("qrcode");
const crypto = require("crypto");
const mongoose = require("mongoose");

// ============================
// QR CODE GENERATION HELPERS
// ============================

// Generate unique QR token
const generateQRToken = () => {
  return crypto.randomBytes(32).toString("hex");
};

// Generate QR code as data URL (base64 image)
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

// Calculate expiry (default 24 hours)
const getExpiryDate = (hours = 24) => {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

// ============================
// VISITOR CONTROLLER
// ============================

/**
 * CREATE - Add a new visitor with QR code
 * POST /api/visitors
 */
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

    // Validate required fields
    if (!visitorName || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: visitorName, phoneNumber",
      });
    }

    // Generate QR token and code
    const qrToken = generateQRToken();
    const qrCodeImage = await generateQRCodeImage(qrToken);

    // Create visitor entry
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

/**
 * BULK CREATE - Add multiple visitors with QR codes
 * POST /api/visitors/bulk
 */
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

/**
 * GET ALL VISITORS
 * GET /api/visitors
 */
exports.getAllVisitors = async (req, res) => {
  try {
    const { status = "all", page = 1, limit = 10 } = req.query;
    const now = new Date();
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let filter = {};
    if (status === "active") {
      filter = { qrExpiresAt: { $gt: now }, checkedIn: false };
    } else if (status === "expired") {
      filter = { qrExpiresAt: { $lt: now } };
    } else if (status === "checked-in") {
      filter = { checkedIn: true };
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

/**
 * GET SINGLE VISITOR by ID
 * GET /api/visitors/:id
 */
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

/**
 * GET VISITOR by QR Token
 * GET /api/visitors/token/:token
 */
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

/**
 * SEND QR - Send QR to visitor
 * POST /api/visitors/:id/send-qr
 */
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

    if (new Date() > visitor.qrExpiresAt) {
      return res.status(400).json({
        success: false,
        message: "QR code has expired. Please generate a new one.",
      });
    }

    // Update last sent timestamp
    visitor.lastQRSentAt = new Date();
    await visitor.save();

    res.status(200).json({
      success: true,
      message: "QR code sent successfully",
      data: {
        qrCode: visitor.qrCode,
        qrToken: visitor.qrToken,
        expiresAt: visitor.qrExpiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error sending QR code",
      error: error.message,
    });
  }
};

/**
 * CHECK-IN - Mark visitor as checked in
 * POST /api/visitors/:id/check-in
 */
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

    if (new Date() > visitor.qrExpiresAt) {
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

/**
 * REGENERATE QR - Create new QR for visitor
 * POST /api/visitors/:id/regenerate-qr
 */
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

    // Generate new QR token and code
    const newToken = generateQRToken();
    const newQRCode = await generateQRCodeImage(newToken);

    visitor.qrToken = newToken;
    visitor.qrCode = newQRCode;
    visitor.qrExpiresAt = getExpiryDate(expiryHours);
    visitor.checkedIn = false;
    visitor.checkedInAt = null;
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

/**
 * DELETE VISITOR
 * DELETE /api/visitors/:id
 */
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

/**
 * BULK DELETE - Delete all expired/checked-in visitors
 * DELETE /api/visitors/bulk
 */
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

/**
 * VALIDATE QR - Check if QR is valid
 * GET /api/visitors/validate/:token
 */
exports.validateQR = async (req, res) => {
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
        checkedIn: visitor.checkedIn,
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
