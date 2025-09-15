const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const { Schema } = mongoose;

const TeacherSchema = new Schema(
  {
    // Identity
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: String,

    // Relationships
    courseIds: [{ type: Schema.Types.ObjectId, ref: "Course" }],
    classIds: [{ type: String }], // could be ObjectId if classes are separate model
    gradeIds: [{ type: Schema.Types.ObjectId, ref: "Grade" }],

    // Roles & Metadata
    userType: {
      type: String,
      enum: ["teacher", "admin", "superadmin"],
      default: "teacher",
      index: true,
    },
    certifications: [{ type: String }],
    skills: [{ type: String }],
    languages: [{ type: String }],
    educationBackground: { type: String },

    // Status
    isSuspended: { type: Boolean, default: false },
    inClass: { type: Boolean, default: false },
    reported: { type: Boolean, default: false },

    // Reporting
    reports: [
      {
        reporterUserType: {
          type: String,
          enum: ["student", "parent", "admin", "teacher"],
          required: true,
        },
        reporterId: {
          type: Schema.Types.ObjectId,
          required: true,
          refPath: "reports.reporterUserType",
        },
        reportText: { type: String, required: true },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// 🔐 Hash password before saving
TeacherSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 🔍 Compare password method
TeacherSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Teacher", TeacherSchema);