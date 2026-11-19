const { verifyToken } = require("../services/token.service");

/**
 * Verifies the Bearer token and sets req.user = { id, userType, role }.
 * Super Admins carry userType "admin" (so every admin-only check passes)
 * plus role "superadmin" for the checks that are Super-Admin-only.
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Authorization token missing or malformed" });
  }
  try {
    const decoded = verifyToken(authHeader.split(" ")[1]);
    req.user = {
      id: decoded.id,
      userType: decoded.userType,
      role: decoded.role || decoded.userType,
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

/** Use after authMiddleware. Allowed: "superadmin" | "admin" | "teacher" | "student" | "parent". */
authMiddleware.requireRoles =
  (...allowed) =>
  (req, res, next) => {
    const role = req.user?.role;
    const ok =
      allowed.includes(role) ||
      (role === "superadmin" && allowed.includes("admin"));
    if (!ok) {
      return res.status(403).json({ error: "You do not have permission to do this" });
    }
    next();
  };

module.exports = authMiddleware;
