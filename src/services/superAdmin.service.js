const mongoose = require("mongoose");
const Admin = require("../models/Admin");
const Teacher = require("../models/Teacher");
const sendEmail = require("./mail.service");

/**
 * Hands Super Admin status to a Teacher.
 *  - The teacher gets an Admin document with role "superadmin" (reusing their existing
 *    password hash, so they sign in with the same credentials on the admin portal).
 *  - The current Super Admin is demoted to a regular admin.
 * Done in a transaction-like order so there is never zero or two Super Admins at rest.
 */
const transferSuperAdmin = async ({ currentSuperAdminId, teacherId }) => {
  if (!mongoose.Types.ObjectId.isValid(teacherId)) {
    const e = new Error("Invalid teacher id");
    e.status = 400;
    throw e;
  }
  const [current, teacher] = await Promise.all([
    Admin.findById(currentSuperAdminId),
    Teacher.findById(teacherId),
  ]);
  if (!current || current.role !== "superadmin") {
    const e = new Error("Only the current Super Admin can transfer the role");
    e.status = 403;
    throw e;
  }
  if (!teacher) {
    const e = new Error("Teacher not found");
    e.status = 404;
    throw e;
  }
  if (!teacher.password) {
    const e = new Error("Teacher has no password set yet; ask them to set one first");
    e.status = 409;
    throw e;
  }

  const email = teacher.email.toLowerCase();
  let target = await Admin.findOne({ email });

  if (target) {
    target.role = "superadmin";
    target.superadmin = true;
    target.isSuspended = false;
    target.isDeleted = false;
    await target.save();
  } else {
    // insert directly: the password on the teacher is already hashed
    const doc = {
      email,
      password: teacher.password,
      role: "superadmin",
      superadmin: true,
      userType: "admin",
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      isSuspended: false,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const res = await Admin.collection.insertOne(doc);
    target = await Admin.findById(res.insertedId);
  }

  current.role = "admin";
  current.superadmin = false;
  await current.save();

  try {
    await sendEmail(
      email,
      "You are now the Yare Super Admin",
      `<p>Hello ${teacher.firstName},</p><p>You have been made Super Admin. Sign in on the admin portal with your usual email and password.</p>`
    );
  } catch (_) {
    /* non-fatal */
  }
  return { newSuperAdmin: target, previousSuperAdmin: current };
};

module.exports = { transferSuperAdmin };
