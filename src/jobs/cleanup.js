
const cron = require("node-cron");

const { pool } = require("../db");
const { logError, logInfo } = require("../core/logger");
const { nettoyerAnciensMessagesTraites } = require("../bot/pipeline");

async function nettoyerAnciennesDonnees() {
  try {
    await nettoyerAnciensMessagesTraites();

    await pool.query(
      "DELETE FROM student_attempts WHERE updated_at < NOW() - INTERVAL '7 days'"
    );

    await pool.query(
      "DELETE FROM unanswered_questions WHERE created_at < NOW() - INTERVAL '90 days'"
    );

    logInfo("cleanup_done");
  } catch (e) {
    logError("cleanup_job", e);
  }
}

function demarrerNettoyage() {
  cron.schedule(
    "30 3 * * *",
    nettoyerAnciennesDonnees,
    {
      timezone: "Africa/Lubumbashi"
    }
  );

  logInfo("cleanup_job_started");
}

module.exports = {
  nettoyerAnciennesDonnees,
  demarrerNettoyage
};
