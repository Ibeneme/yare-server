// models/Admin.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    userType: {
      type: String,
    },
    role: {
      type: String,
      enum: ["superadmin", "admin"],
      default: "admin",
    },
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    isSuspended: {
      type: Boolean,
      default: false,
    },
    superadmin: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
  },
  { timestamps: true }
);

// Hash password before save
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

adminSchema.methods.matchPassword = function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Admin", adminSchema);
