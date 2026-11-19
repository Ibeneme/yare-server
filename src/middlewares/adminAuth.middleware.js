const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

/** Loads the Admin document into req.admin. */
const protect = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "No token" });
  }
  try {
    const decoded = jwt.verify(header.split(" ")[1], process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin || admin.isSuspended || admin.isDeleted) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    req.admin = admin;
    req.user = { id: String(admin._id), userType: "admin", role: admin.role };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
};

const authorizeRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.admin?.role)) {
    return res
      .status(403)
      .json({ success: false, message: "Access denied: insufficient role" });
  }
  next();
};

const superAdminOnly = authorizeRoles("superadmin");
const adminOrSuperAdmin = authorizeRoles("admin", "superadmin");

module.exports = { protect, authorizeRoles, superAdminOnly, adminOrSuperAdmin };
