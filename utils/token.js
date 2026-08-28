// utils/token.js
const jwt = require("jsonwebtoken");

/**
 * Generates a signed JWT token with user ID and userType.
 * @param {string} id - User ID or unique identifier to encode.
 * @param {string} userType - The type of user (e.g., 'admin', 'teacher', 'student').
 * @param {string} [expiresIn] - Optional custom expiration time.
 * @returns {string} - Signed JWT token.
 */
const generateToken = (id, userType, expiresIn) => {
  if (!process.env.JWT_SECRET) {
    console.error("❌ JWT_SECRET is not defined in environment variables!");
    throw new Error("Server configuration error: JWT_SECRET is missing.");
  }

  // Define custom token expiration rules based on userType if not explicitly passed
  if (!expiresIn) {
    switch (userType?.toLowerCase()) {
      case "admin":
      case "superadmin":
        expiresIn = "8h"; // Shorter lifespan for high-privilege accounts
        break;
      case "teacher":
        expiresIn = "12h";
        break;
      case "parent":
      case "student":
        expiresIn = "7d"; // Longer lifespan for convenience on client apps
        break;
      default:
        expiresIn = "24h"; // Default fallback
    }
  }

  return jwt.sign({ id, userType }, process.env.JWT_SECRET, { expiresIn });
};

/**
 * Verifies and decodes a JWT token.
 * @param {string} token - The token to verify.
 * @returns {{ id: string, userType: string }} - Decoded payload.
 * @throws {Error} - If token is invalid or expired.
 */
const verifyToken = (token) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("Server configuration error: JWT_SECRET is missing.");
  }

  return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = {
  generateToken,
  verifyToken,
};
