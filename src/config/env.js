const dotenv = require("dotenv");
dotenv.config();

// Class times are calculated in server-local time, so pin it explicitly.
process.env.TZ = process.env.TZ || "Africa/Lagos";

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT) || 5001,
  DB_MODE: process.env.DB_MODE || "memory", // "memory" (default, no database) or "mongo"
  MONGO_URI: process.env.MONGO_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
  CORS_ORIGINS: (process.env.CORS_ORIGINS || "*").split(",").map((s) => s.trim()),
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
  SUPER_ADMIN_EMAIL: "ikennaibenemee@gmail.com",
  SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD || "Testing1234@", // the only account on a clean start
  SOCKET_REQUIRE_AUTH: process.env.SOCKET_REQUIRE_AUTH !== "false",
};
