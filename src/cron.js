

// =========================================================
// CRON – TÂCHES PLANIFIÉES MWALIMU
// =========================================================

const cron = require("node-cron");
const { pool, cleanOldProcessed } = require("./db");
const { envoyerWhatsApp } = require("./whatsapp");
const { pick, attendre, logInfo, logError } = require("./utils");
const { HEADER_MWALIMU, CITATIONS } = require("./constants");

function construireMessageRappel(nom = "") {
  const prenom = String(nom || "").trim().split(" ")[0] || "élève";

  return `${HEADER_MWALIMU}
────────────────
Bonjour **${prenom}** ☀️

Petit rappel du matin :
Prends quelques minutes aujourd'hui pour apprendre, réviser ou poser une question.

${pick(CITATIONS.general)}`;
}

function demarrerCron() {
  cron.schedule("0 7 * * *", async () => {
    try {
      logInfo("cron_morning_reminder_start");

      const { rows } = await pool.query(`
        SELECT phone, nom
        FROM conversations
        WHERE COALESCE(phone, '') <> ''
          AND COALESCE(reminders_enabled, TRUE) = TRUE
      `);

      for (const eleve of rows) {
        try {
          const message = construireMessageRappel(eleve.nom);
          await envoyerWhatsApp(eleve.phone, message);
          await attendre(800);
        } catch (e) {
          logError("cron_morning_reminder_user", e, {
            phone: eleve?.phone || ""
          });
        }
      }

      logInfo("cron_morning_reminder_done", { count: rows.length });
    } catch (e) {
      logError("cron_morning_reminder", e);
    }
  }, { timezone: "Africa/Lubumbashi" });

  cron.schedule("0 3 * * *", async () => {
    try {
      await cleanOldProcessed();
      logInfo("cron_cleanup_processed_messages_done");
    } catch (e) {
      logError("cron_cleanup_processed_messages", e);
    }
  }, { timezone: "Africa/Lubumbashi" });

  logInfo("cron_started");
}

module.exports = {
  demarrerCron,
  construireMessageRappel
};
