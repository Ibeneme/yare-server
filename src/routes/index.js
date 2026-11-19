const express = require("express");
const router = express.Router();

// ── Existing endpoints (URLs unchanged so the current frontend keeps working) ──
router.use("/api/admin", require("./admin.routes"));
router.use("/api/admin-parent", require("./parent.routes"));
router.use("/api/departments", require("./department.routes"));
router.use("/api/courses", require("./course.routes"));
router.use("/api/users", require("./user.routes"));
router.use("/api/admin-classes", require("./adminClass.routes"));
router.use("/api/grading/grades-grading", require("./adminGrade.routes"));
router.use("/api/admin/resource", require("./resource.routes"));
router.use("/api/admin/yare/settings", require("./settings.routes"));
router.use("/api/payment/yare/pay", require("./payment.routes"));
router.use("/api/awards-for-student/awarding", require("./award.routes"));
router.use("/api/subject", require("./subject.routes"));
router.use("/api/grades/grades", require("./grade.routes"));
router.use("/api/class/class", require("./class.routes"));
router.use("/api/accounts", require("./account.routes"));
router.use("/api/notifications", require("./notification.routes"));

// ── New in this version ──
router.use("/api/super-admin", require("./superAdmin.routes"));
router.use("/api/pricing", require("./pricing.routes"));
router.use("/api/transactions", require("./transaction.routes"));
router.use("/api/wards", require("./ward.routes"));
router.use("/api/groups", require("./studentGroup.routes"));
router.use("/api/tasks", require("./task.routes"));
router.use("/api/access", require("./access.routes"));
router.use("/api/announcements", require("./announcement.routes"));
router.use("/api/platform-settings", require("./platformSettings.routes"));
router.use("/api/awards", require("./awards.routes"));
router.use("/api/classroom", require("./classroom.routes"));


module.exports = router;
