const crypto = require("crypto");
const Admin = require("../models/Admin");
const sendEmail = require("./mail.service");
const { SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD } = require("../config/env");

/**
 * Ensures a Super Admin exists. Runs on every boot but only creates one when
 * none exists, so a transfer to another person is never undone by a restart.
 */
const seedSuperAdmin = async () => {
  const existing = await Admin.findOne({ role: "superadmin", isDeleted: { $ne: true } });
  if (existing) return existing;

  // If the seed address exists as a normal admin (e.g. after a manual DB edit), promote it.
  const byEmail = await Admin.findOne({ email: SUPER_ADMIN_EMAIL });
  if (byEmail) {
    byEmail.role = "superadmin";
    byEmail.superadmin = true;
    byEmail.isDeleted = false;
    byEmail.isSuspended = false;
    await byEmail.save();
    console.log("Promoted", SUPER_ADMIN_EMAIL, "to Super Admin");
    return byEmail;
  }

  const password = SUPER_ADMIN_PASSWORD;
  const admin = await Admin.create({
    email: SUPER_ADMIN_EMAIL,
    password,
    role: "superadmin",
    superadmin: true,
    userType: "admin",
    firstName: "Super",
    lastName: "Admin",
  });
  console.log("Seeded Super Admin account:", SUPER_ADMIN_EMAIL);

  if (!SUPER_ADMIN_PASSWORD) {
    // The generated password is emailed, never logged.
    try {
      await sendEmail(
        SUPER_ADMIN_EMAIL,
        "Your Yare Super Admin account",
        `<p>A Super Admin account was created for this address.</p><p>Temporary password: <strong>${password}</strong></p><p>Please sign in and change it straight away.</p>`
      );
    } catch (err) {
      console.error(
        "Could not email the Super Admin password. Set SUPER_ADMIN_PASSWORD or use 'forgot password'.",
        err.message
      );
    }
  }
  return admin;
};

module.exports = { seedSuperAdmin };
