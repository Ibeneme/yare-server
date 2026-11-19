const http = require("http");
const env = require("./config/env"); // loads .env and sets TZ first
const connectDB = require("./config/db");
const { createApp } = require("./app");
const { initSockets } = require("./sockets");
const { startJobs } = require("./jobs");
const { seedSuperAdmin } = require("./services/seed.service");

const start = async () => {
  if (!env.JWT_SECRET) {
    console.error("JWT_SECRET is not set");
    process.exit(1);
  }
  await connectDB();
  await seedSuperAdmin();

  const app = createApp();
  const server = http.createServer(app);
  app.set("io", initSockets(server));
  startJobs();

  server.listen(env.PORT, () => console.log(`Yare server listening on :${env.PORT}`));

  const shutdown = () => server.close(async () => { await connectDB.stopDB(); process.exit(0); });
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
};

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
