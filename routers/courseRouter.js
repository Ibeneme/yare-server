const express = require("express");
const router = express.Router();
const Course = require("../models/Course"); // Adjust path if needed

// Create Course
router.post("/", async (req, res) => {
  try {
    const { title, description, subscribedStudents, teacherIds } = req.body;

    const newCourse = new Course({
      title,
      description,
      subscribedStudents: subscribedStudents || [],
      // teacherIds: teacherIds || [],
    });

    const savedCourse = await newCourse.save();
    res.status(201).json({ success: true, data: savedCourse });
  } catch (err) {
    console.error("Error creating course:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Get Single Course
router.get("/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate(
      "subscribedStudents"
    );
    // .populate("teacherIds");

    if (!course) {
      return res
        .status(404)
        .json({ success: false, error: "Course not found" });
    }

    res.json({ success: true, data: course });
  } catch (err) {
    console.error("Error fetching course:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

// Get All Courses
router.get("/", async (req, res) => {
  try {
    const courses = await Course.find().populate("subscribedStudents");
    // .populate("teacherIds");

    // Transform the result: replace `title` with `name`
    const transformedCourses = courses.map((course) => {
      const courseObj = course.toObject(); // convert Mongoose document to plain object
      courseObj.name = courseObj.title;
      delete courseObj.title;
      return courseObj;
    });

    res.json({ success: true, data: transformedCourses });
  } catch (err) {
    console.error("Error fetching courses:", err);
    res.status(500).json({ success: false, error: "Server error" });
  }
});

module.exports = router;
