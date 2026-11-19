const { verifyToken } = require("../services/token.service");
const Student = require("../models/Student");
const { getAccessState } = require("../services/access.service");

// Student-originated writes are blocked in read-only mode, except these (profile, inbox).
const ALLOWED_PREFIXES = ["/api/users", "/api/notifications", "/api/accounts", "/api/access"];
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Global guard. Anything that is not a student is untouched. The refusal text is neutral on
 * purpose: it must not tell the child that fees are the reason.
 */
const studentReadOnlyGuard = async (req, res, next) => {
  try {
    if (SAFE.has(req.method)) return next();
    if (ALLOWED_PREFIXES.some((p) => req.path.startsWith(p))) return next();
    const h = req.headers.authorization;
    if (!h || !h.startsWith("Bearer ")) return next();
    let decoded;
    try {
      decoded = verifyToken(h.split(" ")[1]);
    } catch {
      return next(); // real auth handles bad tokens
    }
    if (decoded.userType !== "student") return next();
    const student = await Student.findById(decoded.id)
      .select("isSubscribed isPaid subscriptionExpiredAt expiryGraceEndsAt adminGraceUntil trialEndsAt")
      .lean();
    if (student && getAccessState(student).mode === "read_only") {
      return res.status(403).json({
        success: false,
        readOnly: true,
        message: "This action isn't available on your account right now.",
      });
    }
    next();
  } catch (e) {
    next(e);
  }
};

module.exports = { studentReadOnlyGuard };
