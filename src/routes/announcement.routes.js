const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const wrap = require("../middlewares/asyncHandler");
const c = require("../controllers/announcement.controller");

const admin = [auth, auth.requireRoles("admin")];

router.get("/public", wrap(c.publicStatus)); // login page banner / maintenance notice
router.get("/mine", auth, wrap(c.mine)); // banners + announcements for the signed-in role
router.get("/", ...admin, wrap(c.list)); // announcements tab (?kind=banner|maintenance|announcement)
router.post("/", ...admin, wrap(c.create));
router.put("/:id", ...admin, wrap(c.update));
router.patch("/:id/toggle", ...admin, wrap(c.toggle));
router.delete("/:id", ...admin, wrap(c.remove));

module.exports = router;
