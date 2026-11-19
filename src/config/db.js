const mongoose = require("mongoose");
const { MONGO_URI } = require("./env");

/**
 * Connects directly to MongoDB using MONGO_URI so data persists in the database
 * across server restarts without storing database files on disk.
 */
const connectDB = async () => {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is required to connect to the database");
    }

    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

const stopDB = async () => {
  await mongoose.disconnect().catch(() => {});
};

module.exports = connectDB;
module.exports.stopDB = stopDB;