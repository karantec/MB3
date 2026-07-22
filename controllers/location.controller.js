const Visitor = require("../models/User/IdVisitorQR.model");
const mistService = require("../services/mist.service");
exports.getVisitorRoute = async (req, res) => {
  try {
    const { id } = req.params;

    const visitor = await Visitor.findById(id);

    if (!visitor) {
      return res.status(404).json({
        success: false,
        message: "Visitor not found",
      });
    }

    const assets = await mistService.getAssets();

    const asset = assets.find((a) => a.name === visitor.visitorName);

    if (!asset) {
      return res.status(404).json({
        success: false,
        message: "Visitor location not found",
      });
    }

    res.json({
      success: true,

      currentLocation: {
        x: asset.x,
        y: asset.y,
      },

      destination: {
        x: visitor.destination.x,
        y: visitor.destination.y,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};
