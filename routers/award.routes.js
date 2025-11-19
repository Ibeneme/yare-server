const express = require("express");
const mongoose = require("mongoose");
const Award = require("../models/Awards");
const Subject = require("../models/Subject");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();


router.post("/", async (req, res) => {
  try {
    const { subjectId, studentId, teacherId, ...rest } = req.body;

    if (!subjectId || !studentId || !teacherId) {
      return res.status(400).json({
        message: "subjectId, studentId and teacherId are required",
      });
    }

    // Fetch related documents
    const [subject, student, teacher] = await Promise.all([
      Subject.findById(subjectId).select("title"),
      Student.findById(studentId).select("firstName lastName email"),
      Teacher.findById(teacherId).select("firstName lastName email"),
    ]);

    if (!subject || !student || !teacher) {
      return res.status(404).json({
        message: "Subject, Student or Teacher not found",
      });
    }

    // Create award object
    const award = new Award({
      subject: {
        _id: subject._id,
        title: subject.title,
      },
      student: {
        _id: student._id,
        name: `${student.firstName} ${student.lastName}`,
        email: student.email,
      },
      teacher: {
        _id: teacher._id,
        name: `${teacher.firstName} ${teacher.lastName}`,
        email: teacher.email,
      },
      ...rest,
    });

    await award.save();

    res.status(201).json({
      message: "Award created successfully",
      award,
    });
  } catch (error) {
    console.error("🔥 Error creating award:", error);
    res.status(500).json({ message: "Error creating award", error });
  }
});

/* ============================================================
   📌 GET AWARDS (ADMIN / TEACHER / STUDENT)
============================================================ */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { userType, id: userId } = req.user;
    let awards;

    if (userType === "admin") {
      awards = await Award.find().sort({ createdAt: -1 });
    } else if (userType === "teacher") {
      awards = await Award.find({ "teacher._id": userId }).sort({
        createdAt: -1,
      });
    } else if (userType === "student") {
      const student = await Student.findById(userId).lean();

      if (!student) {
        return res.status(404).json({ message: "Student not found" });
      }

      awards = await Award.find({
        "student._id": student._id,
      }).sort({ createdAt: -1 });
    } else {
      return res.status(403).json({ message: "Unauthorized user type" });
    }

    res.status(200).json({
      message: "Awards fetched successfully",
      data: awards,
    });
  } catch (error) {
    console.error("🔥 Error fetching awards:", error);
    res.status(500).json({ message: "Failed to fetch awards", error });
  }
});

/* ============================================================
   📌 UPDATE AWARD
============================================================ */
router.put("/:id", async (req, res) => {
  try {
    const updatedAward = await Award.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!updatedAward) {
      return res.status(404).json({ message: "Award not found" });
    }

    res.json({
      message: "Award updated successfully",
      award: updatedAward,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating award", error });
  }
});

/* ============================================================
   📌 DELETE AWARD
============================================================ */
router.delete("/:id", async (req, res) => {
  try {
    const award = await Award.findByIdAndDelete(req.params.id);

    if (!award) {
      return res.status(404).json({ message: "Award not found" });
    }

    res.json({ message: "Award deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting award", error });
  }
});

router.post("/by-subject", async (req, res) => {
  try {
    const { subjectId } = req.body;

    if (!subjectId || !mongoose.isValidObjectId(subjectId)) {
      return res.status(400).json({ success: false, message: "Valid subjectId is required" });
    }

    const awards = await Award.find({ "subject._id": subjectId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Awards fetched successfully by subjectId",
      count: awards.length,
      data: awards,
    });
  } catch (error) {
    console.error("🔥 Error fetching awards by subject:", error);
    res.status(500).json({ success: false, message: "Failed to fetch awards", error });
  }
});




module.exports = router;
