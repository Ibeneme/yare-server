const { verifyToken } = require("../services/token.service");
const { getBlockingMaintenance } = require("../services/announcement.service");

// Always reachable, even in maintenance: banners, health, admin sign-in, Paystack's webhook.
const OPEN = ["/health", "/api/announcements", "/api/admin/login", "/api/payment/webhook"];

/** While a blocking maintenance window is active only admins get through. */
const maintenanceGate = async (req, res, next) => {
  try {
    if (OPEN.some((p) => req.path.startsWith(p))) return next();
    const m = await getBlockingMaintenance();
    if (!m) return next();
    const h = req.headers.authorization;
    if (h?.startsWith("Bearer ")) {
      try {
        if (verifyToken(h.split(" ")[1]).userType === "admin") return next();
      } catch (_) {}
    }
    return res.status(503).json({
      success: false,
      maintenance: true,
      title: m.title,
      message: m.body || "We're doing some maintenance. Please check back shortly.",
      endsAt: m.endsAt,
    });
  } catch (e) {
    next(); // never take the API down because the gate failed
  }
};

module.exports = { maintenanceGate };
