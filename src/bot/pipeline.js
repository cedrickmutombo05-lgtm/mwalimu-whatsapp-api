

const db = require("../db");
const whatsapp = require("../services/whatsapp");

const { logInfo, logError } = require("../core/logger");

const { traiterTexte } = require("./textProcessor");
const { traiterCommande } = require("./commands");
const { traiterIntentionsProfil } = require("./intentions");

let formatting = {};
try {
  formatting = require("./formatting");
} catch (_) {
  formatting = {};
}

let audioProcessor = {};
try {
  audioProcessor = require("./audioProcessor");
} catch (_) {
  audioProcessor = {};
}

let imageProcessor = {};
try {
  imageProcessor = require("./imageProcessor");
} catch (_) {
  imageProcessor = {};
}

function extrairePhone(msg = {}) {
  return (
    msg.from ||
    msg.phone ||
    msg.sender ||
    msg?.contacts?.[0]?.wa_id ||
    msg?.messages?.[0]?.from ||
    ""
  );
}

function extraireTypeMessage(msg = {}) {
  return (
    msg.type ||
    msg.msgType ||
    msg.message_type ||
    msg?.messages?.[0]?.type ||
    "text"
  );
}

function extraireTexteMessage(msg = {}) {
  return (
    msg?.text?.body ||
    msg?.body ||
    msg?.message ||
    msg?.text ||
    msg?.messages?.[0]?.text?.body ||
    ""
  ).trim();
}

function extraireMediaId(msg = {}) {
  const type = extraireTypeMessage(msg);
  return (
    msg?.[type]?.id ||
    msg?.audio?.id ||
    msg?.image?.id ||
    msg?.document?.id ||
    msg?.messages?.[0]?.[type]?.id ||
    ""
  );
}

async function appelerFonction(moduleObj, noms = [], ...args) {
  for (const nom of noms) {
    const fn = moduleObj?.[nom];

    if (typeof fn !== "function") continue;

    try {
      return await fn(...args);
    } catch (err) {
      throw err;
    }
  }

  return null;
}

async function chargerUtilisateur(phone = "") {
  if (!phone) {
    return { phone };
  }

  const noms = [
    "getOrCreateUser",
    "getOrCreateUtilisateur",
    "findOrCreateUser",
    "findOrCreateUtilisateur",
    "getUserByPhone",
    "getUtilisateurByPhone",
    "getUser",
    "getUtilisateur"
  ];

  for (const nom of noms) {
    const fn = db?.[nom];

    if (typeof fn !== "function") continue;

    try {
      const user = await fn(phone);

      if (user) {
        return {
          ...user,
          phone: user.phone || user.telephone || user.numero || phone
        };
      }
    } catch (_) {
      // On essaie une autre fonction disponible.
    }
  }

  return { phone };
}

async function getHistoriqueSafe(phone = "") {
  const noms = [
    "getHistorique",
    "getHistory",
    "getConversationHistory",
    "getRecentHistory",
    "lireHistorique"
  ];

  for (const nom of noms) {
    const fn = db?.[nom];

    if (typeof fn !== "function") continue;

    try {
      const historique = await fn(phone);
      return Array.isArray(historique) ? historique : [];
    } catch (_) {
      // On continue.
    }
  }

  return [];
}

async function appendHistoriqueSafe(phone = "", role = "", content = "") {
  const noms = [
    "appendHistorique",
    "appendHistory",
    "addHistorique",
    "addHistory",
    "saveMessageHistory",
    "ajouterHistorique"
  ];

  for (const nom of noms) {
    const fn = db?.[nom];

    if (typeof fn !== "function") continue;

    try {
      const historique = await fn(phone, role, content);

      if (Array.isArray(historique)) {
        return historique;
      }

      return await getHistoriqueSafe(phone);
    } catch (_) {
      // On continue.
    }
  }

  return await getHistoriqueSafe(phone);
}

function extraireReponseDepuisResultat(result = {}) {
  if (!result) return "";

  if (typeof result === "string") {
    return result;
  }

  return (
    result.reponse ||
    result.response ||
    result.message ||
    result.text ||
    ""
  );
}

function resultatSimple(reponse = "") {
  return {
    reponse,
    fiche: null,
    bypassFormat: true
  };
}

async function formaterReponseSiNecessaire(result = {}, user = {}, question = "") {
  const reponseBrute = extraireReponseDepuisResultat(result);

  if (!reponseBrute) {
    return "";
  }

  if (result.bypassFormat) {
    return reponseBrute;
  }

  const noms = [
    "formaterReponseFinale",
    "formatterReponseFinale",
    "formaterReponse",
    "formatterReponse",
    "formatReponse",
    "formatResponse",
    "formatBotResponse"
  ];

  for (const nom of noms) {
    const fn = formatting?.[nom];

    if (typeof fn !== "function") continue;

    try {
      const sortie = await fn(reponseBrute, user, question, result.fiche || null);

      if (typeof sortie === "string" && sortie.trim()) {
        return sortie;
      }

      if (sortie?.reponse) {
        return sortie.reponse;
      }
    } catch (_) {
      // On garde la réponse brute si le formatage échoue.
    }

    try {
      const sortie = await fn({
        reponse: reponseBrute,
        user,
        question,
        fiche: result.fiche || null
      });

      if (typeof sortie === "string" && sortie.trim()) {
        return sortie;
      }

      if (sortie?.reponse) {
        return sortie.reponse;
      }
    } catch (_) {
      // On garde la réponse brute si le formatage échoue.
    }
  }

  return reponseBrute;
}

