const Admin = require("../models/Admin");
const jwt = require("jsonwebtoken");
const sendEmail = require("../utils/mailer");

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

const registerAdmin = async (req, res) => {
  const { email, password, role } = req.body;

  console.log(email, password, role);
  try {
    const existing = await Admin.findOne({ email });
    if (existing)
      return res.status(400).json({ message: "Admin already exists" });

    const admin = await Admin.create({ email, password, role });
    await sendEmail(
      email,
      "Welcome to Yare",
      "Your admin account has been created."
    );

    res.status(201).json({
      _id: admin._id,
      email: admin.email,
      role: admin.role,
      token: generateToken(admin._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const loginAdmin = async (req, res) => {
  const { email, password } = req.body;
  try {
    const admin = await Admin.findOne({ email });
    if (admin && (await admin.matchPassword(password))) {
      return res.json({
        _id: admin._id,
        email: admin.email,
        role: admin.role,
        token: generateToken(admin._id),
      });
    }
    res.status(401).json({ message: "Invalid email or password" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { registerAdmin, loginAdmin };
