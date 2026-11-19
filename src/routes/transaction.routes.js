const router = require("express").Router();
const auth = require("../middlewares/auth.middleware");
const asyncHandler = require("../middlewares/asyncHandler");
const c = require("../controllers/transaction.controller");

router.get("/mine", auth, auth.requireRoles("parent"), asyncHandler(c.myTransactions));
router.get("/", auth, auth.requireRoles("admin"), asyncHandler(c.allTransactions));
router.get("/:id", auth, auth.requireRoles("admin", "parent"), asyncHandler(c.getTransaction));

module.exports = router;
