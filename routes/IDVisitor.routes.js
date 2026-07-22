// routes/visitorRoutes.js
const express = require("express");
const router = express.Router();
const visitorController = require("../controllers/IDVIsitorQR.Controller");
const { getVisitorRoute } = require("../controllers/location.controller");

// ============================
// PUBLIC VISITOR ROUTES
// ============================

// Visitor login with temporary password
router.post("/visitors/login", visitorController.visitorLogin);

// Validate QR token (public)
router.get("/visitors/validate/:token", visitorController.validateQR);

// Scan QR (public - supports both GET and POST)
router.get("/visitors/scan/:token", visitorController.scanVisitorQR);
router.post("/visitors/scan", visitorController.scanVisitorQR);

// Scan QR & fetch cabinets for specific company (Single API - supports GET and POST)
router.get("/visitors/scan-cabinets/:token", visitorController.scanAndGetCabinets);
router.post("/visitors/scan-cabinets", visitorController.scanAndGetCabinets);

// Get visitor dashboard (requires authentication)
router.get(
  "/visitors/dashboard",
  visitorController.verifyVisitorToken,
  visitorController.getVisitorDashboard,
);

// ============================
// ADMIN ROUTES (Visitor CRUD)
// ============================

// Create visitor
router.post("/visitors", visitorController.createVisitor);

// Bulk create visitors
router.post("/visitors/bulk", visitorController.bulkCreateVisitors);

// Get all visitors with filters
router.get("/visitors", visitorController.getAllVisitors);

// Get single visitor by ID
router.get("/visitors/:id", visitorController.getVisitorById);

// Get visitor by QR token
router.get("/visitors/token/:token", visitorController.getVisitorByToken);

// ============================
// QR CODE OPERATIONS
// ============================

// Send QR via email with PDF attachment
router.post("/visitors/:id/send-qr", visitorController.sendQR);

// Resend QR via email with PDF
router.post("/visitors/:id/resend-qr", visitorController.resendQR);

// Check-in visitor
router.post("/visitors/:id/check-in", visitorController.checkInVisitor);

// Check-out visitor
router.post("/visitors/:id/check-out", visitorController.checkOutVisitor);

// Regenerate QR code
router.post("/visitors/:id/regenerate-qr", visitorController.regenerateQR);

router.get("/visitors/:id/location", getVisitorRoute);

// ============================
// DELETE OPERATIONS
// ============================

// Delete single visitor
router.delete("/visitors/:id", visitorController.deleteVisitor);

// Bulk delete visitors (expired/checked-in/all)
router.delete("/visitors/bulk", visitorController.bulkDeleteVisitors);

module.exports = router;
