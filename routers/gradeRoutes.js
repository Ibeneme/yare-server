const express = require("express");
const router = express.Router();
const Grade = require("../models/Grade");

// CREATE grade
router.post("/", async (req, res) => {
  const { title, description } = req.body;

  if (!title || !description) {
    return res
      .status(400)
      .json({ success: false, message: "Title and description are required." });
  }

  try {
    const newGrade = new Grade({ title, description });
    await newGrade.save();
    return res.status(201).json({
      success: true,
      message: "Grade created successfully",
      data: newGrade,
    });
  } catch (error) {
    console.error("Error creating grade:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create grade",
      error: error.message,
    });
  }
});

// GET all grades
router.get("/", async (req, res) => {
  try {
    const grades = await Grade.find().sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: grades });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch grades",
      error: error.message,
    });
  }
});

// GET single grade by ID
router.get("/:id", async (req, res) => {
  try {
    const grade = await Grade.findById(req.params.id);
    if (!grade) {
      return res
        .status(404)
        .json({ success: false, message: "Grade not found" });
    }
    return res.status(200).json({ success: true, data: grade });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch grade",
      error: error.message,
    });
  }
});

// UPDATE grade
router.put("/:id", async (req, res) => {
  const { title, description } = req.body;

  if (!title || !description) {
    return res.status(400).json({
      success: false,
      message: "Title and description are required for update.",
    });
  }

  try {
    const updatedGrade = await Grade.findByIdAndUpdate(
      req.params.id,
      { title, description },
      { new: true, runValidators: true }
    );

    if (!updatedGrade) {
      return res
        .status(404)
        .json({ success: false, message: "Grade not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Grade updated successfully",
      data: updatedGrade,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to update grade",
      error: error.message,
    });
  }
});

module.exports = router;
