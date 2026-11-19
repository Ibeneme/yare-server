const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const wrap = require("../middlewares/asyncHandler");
const c = require("../controllers/platformSettings.controller");

router.use(auth, auth.requireRoles("admin"));
router.get("/", wrap(c.getAll));
router.put("/trial", wrap(c.updateTrial)); // { enabled: true, days: 7 | 14 | 28 | 42 | any }

module.exports = router;
