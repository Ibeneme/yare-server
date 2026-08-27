const mongoose = require("mongoose");
const initClassReminderCron = require("../cron/initClassReminderCron"); // Adjust path to where your file is saved

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    initClassReminderCron();
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.error("❌ MongoDB Connection Failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
