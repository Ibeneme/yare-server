const mongoose = require("mongoose");
const { Schema } = mongoose;

// Defines a specific time window in a day (e.g., 09:00 - 10:30)
const TimeWindowSchema = new Schema(
  {
    startTime: {
      type: String,
      required: [true, "Start time is required"],
      match: [
        /^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/,
        "Invalid time format (HH:MM)",
      ],
    },
    endTime: {
      type: String,
      required: [true, "End time is required"],
      match: [
        /^(?:2[0-3]|[01]?[0-9]):[0-5][0-9]$/,
        "Invalid time format (HH:MM)",
      ],
    },
  },
  { _id: false }
);

const nonEmptyTimeSlots = [
  (arr) => Array.isArray(arr) && arr.length > 0,
  "At least one time slot is required",
];

// WEEKLY: one entry per weekday, each with its own independent time slots
// (e.g. Monday 09:00-10:00, Wednesday 14:00-15:30)
const WeeklyDaySchema = new Schema(
  {
    day: { type: Number, min: 0, max: 6, required: true }, // 0 = Sunday ... 6 = Saturday
    timeSlots: {
      type: [TimeWindowSchema],
      validate: nonEmptyTimeSlots,
    },
  },
  { _id: false }
);

// MONTHLY: one entry per day-of-month, each with its own independent time slots
const MonthlyDaySchema = new Schema(
  {
    day: { type: Number, min: 1, max: 31, required: true },
    timeSlots: {
      type: [TimeWindowSchema],
      validate: nonEmptyTimeSlots,
    },
  },
  { _id: false }
);

const SpecificDateSchema = new Schema(
  {
    date: { type: Date, required: true },
    timeSlots: {
      type: [TimeWindowSchema],
      validate: nonEmptyTimeSlots,
    },
  },
  { _id: false }
);

const ScheduleSchema = new Schema(
  {
    frequency: {
      type: String,
      enum: ["none", "daily", "weekly", "monthly"],
      required: true,
      default: "none",
    },

    timeSlots: [TimeWindowSchema],

    daysOfWeek: [WeeklyDaySchema],

    daysOfMonth: [MonthlyDaySchema],

    specificDates: [SpecificDateSchema],

    startDate: { type: Date },
    endDate: { type: Date },
  },
  { _id: false }
);

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
      ref: "Subject",
      required: [true, "subjectId is required"],
    },

    studentIds: {
      type: [Schema.Types.ObjectId],
      ref: "Student",
      default: [],
    },

    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "Teacher",
    },
    schedules: [ScheduleSchema],
  },
  {
    timestamps: true,
  }
);

const Class = mongoose.model("Class", ClassSchema);

module.exports = Class;
