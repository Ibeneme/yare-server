const { startClassReminderJob } = require("./classReminder.job");
const { startSubscriptionExpiryJob } = require("./subscriptionExpiry.job");

const startJobs = () => {
  startClassReminderJob();
  startSubscriptionExpiryJob();
};

module.exports = { startJobs };
