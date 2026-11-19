const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const wrap = require("../middlewares/asyncHandler");
const c = require("../controllers/task.controller");

const staff = auth.requireRoles("teacher", "admin");
const admin = auth.requireRoles("admin");

router.use(auth);
router.get("/mine", staff, wrap(c.myBoard)); // teacher task board
router.post("/", staff, wrap(c.createOwn)); // add a personal task
router.post("/assign", admin, wrap(c.assign)); // admin assigns work
router.get("/", admin, wrap(c.tracker)); // admin tracker
router.patch("/:id", staff, wrap(c.update));
router.delete("/:id", staff, wrap(c.remove));

module.exports = router;
