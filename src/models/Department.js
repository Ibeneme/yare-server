const mongoose = require("mongoose");

const DepartmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    courseIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Course",
      },
    ],
    isSuspended: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Department = mongoose.model("Department", DepartmentSchema);

module.exports = Department;
