// controllers/IdManagementController.js

const IdManagement = require("../models/IDManagement.model");

/* ===========================
   CREATE ID RECORD
=========================== */

const createIdRecord = async (req, res) => {
  try {
    const record = await IdManagement.create({
      ...req.body,
      createdBy: req.user?.userId || null,
    });

    res.status(201).json({
      success: true,
      message: "ID record created successfully.",
      data: record,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===========================
   GET ALL ID RECORDS
=========================== */

const getAllIdRecords = async (req, res) => {
  try {
    const {
      search,
      status,
      idType,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filter = {
      isActive: true,
    };

    if (status) filter.status = status;
    if (idType) filter.idType = idType;

    if (search) {
      filter.$or = [
        { visitorName: { $regex: search, $options: "i" } },
        { phoneNumber: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { idNumber: { $regex: search, $options: "i" } },
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder.toLowerCase() === "asc" ? 1 : -1;

    const records = await IdManagement.find(filter)
      .populate("createdBy", "fullName email")
      .sort(sort);

    const total = await IdManagement.countDocuments(filter);

    res.json({
      success: true,
      records,
      total,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===========================
   GET ID RECORD BY ID
=========================== */

const getIdRecordById = async (req, res) => {
  try {
    const record = await IdManagement.findById(req.params.id).populate(
      "createdBy",
      "fullName email",
    );

    if (!record || !record.isActive) {
      return res.status(404).json({
        success: false,
        message: "ID record not found.",
      });
    }

    res.json({
      success: true,
      data: record,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===========================
   GET ID RECORDS BY PHONE
=========================== */

const getIdRecordsByPhone = async (req, res) => {
  try {
    const records = await IdManagement.find({
      phoneNumber: req.params.phone,
      isActive: true,
    });

    res.json({
      success: true,
      records,
      count: records.length,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===========================
   UPDATE ID RECORD
=========================== */

const updateIdRecord = async (req, res) => {
  try {
    const record = await IdManagement.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
      },
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "ID record not found.",
      });
    }

    res.json({
      success: true,
      message: "ID record updated successfully.",
      data: record,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===========================
   DELETE ID RECORD (Soft Delete)
=========================== */

const deleteIdRecord = async (req, res) => {
  try {
    const record = await IdManagement.findByIdAndUpdate(
      req.params.id,
      {
        isActive: false,
        deletedAt: new Date(),
      },
      {
        new: true,
      },
    );

    if (!record) {
      return res.status(404).json({
        success: false,
        message: "ID record not found.",
      });
    }

    res.json({
      success: true,
      message: "ID record deleted successfully.",
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===========================
   GET ACTIVE ID RECORDS
=========================== */

const getActiveIdRecords = async (req, res) => {
  try {
    const records = await IdManagement.find({
      status: "Active",
      isActive: true,
    });

    res.json({
      success: true,
      records,
      count: records.length,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===========================
   GET EXPIRED ID RECORDS
=========================== */

const getExpiredIdRecords = async (req, res) => {
  try {
    const records = await IdManagement.find({
      status: "Expired",
      isActive: true,
    });

    res.json({
      success: true,
      records,
      count: records.length,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/* ===========================
   GET ID STATISTICS
=========================== */

const getIdStats = async (req, res) => {
  try {
    const stats = await IdManagement.aggregate([
      {
        $match: {
          isActive: true,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: {
              $cond: [{ $eq: ["$status", "Active"] }, 1, 0],
            },
          },
          expired: {
            $sum: {
              $cond: [{ $eq: ["$status", "Expired"] }, 1, 0],
            },
          },
          revoked: {
            $sum: {
              $cond: [{ $eq: ["$status", "Revoked"] }, 1, 0],
            },
          },
          visitors: {
            $sum: {
              $cond: [{ $eq: ["$idType", "Visitor"] }, 1, 0],
            },
          },
          employees: {
            $sum: {
              $cond: [{ $eq: ["$idType", "Employee"] }, 1, 0],
            },
          },
          contractors: {
            $sum: {
              $cond: [{ $eq: ["$idType", "Contractor"] }, 1, 0],
            },
          },
        },
      },
    ]);

    res.json({
      success: true,
      stats: stats[0] || {
        total: 0,
        active: 0,
        expired: 0,
        revoked: 0,
        visitors: 0,
        employees: 0,
        contractors: 0,
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

module.exports = {
  createIdRecord,
  getAllIdRecords,
  getIdRecordById,
  getIdRecordsByPhone,
  updateIdRecord,
  deleteIdRecord,
  getActiveIdRecords,
  getExpiredIdRecords,
  getIdStats,
};
