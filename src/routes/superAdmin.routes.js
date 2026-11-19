const router = require("express").Router();
const { protect, superAdminOnly } = require("../middlewares/adminAuth.middleware");
const wrap = require("../middlewares/asyncHandler");
const c = require("../controllers/superAdmin.controller");

router.use(protect, superAdminOnly);

// Create admins / super admins: POST /api/admin/add-admin (same guard); listed here for management.
router.post("/admins", wrap(c.createAdmin));
router.get("/admins", wrap(c.listAdmins));
router.patch("/admins/:id/suspend", wrap(c.setSuspended));
router.delete("/admins/:id", wrap(c.removeAdmin));
router.get("/transfer/candidates", wrap(c.eligibleTeachers));
router.post("/transfer", wrap(c.transfer));

module.exports = router;
