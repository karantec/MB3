// controllers/location.controller.js
const QRModel = require("../models/User/IdVisitorQR.model");
const axios = require("axios");
const mongoose = require("mongoose");

// ============================
// MIST API CONFIGURATION
// ============================

const MIST_API_TOKEN =
  process.env.MIST_API_TOKEN ||
  "li1iDhxqOaPiJyYwcEuIznaUcLqajVsVTnTS6eKtzFDh4N2ZPbInk8sodqYAFhjYqOOeB3LFIClQ2deNJUXDgIVWsJ6SCjlT";
const MIST_SITE_ID =
  process.env.MIST_SITE_ID || "8ddd401e-edb4-4b24-beb1-6298afdd0bd1";
const MIST_API_BASE = "https://api.mist.com/api/v1";

// ============================
// MIST API HELPERS
// ============================

const getMistHeaders = () => ({
  Authorization: `Token ${MIST_API_TOKEN}`,
  "Content-Type": "application/json",
});

const fetchAssetLocations = async () => {
  try {
    const url = `${MIST_API_BASE}/sites/${MIST_SITE_ID}/stats/assets`;
    console.log("📡 Fetching assets from Mist API:", url);
    const response = await axios.get(url, {
      headers: getMistHeaders(),
    });
    console.log(`✅ Found ${response.data.length} assets`);
    return response.data;
  } catch (error) {
    console.error("❌ Mist API Error:", error.response?.data || error.message);
    throw error;
  }
};

const fetchMapDetails = async (mapId) => {
  try {
    const url = `${MIST_API_BASE}/sites/${MIST_SITE_ID}/maps/${mapId}`;
    const response = await axios.get(url, {
      headers: getMistHeaders(),
    });
    return response.data;
  } catch (error) {
    console.error("❌ Map API Error:", error.response?.data || error.message);
    return null;
  }
};

// ============================
// GET VISITOR LOCATION
// ============================

/**
 * GET VISITOR LOCATION - Get current location of a visitor's assigned cabinet/asset
 * GET /api/IDVisitor/visitors/:id/location
 */
