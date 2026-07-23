// routes/visitorRoutes.js
const express = require("express");
const router = express.Router();
const visitorController = require("../controllers/IDVIsitorQR.Controller");
const locationController = require("../controllers/location.controller");

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

// Scan QR & fetch cabinets for specific company
router.get(
  "/visitors/scan-cabinets/:token",
  visitorController.scanAndGetCabinets,
);
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

// ============================
// LOCATION TRACKING ROUTES
// ============================

// Get visitor location with optional wayfinding path
// Query params: ?includePath=true|false (default: true)
router.get("/visitors/:id/location", locationController.getVisitorRoute);

// Get visitor cabinet/asset
router.get("/visitors/:id/cabinet", locationController.getVisitorCabinet);

// Update visitor cabinet
router.put("/visitors/:id/cabinet", locationController.updateVisitorCabinet);

// Get all asset locations from Mist
router.get("/assets/locations", locationController.getAllAssetLocations);

// Get map details
router.get("/maps/:mapId", locationController.getMapDetails);

// ============================
// NEW: WAYFINDING & NAVIGATION ROUTES
// ============================

/**
 * Get wayfinding path for a specific map
 * GET /api/IDVisitor/maps/:mapId/wayfinding
 *
 * Response: {
 *   success: true,
 *   data: {
 *     nodes: [...],
 *     edges: {...}
 *   }
 * }
 */
router.get("/maps/:mapId/wayfinding", locationController.getWayfindingPath);

/**
 * Get navigation route between two points on a map
 * GET /api/IDVisitor/maps/:mapId/route?fromX=&fromY=&toX=&toY=
 *
 * Query params:
 * - fromX: number (start X coordinate in pixels)
 * - fromY: number (start Y coordinate in pixels)
 * - toX: number (end X coordinate in pixels)
 * - toY: number (end Y coordinate in pixels)
 *
 * Response: {
 *   success: true,
 *   data: {
 *     start: {...},
 *     end: {...},
 *     route: {
 *       path: [...nodeNames],
 *       nodes: [...nodeObjects],
 *       segments: number
 *     },
 *     wayfinding_path: {...} // full path for rendering
 *   }
 * }
 *
 * Example: /api/IDVisitor/maps/123/route?fromX=100&fromY=200&toX=500&toY=600
 */
router.get("/maps/:mapId/route", locationController.getNavigationRoute);

/**
 * Get detailed visitor location with full wayfinding data
 * Alternative endpoint for mobile apps that need complete path data
 * GET /api/IDVisitor/visitors/:id/navigation
 *
 * This returns the same as /location but with more detailed wayfinding info
 */
router.get("/visitors/:id/navigation", locationController.getVisitorRoute);

// ============================
// DELETE OPERATIONS
// ============================
router.get("/maps/:mapId/convert", locationController.testCoordinateConversion);
// Delete single visitor
router.delete("/visitors/:id", visitorController.deleteVisitor);

// Bulk delete visitors (expired/checked-in/all)
router.delete("/visitors/bulk", visitorController.bulkDeleteVisitors);

module.exports = router;
