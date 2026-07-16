// routes/IdManagement.routes.js
const express = require("express");
const router = express.Router();
const {
  createIdRecord,
  getAllIdRecords,
  getIdRecordById,
  getIdRecordsByPhone,
  updateIdRecord,
  deleteIdRecord,
  getActiveIdRecords,
  getExpiredIdRecords,
  getIdStats,
} = require("../controllers/IDManagment.Controller");

const { protect, admin } = require("../middleware/auth.middleware");

/* ===========================
   PUBLIC ROUTES (No authentication required)
=========================== */

// Get ID records by phone number
router.get("/phone/:phone", getIdRecordsByPhone);

// Get all active ID records
router.get("/active", getActiveIdRecords);

// Get all expired ID records
router.get("/expired", getExpiredIdRecords);

// Get ID statistics
router.get("/stats", getIdStats);

/* ===========================
   PROTECTED ROUTES (Authentication required)
=========================== */

// Create a new ID record
router.post("/", protect, createIdRecord);

// Get all ID records with filters
router.get("/", getAllIdRecords);

// Get ID record by ID
router.get("/:id", protect, getIdRecordById);

// Update ID record
router.put("/:id", protect, updateIdRecord);

// Delete ID record
router.delete("/:id", protect, deleteIdRecord);

module.exports = router;
