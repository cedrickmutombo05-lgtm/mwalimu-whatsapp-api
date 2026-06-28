

const express = require("express");
const rateLimit = require("express-rate-limit");

const { env } = require("./src/config/env");
const { initDB } = require("./src/db");
const { logInfo, logError } = require("./src/core/logger");

const webhookRoutes = require("./src/routes/webhook.js");
const healthRoutes = require("./src/routes/health.js");

const { demarrerRappelMatinal } = require("./src/jobs/morningReminder");
const { demarrerNettoyage } = require("./src/jobs/cleanup");

const app = express();

app.set("trust proxy", 1);

app.use(express.json({
  limit: "2mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(limiter);

app.get("/", (_req, res) => {
  res.status(200).send("Mwalimu EdTech est en ligne ✅");
});

app.use("/webhook", webhookRoutes);
app.use("/health", healthRoutes);

app.use((_req, res) => {
  res.status(404).json({
    status: "not_found",
    message: "Route introuvable"
  });
});

async function startServer() {
  try {
    await initDB();

    demarrerRappelMatinal();
    demarrerNettoyage();

    app.listen(env.PORT, () => {
      logInfo("server_started", {
        port: env.PORT
      });

      console.log(`Mwalimu EdTech lancé sur le port ${env.PORT}`);
    });
  } catch (e) {
    logError("server_start_failed", e);
    process.exit(1);
  }
}

startServer();

module.exports = app;
