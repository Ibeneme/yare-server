const mongoose = require("mongoose");

const gradeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    studentIds: {
      type: [String], // Array of student ID strings
      default: [],
    },
    classIds: {
      type: [String], // Array of class ID strings
      default: [],
    },
    subjectIds: {
      type: [String], // Array of subject ID strings
      default: [],
      ref: "Subject",
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

gradeSchema.virtual("studentCount").get(function () {
  return Array.isArray(this.studentIds) ? this.studentIds.length : 0;
});

// Virtual field for class count
gradeSchema.virtual("classCount").get(function () {
  return Array.isArray(this.classIds) ? this.classIds.length : 0;
});

// Virtual field for subject count
gradeSchema.virtual("subjectCount").get(function () {
  return Array.isArray(this.subjectIds) ? this.subjectIds.length : 0;
});

module.exports = mongoose.model("Grade", gradeSchema);