exports.getVisitorRoute = async (req, res) => {
  try {
    const { id } = req.params;

    console.log("📍 Fetching location for visitor ID:", id);

    // Validate ID format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visitor ID format",
      });
    }

    // Find visitor
    const visitor = await QRModel.findById(id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    console.log("👤 Visitor found:", visitor.visitorName);
    console.log("🆔 ID Number:", visitor.idNumber || "(empty)");

    // Check if visitor has an assigned cabinet/ID
    if (!visitor.idNumber || visitor.idNumber.trim() === "") {
      return res.status(404).json({
        success: false,
        message:
          "No ID/asset assigned to this visitor. Please update the visitor with an idNumber.",
        suggestion:
          "Use PUT /api/IDVisitor/visitors/:id/cabinet with { 'idNumber': 'Tag1' }",
        visitor: {
          id: visitor._id,
          name: visitor.visitorName,
          company: visitor.company,
          currentIdNumber: visitor.idNumber || "Not assigned",
        },
      });
    }

    // Fetch all asset locations from Mist
    console.log("📡 Fetching asset locations from Mist API...");
    let assets;
    try {
      assets = await fetchAssetLocations();
    } catch (error) {
      console.error("❌ Mist API Error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch asset locations from Mist API",
        error: error.message,
        suggestion: "Check your Mist API token and site ID in .env file",
      });
    }

    // Log all asset names for debugging
    const assetNames = assets.map((a) => a.name).filter((name) => name);
    console.log("📋 Available assets:", assetNames.join(", "));

    // Find the asset that matches the visitor's ID Number
    const matchedAsset = assets.find(
      (asset) =>
        asset.name === visitor.idNumber || asset.mac === visitor.idNumber,
    );

    if (!matchedAsset) {
      return res.status(404).json({
        success: false,
        message: `Asset "${visitor.idNumber}" not found in Mist system`,
        available_assets: assetNames,
        suggestion:
          "Make sure the idNumber matches an asset name in Mist. Available assets: " +
          assetNames.join(", "),
      });
    }

    console.log("✅ Asset found:", matchedAsset.name);

    // Check if asset has location data
    if (!matchedAsset.x || !matchedAsset.y) {
      return res.status(404).json({
        success: false,
        message: `Asset "${matchedAsset.name}" found but has no location data (x, y coordinates missing)`,
        data: {
          name: matchedAsset.name,
          mac: matchedAsset.mac,
          last_seen: matchedAsset.last_seen,
          has_location: false,
          suggestion: "The asset may be offline or not currently tracked",
        },
      });
    }

    // Get map details if map_id exists
    let mapDetails = null;
    if (matchedAsset.map_id) {
      try {
        mapDetails = await fetchMapDetails(matchedAsset.map_id);
      } catch (error) {
        console.warn("⚠️ Could not fetch map details:", error.message);
      }
    }

    // Target coordinates (from your provided data)
    const targetX = 5525.298750495607;
    const targetY = 2491.837930104785;

    // Calculate distance from target
    const distance =
      matchedAsset.x && matchedAsset.y
        ? Math.sqrt(
            Math.pow(matchedAsset.x - targetX, 2) +
              Math.pow(matchedAsset.y - targetY, 2),
          )
        : null;

    // Determine proximity status
    const proximityStatus =
      distance !== null
        ? distance < 100
          ? "Very Close"
          : distance < 300
            ? "Close"
            : distance < 500
              ? "Moderate"
              : "Far"
        : "Unknown";

    // Prepare response data
    const locationData = {
      visitor: {
        id: visitor._id,
        name: visitor.visitorName,
        phone: visitor.phoneNumber,
        email: visitor.email,
        company: visitor.company,
        idNumber: visitor.idNumber,
        purpose: visitor.purpose,
        checkedIn: visitor.checkedIn,
        checkedInAt: visitor.checkedInAt,
        qrExpiresAt: visitor.qrExpiresAt,
      },
      location: {
        x: matchedAsset.x,
        y: matchedAsset.y,
        name: matchedAsset.name,
        mac: matchedAsset.mac,
        map_id: matchedAsset.map_id,
        ap_mac: matchedAsset.ap_mac,
        last_seen: matchedAsset.last_seen,
        rssi: matchedAsset.rssi,
        beam: matchedAsset.beam,
        device_name: matchedAsset.device_name,
        manufacture: matchedAsset.manufacture,
      },
      map: mapDetails
        ? {
            id: mapDetails.id,
            name: mapDetails.name,
            width: mapDetails.width,
            height: mapDetails.height,
            orientation: mapDetails.orientation,
          }
        : null,
      target_coordinates: {
        x: targetX,
        y: targetY,
      },
      distance: distance,
      proximity: proximityStatus,
      timestamp: new Date().toISOString(),
    };

    res.status(200).json({
      success: true,
      message: "Visitor location retrieved successfully",
      data: locationData,
    });
  } catch (error) {
    console.error("❌ Error fetching visitor location:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching visitor location",
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// ============================
// GET ALL ASSET LOCATIONS
// ============================

/**
 * GET ALL ASSET LOCATIONS - Get all asset locations from Mist
 * GET /api/IDVisitor/assets/locations
 */
exports.getAllAssetLocations = async (req, res) => {
  try {
    console.log("📍 Fetching all asset locations...");

    const assets = await fetchAssetLocations();

    // Filter assets with location data
    const locatedAssets = assets.filter(
      (asset) => asset.x !== undefined && asset.x !== null,
    );

    console.log(`✅ Found ${locatedAssets.length} assets with location data`);

    res.status(200).json({
      success: true,
      total: locatedAssets.length,
      totalAssets: assets.length,
      data: locatedAssets,
    });
  } catch (error) {
    console.error("❌ Error fetching asset locations:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching asset locations",
      error: error.message,
    });
  }
};

// ============================
// GET MAP DETAILS
// ============================

/**
 * GET MAP DETAILS - Get map details by ID
 * GET /api/IDVisitor/maps/:mapId
 */
exports.getMapDetails = async (req, res) => {
  try {
    const { mapId } = req.params;

    if (!mapId) {
      return res.status(400).json({
        success: false,
        message: "Map ID is required",
      });
    }

    console.log("📍 Fetching map details for ID:", mapId);

    const mapDetails = await fetchMapDetails(mapId);

    if (!mapDetails) {
      return res.status(404).json({
        success: false,
        message: "Map not found",
      });
    }

    res.status(200).json({
      success: true,
      data: mapDetails,
    });
  } catch (error) {
    console.error("❌ Error fetching map details:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching map details",
      error: error.message,
    });
  }
};

