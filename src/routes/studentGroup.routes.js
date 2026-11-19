const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const wrap = require("../middlewares/asyncHandler");
const c = require("../controllers/studentGroup.controller");

router.use(auth, auth.requireRoles("admin"));
router.get("/", wrap(c.list));
router.post("/", wrap(c.create));
router.put("/:id", wrap(c.update));
router.delete("/:id", wrap(c.remove));

module.exports = router;
