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
    console.log(`🗺️ Fetching map details for ${mapId}:`, url);
    const response = await axios.get(url, {
      headers: getMistHeaders(),
    });

    // Log the full response for debugging
    console.log("📋 Map details received:", {
      id: response.data.id,
      name: response.data.name,
      ppm: response.data.ppm,
      origin_x: response.data.origin_x,
      origin_y: response.data.origin_y,
      width: response.data.width,
      height: response.data.height,
    });

    // Return ALL map data including ppm, origin_x, origin_y
    return {
      id: response.data.id,
      name: response.data.name,
      width: response.data.width,
      height: response.data.height,
      ppm: response.data.ppm, // ← CRITICAL: Add this
      origin_x: response.data.origin_x, // ← CRITICAL: Add this
      origin_y: response.data.origin_y, // ← CRITICAL: Add this
      orientation: response.data.orientation,
      created_time: response.data.created_time,
      modified_time: response.data.modified_time,
      type: response.data.type,
      width_m: response.data.width_m,
      height_m: response.data.height_m,
      site_id: response.data.site_id,
      org_id: response.data.org_id,
      url: response.data.url,
      thumbnail_url: response.data.thumbnail_url,
      mapstack_id: response.data.mapstack_id,
      mapstack_floor: response.data.mapstack_floor,
    };
  } catch (error) {
    console.error("❌ Map API Error:", error.response?.data || error.message);
    return null;
  }
};

// ============================
// WAYFINDING PATH HELPERS
// ============================

/**
 * Fetch wayfinding path for a specific map
 * Returns nodes and edges that define the walkable path network
 */
const fetchWayfindingPath = async (mapId) => {
  try {
    const url = `${MIST_API_BASE}/sites/${MIST_SITE_ID}/maps/${mapId}/wayfinding_path`;
    console.log(`🗺️ Fetching wayfinding path for map ${mapId}:`, url);
    const response = await axios.get(url, {
      headers: getMistHeaders(),
    });

    // Log the structure for debugging
    if (response.data && response.data.nodes) {
      console.log(`✅ Found ${response.data.nodes.length} wayfinding nodes`);
      console.log(
        `✅ Found ${Object.keys(response.data.edges || {}).length} wayfinding edges`,
      );
    } else {
      console.log(`⚠️ No wayfinding path data found for map ${mapId}`);
    }

    return response.data;
  } catch (error) {
    console.error(
      "❌ Wayfinding API Error:",
      error.response?.data || error.message,
    );
    return null;
  }
};

/**
 * Find the nearest node on the wayfinding path to a given asset position
 * Returns the closest node that the asset could snap to
 */
const findNearestNode = (wayfindingPath, assetX, assetY) => {
  if (
    !wayfindingPath ||
    !wayfindingPath.nodes ||
    wayfindingPath.nodes.length === 0
  ) {
    return null;
  }

  let nearestNode = null;
  let minDistance = Infinity;

  wayfindingPath.nodes.forEach((node) => {
    if (
      node.position &&
      node.position.x !== undefined &&
      node.position.y !== undefined
    ) {
      const dx = node.position.x - assetX;
      const dy = node.position.y - assetY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance) {
        minDistance = distance;
        nearestNode = node;
      }
    }
  });

  return {
    node: nearestNode,
    distance: minDistance,
    // If distance is large (> 1000 pixels), the asset might not be on a path
    isOnPath: minDistance < 1000,
  };
};

/**
 * Build a route from start node to destination node using BFS
 * Since Mist edges are unweighted (weight: 1), BFS works well
 */
const findRoute = (wayfindingPath, startNodeName, destNodeName) => {
  if (!wayfindingPath || !wayfindingPath.nodes || !wayfindingPath.edges) {
    return null;
  }

  // Build adjacency list from edges
  const adjacency = {};
  wayfindingPath.nodes.forEach((node) => {
    adjacency[node.name] = [];
  });

  // Populate edges (bidirectional)
  Object.keys(wayfindingPath.edges).forEach((sourceName) => {
    const edgeData = wayfindingPath.edges[sourceName];
    Object.keys(edgeData).forEach((targetName) => {
      if (adjacency[sourceName]) {
        adjacency[sourceName].push(targetName);
      }
    });
  });

  // BFS to find shortest path
  const queue = [[startNodeName]];
  const visited = new Set([startNodeName]);

  while (queue.length > 0) {
    const path = queue.shift();
    const currentNode = path[path.length - 1];

    if (currentNode === destNodeName) {
      // Found destination - build route with node details
      const routeNodes = path
        .map((nodeName) => {
          return wayfindingPath.nodes.find((n) => n.name === nodeName);
        })
        .filter((n) => n);

      return {
        path: path,
        nodes: routeNodes,
        segments: path.length - 1,
      };
    }

    // Explore neighbors
    const neighbors = adjacency[currentNode] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }

  // No route found
  return null;
};