// ============================
// GET VISITOR CABINET
// ============================

/**
 * GET VISITOR CABINET - Get the cabinet/asset assigned to visitor
 * GET /api/IDVisitor/visitors/:id/cabinet
 */
exports.getVisitorCabinet = async (req, res) => {
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

    if (!visitor.idNumber || visitor.idNumber.trim() === "") {
      return res.status(404).json({
        success: false,
        message: "No cabinet/asset assigned to this visitor",
        suggestion: "Use PUT /api/IDVisitor/visitors/:id/cabinet to assign one",
      });
    }

    // Fetch all assets from Mist
    const assets = await fetchAssetLocations();

    // Find the asset by name or MAC
    const cabinet = assets.find(
      (asset) =>
        asset.name === visitor.idNumber || asset.mac === visitor.idNumber,
    );

    if (!cabinet) {
      return res.status(404).json({
        success: false,
        message: `Cabinet/asset "${visitor.idNumber}" not found in Mist system`,
        available_assets: assets.map((a) => a.name).filter((name) => name),
      });
    }

    // Get map details
    let mapDetails = null;
    if (cabinet.map_id) {
      mapDetails = await fetchMapDetails(cabinet.map_id);
    }

    res.status(200).json({
      success: true,
      data: {
        visitor: {
          id: visitor._id,
          name: visitor.visitorName,
          company: visitor.company,
        },
        cabinet: {
          id: cabinet.id,
          name: cabinet.name,
          mac: cabinet.mac,
          x: cabinet.x || null,
          y: cabinet.y || null,
          map_id: cabinet.map_id,
          last_seen: cabinet.last_seen,
          rssi: cabinet.rssi,
          device_name: cabinet.device_name,
          manufacture: cabinet.manufacture,
        },
        map: mapDetails
          ? {
              id: mapDetails.id,
              name: mapDetails.name,
              width: mapDetails.width,
              height: mapDetails.height,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching visitor cabinet:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching visitor cabinet",
      error: error.message,
    });
  }
};

// ============================
// UPDATE VISITOR CABINET
// ============================

/**
 * UPDATE VISITOR CABINET - Assign a cabinet/asset to a visitor
 * PUT /api/IDVisitor/visitors/:id/cabinet
 */
exports.updateVisitorCabinet = async (req, res) => {
  try {
    const { id } = req.params;
    const { idNumber, assetName } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid visitor ID",
      });
    }

    if (!idNumber && !assetName) {
      return res.status(400).json({
        success: false,
        message: "idNumber or assetName is required",
      });
    }

    const visitor = await QRModel.findById(id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    const newIdNumber = idNumber || assetName;

    // Verify the asset exists in Mist
    try {
      const assets = await fetchAssetLocations();
      const assetExists = assets.some(
        (asset) => asset.name === newIdNumber || asset.mac === newIdNumber,
      );

      if (!assetExists) {
        return res.status(400).json({
          success: false,
          message: `Asset "${newIdNumber}" not found in Mist system`,
          available_assets: assets.map((a) => a.name).filter((name) => name),
        });
      }
    } catch (error) {
      console.warn("⚠️ Could not verify asset in Mist:", error.message);
      // Continue anyway - maybe Mist API is temporarily unavailable
    }

    // Update visitor's idNumber
    visitor.idNumber = newIdNumber;
    await visitor.save();

    res.status(200).json({
      success: true,
      message: "Visitor cabinet updated successfully",
      data: {
        id: visitor._id,
        visitorName: visitor.visitorName,
        idNumber: visitor.idNumber,
      },
    });
  } catch (error) {
    console.error("❌ Error updating visitor cabinet:", error);
    res.status(500).json({
      success: false,
      message: "Error updating visitor cabinet",
      error: error.message,
    });
  }
};
