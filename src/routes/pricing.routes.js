const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const wrap = require("../middlewares/asyncHandler");
const c = require("../controllers/pricing.controller");

const admin = [auth, auth.requireRoles("admin")];

router.get("/", auth, wrap(c.list)); // any signed-in user can see active prices
router.post("/", ...admin, wrap(c.upsert));
router.put("/:id", ...admin, wrap(c.update));
router.delete("/:id", ...admin, wrap(c.remove));

module.exports = router;
