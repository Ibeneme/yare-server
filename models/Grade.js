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
    gradeIds: {
      type: [String], // Array of student ID strings
      default: [],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual field for student count
gradeSchema.virtual("studentCount").get(function () {
  return this.studentIds.length;
});

module.exports = mongoose.model("Grade", gradeSchema);
