const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

const protect = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.admin = await Admin.findById(decoded.id).select("-password");
      next();
    } catch (err) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
  } else {
    return res.status(401).json({ success: false, message: "No token" });
  }
};

const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.admin.role)) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied: insufficient role" });
    }
    next();
  };
};

module.exports = { protect, authorizeRoles };
