const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const wrap = require("../middlewares/asyncHandler");
const c = require("../controllers/ward.controller");

router.use(auth, auth.requireRoles("parent"));
router.get("/catalogue", wrap(c.catalogue));
router.get("/", wrap(c.listWards));
router.post("/", wrap(c.addWard));
router.put("/:id", wrap(c.updateWard));
router.delete("/:id", wrap(c.removeWard));

module.exports = router;
