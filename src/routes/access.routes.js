const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const wrap = require("../middlewares/asyncHandler");
const c = require("../controllers/access.controller");

router.use(auth);
router.get("/me", auth.requireRoles("student"), wrap(c.myAccess)); // neutral, no fee wording
router.get("/wards", auth.requireRoles("parent"), wrap(c.wardAccess)); // parent's real view
router.get("/students", auth.requireRoles("admin"), wrap(c.listStudents));
router.post("/students/:id/grace", auth.requireRoles("admin"), wrap(c.grantGrace)); // { duration: "3d"|"1w"|"4w"|"3m", note }
router.delete("/students/:id/grace", auth.requireRoles("admin"), wrap(c.revokeGrace));

module.exports = router;
