const { verifyToken } = require("../utils/token");

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Authorization token missing or malformed" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);

    console.log("✅ Decoded token:", decoded);

    // Attach user info including userType to request
    req.user = {
      id: decoded.id,
      userType: decoded.userType,
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

module.exports = authMiddleware;