const mongoose = require("mongoose");

const SubscribedStudentSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Student",
    required: true,
  },
  subscribedAt: { type: Date, default: Date.now, index: { expires: "30d" } }, // TTL index: expires in 30 days
});

const CourseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,

  subscribedStudents: [SubscribedStudentSchema],

  teacherIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Teacher" }],

  isSuspended: { type: Boolean, default: false },
});

module.exports = mongoose.model("Course", CourseSchema);
