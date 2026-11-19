const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const wrap = require("../middlewares/asyncHandler");
const c = require("../controllers/classroom.controller");

router.use(auth);
router.get("/my-classes", wrap(c.myClasses));
router.get("/:classId/access", wrap(c.access));
router.get("/:classId/assignments", wrap(c.listAssignments));
router.post("/:classId/assignments", wrap(c.createAssignment));
router.get("/:classId/notes", wrap(c.getNotes));

module.exports = router;
