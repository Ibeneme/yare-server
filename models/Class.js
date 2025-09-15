const mongoose = require("mongoose");
const { Schema } = mongoose;

const ClassSchema = new Schema(
  {
    title: {
      type: String,
      required: [true, "Class title is required"],
      trim: true,
      minlength: [3, "Class title must be at least 3 characters long"],
      maxlength: [100, "Class title cannot exceed 100 characters"],
    },
    courseId: {
      // New field: reference to Course model
      type: Schema.Types.ObjectId,
      ref: "Course", // Reference to your Course model
      required: [true, "Course ID is required"],
    },
    studentIds: {
      type: [String], // Array of student ID strings
      default: [],
    },
    parentIds: {
      type: [String], // Array of student ID strings
      default: [],
    },

    // departmentId: {
    //   type: Schema.Types.ObjectId,
    //   ref: "Department", // Reference to your Department model
    //   required: [true, "Department is required"],
    // },
    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "Teacher", // Reference to your Teacher model
      //required: [true, "Teacher is required"],
    },
 
    date: {
      type: Date,
      required: [true, "Class date is required"],
    },
    time: {
      type: String,
      required: [true, "Class time is required"],
      match: [
        /^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/,
        "Invalid time format (HH:MM)",
      ],
    },
    duration: {
      type: Number,
      required: [true, "Class duration is required"],
      min: [1, "Duration must be at least 1 minute"],
    },
    status: {
      type: String,
      enum: ["ongoing", "upcoming", "finished", "canceled"],
      default: "upcoming",
      required: [true, "Class status is required"],
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

// Create the Mongoose model
const Class = mongoose.model("Class", ClassSchema);

module.exports = Class;
