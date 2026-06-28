
const express = require("express");

const { pool } = require("../db");
const { logError } = require("../core/logger");

const router = express.Router();

router.get("/", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.status(200).json({
      status: "ok",
      service: "Mwalimu EdTech",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    logError("health_check", e);

    return res.status(503).json({
      status: "error",
      service: "Mwalimu EdTech",
      database: "disconnected",
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