// ============================
// COORDINATE CONVERSION HELPERS
// ============================

/**
 * Convert Mist pixel coordinates to world coordinates
 * Useful for frontend Three.js rendering
 */
const convertMistToWorld = (pixelX, pixelY, mapData) => {
  if (!mapData || !mapData.ppm || mapData.origin_x === undefined) {
    console.warn("⚠️ Missing map data for coordinate conversion");
    return null;
  }

  const { origin_x, origin_y, ppm } = mapData;

  // Convert from pixel space to meters
  const realX = (pixelX - origin_x) / ppm;
  const realZ = -(pixelY - origin_y) / ppm; // Flip Y for Three.js Z

  return {
    x: realX,
    z: realZ,
    y: 0.1, // Default height above floor
  };
};

/**
 * Convert wayfinding nodes to world coordinates
 */
const convertWayfindingNodes = (nodes, mapData) => {
  if (!nodes || !mapData) return [];

  return nodes.map((node) => {
    const worldPos = convertMistToWorld(
      node.position.x,
      node.position.y,
      mapData,
    );

    return {
      ...node,
      worldPosition: worldPos,
    };
  });
};

// ============================
// GET VISITOR LOCATION WITH ROUTE
// ============================

/**
 * GET VISITOR ROUTE - Get current location and navigation route for visitor
 * GET /api/IDVisitor/visitors/:id/location
 */
