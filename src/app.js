const express = require("express");
const cors = require("cors");
const { CORS_ORIGINS } = require("./config/env");
const routes = require("./routes");
const { paystackWebhook } = require("./controllers/payment.controller");
const { notFound, errorHandler } = require("./middlewares/errorHandler");
const { studentReadOnlyGuard } = require("./middlewares/studentAccess.middleware");
const { maintenanceGate } = require("./middlewares/maintenance.middleware");
const { rooms } = require("./sockets/roomState");

const createApp = () => {
  const app = express();

const corsOptions = {
    origin: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
  };

  app.use(cors(corsOptions));
  app.options("/{*splat}", cors(corsOptions)); // or remove this line since app.use(cors(...)) already handles OPTIONS

  
  // Keep the raw bytes: Paystack signs the exact body, so the webhook must hash those, not re-serialised JSON.
  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));

  // Paystack webhook (set this URL in the Paystack dashboard)
  app.post("/api/payment/webhook/paystack", paystackWebhook);

  app.get("/health", (req, res) => res.json({ ok: true, rooms: Object.keys(rooms).length }));
  app.use(maintenanceGate); // blocking maintenance window: admins only
  app.use(studentReadOnlyGuard); // view-only students cannot write (neutral message)
  app.use(routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
};

module.exports = { createApp };