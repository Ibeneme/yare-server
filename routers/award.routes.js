const express = require("express");
const Award = require("../models/Awards");
const Course = require("../models/Course");
const Student = require("../models/Student");
const Teacher = require("../models/Teacher");
const authMiddleware = require("../middlewares/authMiddleware");

const router = express.Router();

// Create an award
router.post("/", async (req, res) => {
  try {
    const { courseId, studentId, teacherId, ...rest } = req.body;

    if (!courseId || !studentId || !teacherId) {
      return res.status(400).json({
        message: "courseId, studentId and teacherId are required",
      });
    }

    // 🔹 Fetch related details
    const [course, student, teacher] = await Promise.all([
      Course.findById(courseId).select("title name"),
      Student.findById(studentId).select("firstName lastName email"),
      Teacher.findById(teacherId).select("firstName lastName email"),
    ]);

    if (!course || !student || !teacher) {
      return res.status(404).json({
        message: "One or more referenced documents not found",
      });
    }

    // 🔹 Build Award with details
    const award = new Award({
      course: { _id: course._id, title: course.title || course.name },
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
      ...rest, // include any other fields (e.g. awardType, description, etc.)
    });

    await award.save();

    return res
      .status(201)
      .json({ message: "Award created successfully", award });
  } catch (error) {
    console.error("🔥 Error creating award:", error);
    return res.status(400).json({ message: "Error creating award", error });
  }
});


router.get("/", authMiddleware, async (req, res) => {
    try {
      const { userType, id: userId } = req.user;
  
      let awards;
  
      if (userType === "admin") {
        // 🔹 Admin: fetch all
        awards = await Award.find().sort({ createdAt: -1 });
      } else if (userType === "teacher") {
        // 🔹 Teacher: fetch only their awards
        awards = await Award.find({ "teacher._id": userId }).sort({ createdAt: -1 });
      } else if (userType === "student") {
        // 🔹 Student: fetch awards belonging to student + courses enrolled
        const student = await Student.findById(userId).lean();
        if (!student) {
          return res.status(404).json({ message: "Student not found" });
        }
  
        awards = await Award.find({
          "student._id": student._id,
          "course._id": { $in: student.courses }, // courses is array in Student
        }).sort({ createdAt: -1 });
      } else {
        return res.status(403).json({ message: "Unauthorized user type" });
      }
  
      res.status(200).json({ message: "Awards fetched successfully", data: awards });
    } catch (error) {
      console.error("🔥 Error fetching awards:", error);
      res.status(500).json({ message: "Failed to fetch awards", error });
    }

})
// Update award
router.put("/:id", async (req, res) => {
  try {
    const award = await Award.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!award) return res.status(404).json({ message: "Award not found" });

    res.json(award);
  } catch (error) {
    res.status(400).json({ message: "Error updating award", error });
  }
});

// Delete award
router.delete("/:id", async (req, res) => {
  try {
    const award = await Award.findByIdAndDelete(req.params.id);

    if (!award) return res.status(404).json({ message: "Award not found" });

    res.json({ message: "Award deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting award", error });
  }
});

module.exports = router;
