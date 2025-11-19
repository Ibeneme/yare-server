const cron = require("node-cron");
const LessonFee = require("../models/LessonFee");
const Student = require("../models/Student");

const getDurationDays = (duration) => {
  const num = parseInt(duration);
  return isNaN(num) ? 0 : num;
};

const runSubscriptionExpiryCheck = () => {
  cron.schedule("0 0 * * *", async () => {
    console.log("⏰ Running subscription expiry check...");

    const today = new Date();
    const paidSubscriptions = await LessonFee.find({ "paid.isPaid": true });

    for (const sub of paidSubscriptions) {
      const startDate = sub.paid.timestamp;
      const durationDays = getDurationDays(sub.duration);

      if (!startDate || durationDays <= 0) continue;

      const expiryDate = new Date(startDate);
      expiryDate.setDate(expiryDate.getDate() + durationDays);

      if (today >= expiryDate) {
        console.log(`⚠️ Subscription expired for lessonFee: ${sub._id}`);
        sub.paid.isPaid = false;
        sub.expired = true;
        await sub.save();

        // 2️⃣ Find the student and disable isSubscribed
        if (sub.studentId) {
          const student = await Student.findById(sub.studentId);

          if (student) {
            student.isSubscribed = false;
            student.isPaid = false;
            student.lessonFeeId = null;
            await student.save();

            console.log(
              `🚫 Student ${student._id} subscription toggled to FALSE`
            );
          } else {
            console.log(`⚠️ No student found for studentId: ${sub.studentId}`);
          }
        } else {
          console.log("⚠️ No studentId in this LessonFee record.");
        }
      }
    }

    console.log("✅ Subscription expiry check completed.");
  });
};

module.exports = runSubscriptionExpiryCheck;
