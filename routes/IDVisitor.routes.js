// routes/visitorRoutes.js
const express = require("express");
const router = express.Router();
const visitorController = require("../controllers/IDVIsitorQR.Controller");

// Visitor CRUD
router.post("/visitors", visitorController.createVisitor);
router.get("/visitors", visitorController.getAllVisitors);
router.get("/visitors/:id", visitorController.getVisitorById);
router.delete("/visitors/:id", visitorController.deleteVisitor);
router.delete("/visitors/bulk", visitorController.bulkDeleteVisitors);

// QR specific
router.get("/visitors/token/:token", visitorController.getVisitorByToken);
router.get("/visitors/validate/:token", visitorController.validateQR);
router.post("/visitors/:id/send-qr", visitorController.sendQR);
router.post("/visitors/:id/check-in", visitorController.checkInVisitor);
router.post("/visitors/:id/regenerate-qr", visitorController.regenerateQR);

module.exports = router;
