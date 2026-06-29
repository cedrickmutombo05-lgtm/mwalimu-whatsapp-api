

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

const HEADER_MWALIMU = `🔴🟡🔵 *Mwalimu EdTech : Ton Mentor pour l'Excellence 🇨🇩*
────────────────`;

function contientHeaderMwalimu(texte = "") {
  const t = String(texte || "");
  return (
    t.includes("🔴🟡🔵") ||
    /Mwalimu EdTech\s*:\s*Ton Mentor/i.test(t)
  );
}

function ajouterHeaderPedagogique(texte = "") {
  const reponse = String(texte || "").trim();

  if (!reponse) return "";
  if (contientHeaderMwalimu(reponse)) return reponse;

  return `${HEADER_MWALIMU}

${reponse}`;
}

function contientFuiteInterneIA(texte = "") {
  const t = String(texte || "").toLowerCase();

  return (
    t.includes("tool_code") ||
    t.includes("google_search.search") ||
    t.includes("thought") ||
    t.includes("here's a plan") ||
    t.includes("heres a plan") ||
    t.includes("the user wants") ||
    t.includes("i need to") ||
    t.includes("i will use") ||
    t.includes("provided context") ||
    t.includes("mwalimu edtech persona") ||
    t.includes("print(") ||
    t.includes("queries=")
  );
}

function nettoyerFuiteInterneIA(texte = "") {
  let t = String(texte || "").trim();

  if (!t) return "";
  if (!contientFuiteInterneIA(t)) return t;

  // Supprime les blocs de code éventuels.
  t = t.replace(/```[\s\S]*?```/g, "");

  // Supprime la partie tool_code jusqu’à un éventuel début de réponse pédagogique.
  t = t.replace(
    /tool_code[\s\S]*?(?=(🔵|🟡|🔴|❓|\[VÉCU\]|\[SAVOIR\]|\[INSPIRATION\]|\[CONSOLIDATION\]|Bonjour|D'accord|Très bien|En fait|La |Le |Les |Un |Une |Voici))/i,
    ""
  );

  // Supprime les blocs de raisonnement interne.
  t = t.replace(/\bthought\b[\s\S]*?(here'?s a plan\s*:|voici un plan\s*:)?/i, "");

  const lignesInterdites = [
    /tool_code/i,
    /google_search\.search/i,
    /queries=/i,
    /print\(/i,
    /\bthought\b/i,
    /here'?s a plan/i,
    /the user wants/i,
    /i need to/i,
    /i will/i,
    /i should/i,
    /provided context/i,
    /mwalimu edtech persona/i,
    /start with/i,
    /include/i,
    /explain what/i,
    /all while/i,
    /for a student/i,
    /^\s*\d+\.\s*\*\*?\s*[🔵🟡🔴❓]/i
  ];

  t = t
    .split("\n")
    .filter((ligne) => {
      const l = String(ligne || "").trim();
      if (!l) return true;
      return !lignesInterdites.some((regex) => regex.test(l));
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Si après nettoyage il reste encore une fuite, on bloque.
  if (contientFuiteInterneIA(t)) {
    return "";
  }

  // Si le nettoyage a presque tout supprimé, mieux vaut ne rien envoyer.
  if (t.length < 40) {
    return "";
  }

  return t;
}

function construireReponseSecurite(user = {}, question = "") {
  const nom = String(user?.nom || "").trim();
  const prenom = nom ? nom.split(/\s+/)[0] : "";
  const appel = prenom ? `**${prenom}**` : "toi";

  return `Je reprends correctement ${appel} 😊

Je ne dois pas afficher d’éléments techniques à l’élève.

Réécris simplement ta demande, par exemple :
**Explique-moi cela simplement.**`;
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

  const reponseNettoyeeDirecte = nettoyerFuiteInterneIA(reponseBrute);

  if (!reponseNettoyeeDirecte) {
    return ajouterHeaderPedagogique(construireReponseSecurite(user, question));
  }

  // Les réponses sociales, commandes, profil, choix de matière et repos gardent bypassFormat:true.
  if (result.bypassFormat) {
    return reponseNettoyeeDirecte;
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
      const sortie = await fn(
        reponseNettoyeeDirecte,
        user,
        question,
        result.fiche || null
      );

      if (typeof sortie === "string" && sortie.trim()) {
        const propre = nettoyerFuiteInterneIA(sortie);
        return ajouterHeaderPedagogique(
          propre || construireReponseSecurite(user, question)
        );
      }

      if (sortie?.reponse) {
        const propre = nettoyerFuiteInterneIA(sortie.reponse);
        return ajouterHeaderPedagogique(
          propre || construireReponseSecurite(user, question)
        );
      }
    } catch (_) {
      // On essaie l'autre forme.
    }

    try {
      const sortie = await fn({
        reponse: reponseNettoyeeDirecte,
        user,
        question,
        fiche: result.fiche || null
      });

      if (typeof sortie === "string" && sortie.trim()) {
        const propre = nettoyerFuiteInterneIA(sortie);
        return ajouterHeaderPedagogique(
          propre || construireReponseSecurite(user, question)
        );
      }

      if (sortie?.reponse) {
        const propre = nettoyerFuiteInterneIA(sortie.reponse);
        return ajouterHeaderPedagogique(
          propre || construireReponseSecurite(user, question)
        );
      }
    } catch (_) {
      // On garde la réponse brute nettoyée.
    }
  }

  return ajouterHeaderPedagogique(reponseNettoyeeDirecte);
}

async function envoyerMessageSafe(phone = "", message = "") {
  if (!phone || !message) return false;

  const noms = [
    "envoyerWhatsApp",
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
  appendHistoriqueSafe,
  envoyerMessageSafe,
  ajouterHeaderPedagogique,
  contientHeaderMwalimu,
  contientFuiteInterneIA,
  nettoyerFuiteInterneIA
};
