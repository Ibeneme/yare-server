const express = require("express");
const Grade = require("../models/Grade");
const Subject = require("../models/Subject");
const { default: mongoose } = require("mongoose");
const Teacher = require("../models/Teacher");
const router = express.Router();

router.post("/", async (req, res) => {
  console.log("📌 CREATE GRADE BODY:", req.body);

  try {
    const grade = await Grade.create(req.body);

    console.log("✅ GRADE CREATED:", grade._id);

    return res.status(201).json({
      success: true,
      message: "Grade created successfully",
      data: grade,
    });
  } catch (err) {
    console.error("❌ CREATE GRADE ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to create grade",
      error: err.message,
    });
  }
});

router.get("/", async (req, res) => {
  console.log("📌 GET ALL GRADES");

  try {
    const grades = await Grade.find().populate(
      "subjectIds", // 🔥 updated to match schema
      "name code description"
    );

    console.log("✅ GRADES FETCHED:", grades.length);

    return res.status(200).json({
      success: true,
      data: grades,
    });
  } catch (err) {
    console.error("❌ GET ALL GRADES ERROR:", err.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch grades",
      error: err.message,
    });
  }
});

router.get("/:id", async (req, res) => {
  console.log("📌 FETCH GRADE:", req.params.id);

  try {
    const grade = await Grade.findById(req.params.id);

    if (!grade)
      return res.status(404).json({
        success: false,
        message: "Grade not found",
      });

    return res.status(200).json({
      success: true,
      data: grade,
    });
  } catch (err) {
    console.error("❌ GET GRADE BY ID ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch grade",
    });
  }
});
router.get("/subjects/:gradeId", async (req, res) => {
  const { gradeId } = req.params;
  console.log("📌 FETCH SUBJECTS FOR GRADE:", gradeId);

  try {
    // Validate gradeId
    if (!mongoose.isValidObjectId(gradeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid gradeId format",
      });
    }

    // Find subjects where gradeLevel array contains gradeId
    const subjects = await Subject.find({
      gradeLevel: gradeId,
    })
      .populate("gradeLevel", "title description")
      .populate("teachers", "firstName lastName email")
      .populate("classes", "name gradeLevel");

    console.log("📌 SUBJECTS FOUND:", subjects.length);

    return res.status(200).json({
      success: true,
      gradeId,
      count: Array.isArray(subjects) ? subjects.length : 0,
      data: Array.isArray(subjects) ? subjects : [],
    });
  } catch (err) {
    console.error("❌ ERROR FETCHING SUBJECTS FOR GRADE:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch subjects for this grade",
      error: err.message,
    });
  }
});

router.put("/:id", async (req, res) => {
  console.log("📌 UPDATE GRADE:", req.params.id);
  console.log("📌 BODY:", req.body);

  try {
    const updated = await Grade.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updated)
      return res.status(404).json({
        success: false,
        message: "Grade not found",
      });

    return res.status(200).json({
      success: true,
      message: "Grade updated",
      data: updated,
    });
  } catch (err) {
    console.error("❌ UPDATE GRADE ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: "Update failed",
      error: err.message,
    });
  }
});

/**
 * ---------------------------------------
 * DELETE GRADE
 * DELETE /grades/:id
 * ---------------------------------------
 */
router.delete("/:id", async (req, res) => {
  console.log("📌 DELETE GRADE:", req.params.id);

  try {
    const grade = await Grade.findByIdAndDelete(req.params.id);

    if (!grade)
      return res.status(404).json({
        success: false,
        message: "Grade not found",
      });

    return res.status(200).json({
      success: true,
      message: "Grade deleted",
    });
  } catch (err) {
    console.error("❌ DELETE GRADE ERROR:", err.message);
    return res.status(500).json({
      success: false,
      message: "Failed to delete grade",
    });
  }
});

router.get("/teachers/all", async (req, res) => {
  try {
    const teachers = await Teacher.find().select("firstName lastName email"); // only select necessary fields
    return res.status(200).json({
      success: true,
      count: teachers.length,
      data: teachers,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch teachers",
      error: err.message,
    });
  }
});


module.exports = router;
