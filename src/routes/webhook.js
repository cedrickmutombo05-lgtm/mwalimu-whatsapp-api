
const express = require("express");
const crypto = require("crypto");

const { env } = require("../config/env");
const { logError, logWarn, logInfo } = require("../core/logger");
const { traiterMessageEntrant } = require("../bot/pipeline.js");

const router = express.Router();

function verifierSignatureMeta(req) {
  const signature = req.headers["x-hub-signature-256"];

  if (!signature || !req.rawBody) {
    return true;
  }

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", env.APP_SECRET)
      .update(req.rawBody)
      .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.VERIFY_TOKEN) {
    logInfo("webhook_verified");
    return res.status(200).send(challenge);
  }

  logWarn("webhook_verification_failed", { mode, token });
  return res.sendStatus(403);
});

router.post("/", async (req, res) => {
  try {
    if (!verifierSignatureMeta(req)) {
      logWarn("invalid_meta_signature");
      return res.sendStatus(403);
    }

    res.sendStatus(200);

    const body = req.body || {};
    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value || {};
        const messages = value.messages || [];

        for (const msg of messages) {
          await traiterMessageEntrant(msg);
        }
      }
    }
  } catch (e) {
    logError("webhook_post", e);
  }
});

module.exports = router;
