// models/QRModel.js
const mongoose = require("mongoose");

const QRSchema = new mongoose.Schema(
  {
    // QR Code fields
    qrCode: {
      type: String,
      default: "",
    },
    qrToken: {
      type: String,
      unique: true,
      sparse: true,
    },
    qrExpiresAt: {
      type: Date,
      default: null,
    },
    checkedIn: {
      type: Boolean,
      default: false,
    },
    checkedInAt: {
      type: Date,
      default: null,
    },

    // Visitor Information
    visitorName: {
      type: String,
      required: [true, "Visitor name is required"],
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    company: {
      type: String,
      trim: true,
      default: "",
    },
    idNumber: {
      type: String,
      trim: true,
      default: "",
    },
    purpose: {
      type: String,
      enum: ["Meeting", "Interview", "Delivery", "Maintenance", "Other"],
      default: "Meeting",
    },

    // Tracking
    lastQRSentAt: {
      type: Date,
      default: null,
    },

    // NEW: Visitor Login & Email PDF fields
    qrSentViaEmail: {
      type: Boolean,
      default: false,
    },
    tempLoginToken: {
      type: String,
      index: true,
      sparse: true,
    },
    tempPasswordHash: {
      type: String,
    },
    tempPasswordCreated: {
      type: Date,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    pdfSentAt: {
      type: Date,
      default: null,
    },
    pdfDownloadCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
QRSchema.index({ qrExpiresAt: 1 }, { expireAfterSeconds: 0 });
QRSchema.index({ phoneNumber: 1 });
QRSchema.index({ visitorName: 1 });
QRSchema.index({ qrToken: 1 }, { unique: true, sparse: true });
QRSchema.index({ email: 1, qrExpiresAt: 1 });
QRSchema.index({ tempLoginToken: 1 }, { sparse: true });

// Methods
QRSchema.methods.isExpired = function () {
  return new Date() > this.qrExpiresAt;
};

QRSchema.methods.canLogin = function () {
  return (
    !this.isExpired() &&
    this.tempPasswordHash &&
    this.tempLoginToken &&
    this.email
  );
};

QRSchema.methods.hasValidPDF = function () {
  return this.qrSentViaEmail && this.pdfSentAt && !this.isExpired();
};

module.exports = mongoose.model("QRModel", QRSchema);