exports.getVisitorRoute = async (req, res) => {
  try {
    const { id } = req.params;
    const { includePath = "true" } = req.query; // Optional query param to include path

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
    let wayfindingPath = null;
    let nearestNode = null;
    let routeToDestination = null;
    let convertedNodes = null;

    if (matchedAsset.map_id) {
      try {
        // Fetch map details
        mapDetails = await fetchMapDetails(matchedAsset.map_id);

        // Fetch wayfinding path if requested
        if (includePath === "true") {
          wayfindingPath = await fetchWayfindingPath(matchedAsset.map_id);

          if (
            wayfindingPath &&
            wayfindingPath.nodes &&
            wayfindingPath.nodes.length > 0
          ) {
            // Convert nodes to world coordinates for frontend
            convertedNodes = convertWayfindingNodes(
              wayfindingPath.nodes,
              mapDetails,
            );

            // Find nearest node to the asset's current position
            nearestNode = findNearestNode(
              wayfindingPath,
              matchedAsset.x,
              matchedAsset.y,
            );

            // Target coordinates (destination cabinet/room)
            // You can make this dynamic based on the visitor's destination
            const targetX = 5525.298750495607;
            const targetY = 2491.837930104785;

            // Find nearest node to the destination
            const destNode = findNearestNode(wayfindingPath, targetX, targetY);

            // Find route from nearest node to destination node
            if (nearestNode && nearestNode.node && destNode && destNode.node) {
              routeToDestination = findRoute(
                wayfindingPath,
                nearestNode.node.name,
                destNode.node.name,
              );
            }
          }
        }
      } catch (error) {
        console.warn("⚠️ Could not fetch wayfinding data:", error.message);
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
            ppm: mapDetails.ppm, // ← ADDED: Critical for coordinate conversion
            origin_x: mapDetails.origin_x, // ← ADDED: Critical for coordinate conversion
            origin_y: mapDetails.origin_y, // ← ADDED: Critical for coordinate conversion
            orientation: mapDetails.orientation,
            width_m: mapDetails.width_m,
            height_m: mapDetails.height_m,
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

    // Add wayfinding data if available
    if (wayfindingPath && includePath === "true") {
      locationData.wayfinding = {
        total_nodes: wayfindingPath.nodes.length,
        total_edges: Object.keys(wayfindingPath.edges || {}).length,
        nearest_node: nearestNode
          ? {
              name: nearestNode.node.name,
              position: nearestNode.node.position,
              distance_pixels: nearestNode.distance,
              is_on_path: nearestNode.isOnPath,
            }
          : null,
        route_to_destination: routeToDestination
          ? {
              path: routeToDestination.path,
              segments: routeToDestination.segments,
              nodes: routeToDestination.nodes.map((node) => ({
                name: node.name,
                position: node.position,
              })),
            }
          : null,
        // Full path data for rendering (with world coordinates)
        nodes: wayfindingPath.nodes.map((node) => ({
          name: node.name,
          position: node.position,
          edges: node.edges || {},
          // Add world coordinates for Three.js
          worldPosition: convertMistToWorld(
            node.position.x,
            node.position.y,
            mapDetails,
          ),
        })),
        edges: wayfindingPath.edges,
      };
    }

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
// GET WAYFINDING PATH ONLY
// ============================

/**
 * GET WAYFINDING PATH - Get the wayfinding path for a map
 * GET /api/IDVisitor/maps/:mapId/wayfinding
 */
exports.getWayfindingPath = async (req, res) => {
  try {
    const { mapId } = req.params;

    if (!mapId) {
      return res.status(400).json({
        success: false,
        message: "Map ID is required",
      });
    }

    console.log("🗺️ Fetching wayfinding path for map:", mapId);

    // Fetch map details first for coordinate conversion
    const mapDetails = await fetchMapDetails(mapId);

    const wayfindingPath = await fetchWayfindingPath(mapId);

    if (!wayfindingPath) {
      return res.status(404).json({
        success: false,
        message: "Wayfinding path not found for this map",
        suggestion:
          "Make sure wayfinding paths are drawn in the Mist dashboard",
      });
    }

    // Add world coordinates to nodes
    const nodesWithWorldCoords = wayfindingPath.nodes.map((node) => ({
      ...node,
      worldPosition: mapDetails
        ? convertMistToWorld(node.position.x, node.position.y, mapDetails)
        : null,
    }));

    res.status(200).json({
      success: true,
      data: {
        ...wayfindingPath,
        nodes: nodesWithWorldCoords,
        map: mapDetails
          ? {
              id: mapDetails.id,
              name: mapDetails.name,
              ppm: mapDetails.ppm,
              origin_x: mapDetails.origin_x,
              origin_y: mapDetails.origin_y,
              width: mapDetails.width,
              height: mapDetails.height,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching wayfinding path:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching wayfinding path",
      error: error.message,
    });
  }
};

// ============================
// GET ASSET NAVIGATION ROUTE
// ============================

/**
 * GET NAVIGATION ROUTE - Get route between two points on a map
 * GET /api/IDVisitor/maps/:mapId/route?fromX=&fromY=&toX=&toY=
 */
exports.getNavigationRoute = async (req, res) => {
  try {
    const { mapId } = req.params;
    const { fromX, fromY, toX, toY } = req.query;

    if (!mapId) {
      return res.status(400).json({
        success: false,
        message: "Map ID is required",
      });
    }

    if (!fromX || !fromY || !toX || !toY) {
      return res.status(400).json({
        success: false,
        message: "fromX, fromY, toX, toY are required as query parameters",
        example:
          "/api/IDVisitor/maps/123/route?fromX=100&fromY=200&toX=500&toY=600",
      });
    }

    console.log("🗺️ Finding route on map:", mapId);
    console.log(`   From: (${fromX}, ${fromY})`);
    console.log(`   To: (${toX}, ${toY})`);

    // Fetch map details
    const mapDetails = await fetchMapDetails(mapId);

    // Fetch wayfinding path
    const wayfindingPath = await fetchWayfindingPath(mapId);

    if (
      !wayfindingPath ||
      !wayfindingPath.nodes ||
      wayfindingPath.nodes.length === 0
    ) {
      return res.status(404).json({
        success: false,
        message: "No wayfinding path found for this map",
        suggestion: "Draw wayfinding paths in the Mist dashboard first",
      });
    }

    // Convert string params to numbers
    const startX = parseFloat(fromX);
    const startY = parseFloat(fromY);
    const endX = parseFloat(toX);
    const endY = parseFloat(toY);

    // Find nearest nodes to start and end positions
    const startNode = findNearestNode(wayfindingPath, startX, startY);
    const endNode = findNearestNode(wayfindingPath, endX, endY);

    if (!startNode || !startNode.node) {
      return res.status(404).json({
        success: false,
        message: "Could not find a wayfinding node near the start position",
      });
    }

    if (!endNode || !endNode.node) {
      return res.status(404).json({
        success: false,
        message: "Could not find a wayfinding node near the end position",
      });
    }

    // Find route
    const route = findRoute(
      wayfindingPath,
      startNode.node.name,
      endNode.node.name,
    );

    if (!route) {
      return res.status(404).json({
        success: false,
        message: "No route found between the specified points",
        start_node: startNode.node.name,
        end_node: endNode.node.name,
      });
    }

    // Convert route nodes to world coordinates
    const routeNodesWithWorld = route.nodes.map((node) => ({
      ...node,
      worldPosition: mapDetails
        ? convertMistToWorld(node.position.x, node.position.y, mapDetails)
        : null,
    }));

    res.status(200).json({
      success: true,
      data: {
        start: {
          position: { x: startX, y: startY },
          nearest_node: {
            name: startNode.node.name,
            position: startNode.node.position,
            distance: startNode.distance,
          },
          worldPosition: mapDetails
            ? convertMistToWorld(startX, startY, mapDetails)
            : null,
        },
        end: {
          position: { x: endX, y: endY },
          nearest_node: {
            name: endNode.node.name,
            position: endNode.node.position,
            distance: endNode.distance,
          },
          worldPosition: mapDetails
            ? convertMistToWorld(endX, endY, mapDetails)
            : null,
        },
        route: {
          ...route,
          nodes: routeNodesWithWorld,
        },
        total_segments: route.segments,
        total_nodes: route.path.length,
        map: mapDetails
          ? {
              id: mapDetails.id,
              name: mapDetails.name,
              ppm: mapDetails.ppm,
              origin_x: mapDetails.origin_x,
              origin_y: mapDetails.origin_y,
              width: mapDetails.width,
              height: mapDetails.height,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("❌ Error finding navigation route:", error);
    res.status(500).json({
      success: false,
      message: "Error finding navigation route",
      error: error.message,
    });
  }
};

// ============================
// TEST COORDINATE CONVERSION
// ============================

/**
 * TEST COORDINATE CONVERSION - Debug endpoint
 * GET /api/IDVisitor/maps/:mapId/convert?x=&y=
 */
exports.testCoordinateConversion = async (req, res) => {
  try {
    const { mapId } = req.params;
    const { x, y } = req.query;

    if (!mapId) {
      return res.status(400).json({
        success: false,
        message: "Map ID is required",
      });
    }

    if (!x || !y) {
      return res.status(400).json({
        success: false,
        message: "x and y query parameters are required",
        example: "/api/IDVisitor/maps/123/convert?x=6140&y=1369",
      });
    }

    // Fetch map data
    const mapData = await fetchMapDetails(mapId);

    if (!mapData) {
      return res.status(404).json({
        success: false,
        message: "Map not found",
      });
    }

    const pixelX = parseFloat(x);
    const pixelY = parseFloat(y);

    // Convert to world coordinates
    const worldPos = convertMistToWorld(pixelX, pixelY, mapData);

    res.json({
      success: true,
      data: {
        pixel: { x: pixelX, y: pixelY },
        map: {
          id: mapData.id,
          name: mapData.name,
          origin_x: mapData.origin_x,
          origin_y: mapData.origin_y,
          ppm: mapData.ppm,
          width: mapData.width,
          height: mapData.height,
        },
        world: worldPos,
        formula: {
          realX: "(pixelX - origin_x) / ppm",
          realZ: "-(pixelY - origin_y) / ppm",
          y: "0.1 (default height)",
        },
      },
    });
  } catch (error) {
    console.error("❌ Error testing conversion:", error);
    res.status(500).json({
      success: false,
      message: "Error testing conversion",
      error: error.message,
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
              ppm: mapDetails.ppm,
              origin_x: mapDetails.origin_x,
              origin_y: mapDetails.origin_y,
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
