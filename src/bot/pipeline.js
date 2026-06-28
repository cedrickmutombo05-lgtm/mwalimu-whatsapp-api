
const { logError, logInfo } = require("../core/logger");
const { safeJsonParse, tronquerTexte } = require("../core");

const {
  pool,
  getUser,
  createUser,
  appendHistorique,
  logUnansweredQuestion
} = require("../db");

const {
  envoyerWhatsApp,
  envoyerIndicateurFrappe
} = require("../services/whatsapp");

const {
  typeMessage,
  messageTypeLisible
} = require("./detectors");

const {
  traiterCommande
} = require("./commands");

const {
  traiterIntentionsProfil
} = require("./intentions");

const {
  traiterTexte
} = require("./textProcessor");

const {
  traiterAudio
} = require("./audioProcessor");

const {
  traiterImage
} = require("./imageProcessor");

const {
  construireMessageFinal,
  messageSecours
} = require("./formatting.js");

function extraireHistorique(user = {}) {
  if (Array.isArray(user?.historique)) return user.historique;
  return safeJsonParse(user?.historique, []);
}

function extraireTexteMessage(msg = {}) {
  return String(msg?.text?.body || "").trim();
}

async function messageDejaTraite(messageId = "") {
  if (!messageId) return false;

  const { rows } = await pool.query(
    "SELECT msg_id FROM processed_messages WHERE msg_id = $1 LIMIT 1",
    [messageId]
  );

  return rows.length > 0;
}

async function marquerMessageTraite(messageId = "") {
  if (!messageId) return;

  await pool.query(
    "INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT (msg_id) DO NOTHING",
    [messageId]
  );
}

async function nettoyerAnciensMessagesTraites() {
  await pool.query(
    "DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '2 days'"
  );
}

async function traiterMessageEntrant(msg = {}) {
  const phone = msg?.from || "";
  const messageId = msg?.id || "";
  const msgType = typeMessage(msg);

  if (!phone) return;

  try {
    if (messageId && await messageDejaTraite(messageId)) {
      logInfo("message_duplicate_ignored", { messageId });
      return;
    }

    await marquerMessageTraite(messageId);
    await envoyerIndicateurFrappe(messageId);

    let user = await getUser(phone);

    if (!user) {
      user = await createUser(phone);
    }

    let historique = extraireHistorique(user);
    let questionUtilisateur = "";
    let resultat = {
      reponse: "",
      fiche: null,
      bypassFormat: false
    };

    if (msgType === "text") {
      questionUtilisateur = extraireTexteMessage(msg);

      if (!questionUtilisateur) {
        return;
      }

      historique = await appendHistorique(phone, "user", questionUtilisateur);

      const commande = await traiterCommande(user, questionUtilisateur);

      if (commande.handled) {
        resultat = {
          reponse: commande.reponse,
          fiche: null,
          bypassFormat: true
        };
      } else {
        const profil = await traiterIntentionsProfil(user, questionUtilisateur);

        if (profil.handled) {
          user = profil.user;

          resultat = {
            reponse: profil.reponse,
            fiche: null,
            bypassFormat: true
          };
        } else {
          resultat = await traiterTexte(user, questionUtilisateur, historique);
        }
      }
    } else if (msgType === "audio") {
      resultat = await traiterAudio(user, msg, historique);
      questionUtilisateur = resultat.transcription || "[audio]";
      historique = await appendHistorique(phone, "user", tronquerTexte(questionUtilisateur, 2500));
    } else if (msgType === "image") {
      questionUtilisateur = "[image]";
      historique = await appendHistorique(phone, "user", questionUtilisateur);
      resultat = await traiterImage(user, msg, historique);
    } else {
      questionUtilisateur = `[${msgType}]`;

      await logUnansweredQuestion(
        user,
        `Type de message non supporté : ${msgType}`,
        msgType,
        "unsupported_message_type"
      );

      resultat = {
        reponse: `J'ai bien reçu ${messageTypeLisible(msgType)}, mais ce type de message n'est pas encore pris en charge. Envoie-moi plutôt un texte, une image ou un audio.`,
        fiche: null,
        bypassFormat: true
      };
    }

    const reponseFinale = resultat.bypassFormat
      ? resultat.reponse
      : construireMessageFinal(
          user,
          resultat.reponse,
          historique,
          questionUtilisateur,
          resultat.fiche
        );

    await envoyerWhatsApp(phone, reponseFinale);
    await appendHistorique(phone, "assistant", reponseFinale);

    logInfo("message_processed", {
      phone,
      msgType,
      messageId
    });
  } catch (e) {
    logError("traiter_message_entrant", e, {
      phone,
      messageId,
      msgType
    });

    const user = await getUser(phone).catch(() => ({ phone }));

    await envoyerWhatsApp(
      phone,
      messageSecours(user || { phone }, msgType)
    );
  }
}

module.exports = {
  extraireHistorique,
  extraireTexteMessage,
  messageDejaTraite,
  marquerMessageTraite,
  nettoyerAnciensMessagesTraites,
  traiterMessageEntrant
};
