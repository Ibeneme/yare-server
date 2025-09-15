const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const parentSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: { type: String, unique: true },
  phoneNumber: String,
  password: String,
  isSuspended: { type: Boolean, default: false },
  reported: { type: Boolean, default: false },
  children: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  userType: {
    type: String,
  },
});

parentSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

parentSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("Parent", parentSchema);
