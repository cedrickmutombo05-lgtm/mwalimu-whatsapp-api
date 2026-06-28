
const cron = require("node-cron");

const { pool } = require("../db");
const { envoyerWhatsApp } = require("../services/whatsapp");
const { logError, logInfo } = require("../core/logger");
const { pick, premierPrenom, attendre } = require("../core");
const { HEADER_MWALIMU, CITATIONS } = require("../constants/messages");

function construireMessageRappelMatinal(user = {}) {
  const prenom = premierPrenom(user?.nom || "");

  return `${HEADER_MWALIMU}
────────────────
Bonjour **${prenom}** ☀️

C'est une nouvelle journée pour apprendre un peu mieux.

Aujourd'hui, tu peux m'envoyer :
- une question ;
- un exercice ;
- une image ;
- un audio ;
- une notion que tu veux comprendre.

${pick(CITATIONS.general)}
👉 Avançons ensemble, pas à pas.`;
}

async function envoyerRappelsMatinaux() {
  try {
    const { rows } = await pool.query(
      `SELECT phone, nom, classe, reve 
       FROM conversations 
       WHERE reminders_enabled = TRUE 
       ORDER BY updated_at DESC 
       LIMIT 500`
    );

    for (const user of rows) {
      if (!user.phone) continue;

      await envoyerWhatsApp(user.phone, construireMessageRappelMatinal(user));
      await attendre(250);
    }

    logInfo("morning_reminders_sent", {
      count: rows.length
    });
  } catch (e) {
    logError("morning_reminders", e);
  }
}

function demarrerRappelMatinal() {
  cron.schedule(
    "0 7 * * *",
    envoyerRappelsMatinaux,
    {
      timezone: "Africa/Lubumbashi"
    }
  );

  logInfo("morning_reminder_job_started");
}

module.exports = {
  construireMessageRappelMatinal,
  envoyerRappelsMatinaux,
  demarrerRappelMatinal
};
