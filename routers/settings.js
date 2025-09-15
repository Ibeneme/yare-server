const express = require("express");
const SettingCustomPrice = require("../models/SettingCustomPrice");
const SettingReport = require("../models/SettingReport");
const Admin = require("../models/Admin");

const router = express.Router();

router.post("/set-local-price", async (req, res) => {
  try {
    const { localPrice, id } = req.body;

    if (!localPrice || !id) {
      return res
        .status(400)
        .json({ message: "localPrice and id are required" });
    }

    const adminUser = await Admin.findById(id);
    if (!adminUser) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Admin not found." });
    }

    const update = {
      localPrice,
      updatedBy: id,
      updatedAt: new Date(),
    };

    const result = await SettingCustomPrice.findOneAndUpdate({}, update, {
      upsert: true,
      new: true,
    });

    res.status(200).json({ message: "Local price updated", data: result });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// 🔹 2. Get Local Price (Default = 0)
router.get("/get-local-price", async (req, res) => {
  try {
    const doc = await SettingCustomPrice.findOne({}, "localPrice");
    const price = doc?.localPrice || 0;

    res.status(200).json({
      message: "Local price fetched",
      data: { localPrice: price },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// 🔹 3. Set International Price
router.post("/set-international-price", async (req, res) => {
  try {
    const { internationalPrice, id } = req.body;

    if (!internationalPrice || !id) {
      return res
        .status(400)
        .json({ message: "internationalPrice and id are required" });
    }

    const adminUser = await Admin.findById(id);
    if (!adminUser) {
      return res
        .status(401)
        .json({ message: "Unauthorized: Admin not found." });
    }

    const update = {
      internationalPrice,
      updatedBy: id,
      updatedAt: new Date(),
    };

    const result = await SettingCustomPrice.findOneAndUpdate({}, update, {
      upsert: true,
      new: true,
    });

    res.status(200).json({
      message: "International price updated",
      data: result,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// 🔹 4. Get International Price (Default = 0)
router.get("/get-international-price", async (req, res) => {
  try {
    const doc = await SettingCustomPrice.findOne({}, "internationalPrice");
    const price = doc?.internationalPrice || 0;

    res.status(200).json({
      message: "International price fetched",
      data: { internationalPrice: price },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// 🔹 5. Submit Report
router.post("/report", async (req, res) => {
  try {
    const { email, title, description } = req.body;

    if (!email || !title || !description) {
      return res
        .status(400)
        .json({ message: "Missing email, title, or description" });
    }

    const report = new SettingReport({
      email,
      title,
      description,
    });

    await report.save();

    res.status(201).json({ message: "Report submitted", data: report });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// 🔹 6. Fetch All Reports
router.get("/reports", async (req, res) => {
  try {
    const reports = await SettingReport.find().sort({ createdAt: -1 });

    res.status(200).json({ message: "Reports fetched", data: reports });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Add Discount
router.post("/discount-feature/discounts", async (req, res) => {
  try {
    const { title, percentage } = req.body;

    console.log(title, percentage, "title, percentage");
    
    if (!title || percentage === undefined) {
      return res
        .status(400)
        .json({ message: "Title and percentage are required" });
    }

    const update = {
      $push: {
        discounts: {
          title,
          percentage,
        },
      },
    };

    const result = await SettingCustomPrice.findOneAndUpdate({}, update, {
      upsert: true,
      new: true,
    });

    res.status(200).json({
      message: "Discount added successfully",
      data: result.discounts,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Update Discount by Index
router.put("/discount-feature/discounts/:index", async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);
    const { title, percentage } = req.body;

    if (isNaN(index) || (!title && percentage === undefined)) {
      return res
        .status(400)
        .json({ message: "Invalid index or missing fields" });
    }

    const settings = await SettingCustomPrice.findOne();
    if (
      !settings ||
      !settings.discounts ||
      index >= settings.discounts.length
    ) {
      return res.status(404).json({ message: "Discount not found" });
    }

    if (title !== undefined) settings.discounts[index].title = title;
    if (percentage !== undefined)
      settings.discounts[index].percentage = percentage;

    await settings.save();

    res.status(200).json({
      message: "Discount updated successfully",
      data: settings.discounts,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Remove Discount by Index
router.delete("/discount-feature/discounts/:index", async (req, res) => {
  try {
    const index = parseInt(req.params.index, 10);

    const settings = await SettingCustomPrice.findOne();
    if (
      !settings ||
      !settings.discounts ||
      index >= settings.discounts.length
    ) {
      return res.status(404).json({ message: "Discount not found" });
    }

    settings.discounts.splice(index, 1);
    await settings.save();

    res.status(200).json({
      message: "Discount removed successfully",
      data: settings.discounts,
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get All Discounts
router.get("/discount-feature/discounts", async (req, res) => {
  try {
    const settings = await SettingCustomPrice.findOne(); // ⬅️ fetch all fields

    if (!settings) {
      return res.status(404).json({ message: "Settings not found." });
    }

    res.status(200).json({
      message: "Discount settings fetched successfully",
      data: settings, // ⬅️ return full document (localPrice, internationalPrice, discounts, etc.)
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;