async function envoyerMessageSafe(phone = "", message = "") {
  if (!phone || !message) return false;

  const noms = [
    "sendTextMessage",
    "sendWhatsAppMessage",
    "sendMessage",
    "sendText",
    "envoyerMessageWhatsApp",
    "envoyerMessageTexte",
    "envoyerTexte"
  ];

  for (const nom of noms) {
    const fn = whatsapp?.[nom];

    if (typeof fn !== "function") continue;

    try {
      await fn(phone, message);
      return true;
    } catch (_) {
      // On essaie une autre fonction disponible.
    }
  }

  console.log("Réponse non envoyée, aucune fonction WhatsApp compatible trouvée.");
  return false;
}

async function traiterAudioSafe(user = {}, msg = {}, historique = []) {
  const mediaId = extraireMediaId(msg);

  const noms = [
    "traiterAudio",
    "processAudio",
    "traiterMessageAudio",
    "handleAudio"
  ];

  for (const nom of noms) {
    const fn = audioProcessor?.[nom];

    if (typeof fn !== "function") continue;

    try {
      return await fn(user, msg, historique);
    } catch (_) {
      try {
        return await fn(user, mediaId, historique, msg);
      } catch (err) {
        throw err;
      }
    }
  }

  return resultatSimple(
    "J'ai bien reçu ton audio 😊 Pour l'instant, écris-moi ta question en texte afin que je puisse t'aider correctement."
  );
}

async function traiterImageSafe(user = {}, msg = {}, historique = []) {
  const mediaId = extraireMediaId(msg);

  const noms = [
    "traiterImage",
    "processImage",
    "traiterMessageImage",
    "handleImage"
  ];

  for (const nom of noms) {
    const fn = imageProcessor?.[nom];

    if (typeof fn !== "function") continue;

    try {
      return await fn(user, msg, historique);
    } catch (_) {
      try {
        return await fn(user, mediaId, historique, msg);
      } catch (err) {
        throw err;
      }
    }
  }

  return resultatSimple(
    "J'ai bien reçu l'image 😊 Pour l'instant, décris-moi ce que tu veux comprendre dans cette image."
  );
}

async function traiterMessageEntrant(msg = {}) {
  const phone = extrairePhone(msg);
  const msgType = extraireTypeMessage(msg);

  if (!phone) {
    logInfo("message_sans_phone", { msgType });
    return null;
  }

  let user = await chargerUtilisateur(phone);
  user = {
    ...user,
    phone
  };

  let questionUtilisateur = "";
  let historique = await getHistoriqueSafe(phone);
  let result = {
    reponse: "",
    fiche: null,
    bypassFormat: false
  };

  try {
    if (msgType === "text") {
      questionUtilisateur = extraireTexteMessage(msg);

      if (!questionUtilisateur) {
        return null;
      }

      historique = await appendHistoriqueSafe(phone, "user", questionUtilisateur);

      const commande = await traiterCommande(user, questionUtilisateur);

      if (commande?.handled) {
        result = {
          reponse: commande.reponse,
          fiche: null,
          bypassFormat: true
        };
      } else {
        const profil = await traiterIntentionsProfil(user, questionUtilisateur);

        if (profil?.handled) {
          user = profil.user || user;

          result = {
            reponse: profil.reponse,
            fiche: profil.fiche || null,
            bypassFormat: true
          };
        } else {
          result = await traiterTexte(user, questionUtilisateur, historique);
        }
      }
    } else if (msgType === "audio" || msgType === "voice") {
      questionUtilisateur = "[audio]";
      historique = await appendHistoriqueSafe(phone, "user", questionUtilisateur);
      result = await traiterAudioSafe(user, msg, historique);
    } else if (msgType === "image") {
      questionUtilisateur = "[image]";
      historique = await appendHistoriqueSafe(phone, "user", questionUtilisateur);
      result = await traiterImageSafe(user, msg, historique);
    } else {
      result = resultatSimple(
        "J'ai bien reçu ton message 😊 Pour l'instant, envoie-moi ta question en texte, audio ou image."
      );
    }

    const reponseFinale = await formaterReponseSiNecessaire(
      result,
      user,
      questionUtilisateur
    );

    if (!reponseFinale) {
      const fallback =
        "Je rencontre un petit souci technique pour traiter ta demande correctement maintenant. Réessaie dans un instant.";

      await envoyerMessageSafe(phone, fallback);
      await appendHistoriqueSafe(phone, "assistant", fallback);

      return {
        ok: false,
        phone,
        reponse: fallback
      };
    }

    await envoyerMessageSafe(phone, reponseFinale);
    await appendHistoriqueSafe(phone, "assistant", reponseFinale);

    return {
      ok: true,
      phone,
      msgType,
      reponse: reponseFinale
    };
  } catch (err) {
    if (typeof logError === "function") {
      logError("traiter_message_entrant", err, {
        phone,
        msgType
      });
    } else {
      console.error("traiter_message_entrant", err);
    }

    const fallback =
      "Je rencontre un petit souci technique pour traiter ta demande correctement maintenant. Réessaie dans un instant.";

    await envoyerMessageSafe(phone, fallback);

    return {
      ok: false,
      phone,
      msgType,
      error: err?.message || String(err)
    };
  }
}

module.exports = {
  traiterMessageEntrant,
  extrairePhone,
  extraireTypeMessage,
  extraireTexteMessage,
  extraireMediaId,
  chargerUtilisateur,
  getHistoriqueSafe,
  appendHistoriqueSafe
};
