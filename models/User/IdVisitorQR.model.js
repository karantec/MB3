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

    // Visitor Information - Make sure these match your frontend
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

module.exports = mongoose.model("QRModel", QRSchema);
