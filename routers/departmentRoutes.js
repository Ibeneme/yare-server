const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Department = require("../models/Department");
const Course = require("../models/Course");

// Helper to validate courseIds array if provided
const validateCourseIds = (courseIds) => {
  if (!Array.isArray(courseIds)) return [];
  return courseIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
};

router.post("/", async (req, res) => {
    try {
      const { name, courseIds } = req.body;
  
      if (!name) {
        return res
          .status(400)
          .json({ success: false, message: "Name is required" });
      }
  
      // 🔍 Check for existing department (case-insensitive)
      const existingDepartment = await Department.findOne({
        name: { $regex: `^${name.trim()}$`, $options: "i" },
      });
  
      if (existingDepartment) {
        return res.status(409).json({
          success: false,
          message: "Department with this name already exists",
        });
      }
  
      const validCourseIds = courseIds ? validateCourseIds(courseIds) : [];
  
      const newDepartment = await Department.create({
        name: name.trim(),
        courseIds: validCourseIds,
      });
  
      res.status(201).json({
        success: true,
        message: "Department created successfully",
        department: newDepartment,
      });
    } catch (error) {
      console.error("Error creating department:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

// READ ALL - GET /api/departments
router.get("/", async (req, res) => {
  try {
    const departments = await Department.find().populate("courseIds");
    res.json({ success: true, departments });
  } catch (error) {
    console.error("Error fetching departments:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// READ ONE - GET /api/departments/:id
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid department ID" });
    }
    const department = await Department.findById(id).populate("courseIds");
    if (!department) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }
    res.json({ success: true, department });
  } catch (error) {
    console.error("Error fetching department:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// UPDATE - PUT /api/departments/:id
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, courseIds } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid department ID" });
    }

    const updateData = {};
    if (name) updateData.name = name;
    if (courseIds) updateData.courseIds = validateCourseIds(courseIds);

    const updatedDepartment = await Department.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!updatedDepartment) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }

    res.json({
      success: true,
      message: "Department updated successfully",
      department: updatedDepartment,
    });
  } catch (error) {
    console.error("Error updating department:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE - DELETE /api/departments/:id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid department ID" });
    }

    const deletedDepartment = await Department.findByIdAndDelete(id);

    if (!deletedDepartment) {
      return res
        .status(404)
        .json({ success: false, message: "Department not found" });
    }

    res.json({ success: true, message: "Department deleted successfully" });
  } catch (error) {
    console.error("Error deleting department:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
