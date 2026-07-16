// models/IdManagement.model.js

const mongoose = require("mongoose");

const idManagementSchema = new mongoose.Schema(
  {
    visitorName: {
      type: String,
      required: true,
      trim: true,
    },

    phoneNumber: {
      type: String,
      required: true,
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
      default: "",
    },

    purpose: {
      type: String,
      default: "",
    },

    idType: {
      type: String,
      enum: ["Visitor", "Employee", "Contractor"],
      default: "Visitor",
    },

    idNumber: {
      type: String,
      default: "",
    },

    validFrom: {
      type: Date,
      default: Date.now,
    },

    validUntil: {
      type: Date,
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    status: {
      type: String,
      enum: ["Active", "Expired", "Revoked"],
      default: "Active",
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("IdManagement", idManagementSchema);
