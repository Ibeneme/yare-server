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

    subjectId: {
      type: Schema.Types.ObjectId,
      ref: "Subject", // Reference to Subject model
      required: [true, "subjectId is required"],
    },

    studentIds: {
      type: [Schema.Types.ObjectId], // Array of student ObjectIds
      ref: "Student",
      default: [],
    },

    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "Teacher", // Reference to Teacher model
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
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

// Create the Mongoose model
const Class = mongoose.model("Class", ClassSchema);

module.exports = Class;
