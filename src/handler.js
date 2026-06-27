

// =========================================================
// HANDLER – ORCHESTRATION DES MESSAGES
// Compatible CommonJS / Render / Node.js
// =========================================================


const {
  logInfo,
  pick,
  makeCacheKey,
  getCache,
  setCache,
  normaliserTexteRelationnel,
  premierPrenom
} = require("./utils");

const {
  consulterBibliotheque,
  logUnansweredQuestion,
  resetStudentAttempt,
  saveStudentAttempt
} = require("./db");

const {
  telechargerMedia,
  estMimeAudioSupporte,
  estMimeImageSupporte
} = require("./whatsapp");

const {
  estMessagePurementSocial,
  construireReponseHumaineSimple
} = require("./social");

const {
  estQuestionAcademique,
  estQuestionGeographieRDC,
  estSoumissionReponse,
  detecterIntentionIA,
  construireConsigneAntiBoucle,
  construireConsignePedagogique,
  construireReponseDbWebIa,
  analyserAudioCourt,
  reponseAudioUneSeulePasse,
  expliquerImageAvecIA
} = require("./ai");

async function traiterTexte(user, texteUtilisateur, historique = []) {
  if (estMessagePurementSocial(texteUtilisateur)) {
    const simple = construireReponseHumaineSimple(user, texteUtilisateur, historique);
    if (simple) return { reponse: simple, fiche: null, bypassFormat: true };
  }

  const conversationAcademique = historique.some(
    (m) => m.role === "user" && estQuestionAcademique(m.content || "")
  );

  if (!conversationAcademique && !estQuestionAcademique(texteUtilisateur)) {
    const prenom = premierPrenom(user?.nom || "");

    return {
      reponse: pick([
        `Je suis là pour t'aider **${prenom}** 😊 Quelle matière ou quel exercice veux-tu travailler ?`,
        `**${prenom}**, envoie-moi une question, une leçon ou un exercice, et je vais t'accompagner.`,
        `D'accord **${prenom}**. Dis-moi maintenant ce que tu veux comprendre.`
      ]),
      fiche: null,
      bypassFormat: true
    };
  }

  const cacheKey = makeCacheKey(user, texteUtilisateur);
  const cached = getCache(cacheKey);

  if (cached) {
    logInfo("cache_hit", {
      phone: user?.phone || "",
      cacheKey
    });

    return { reponse: cached, fiche: null, bypassFormat: false };
  }

  const fiche = await consulterBibliotheque(texteUtilisateur, user.classe || "");
  const analyse = await detecterIntentionIA(user, texteUtilisateur, historique);

  const antiBoucle = await construireConsigneAntiBoucle(
    user,
    texteUtilisateur,
    historique,
    saveStudentAttempt
  );

  let consigne = construireConsignePedagogique(texteUtilisateur, "text");

  if (analyse.intention === "juridique") {
    consigne += "\nLe message semble juridique. Ne cite un article que si tu es fiable.";
  }

  if (
    analyse.intention === "geographie_rdc" ||
    estQuestionGeographieRDC(texteUtilisateur, fiche)
  ) {
   
consigne += `
Question géographique/administrative RDC :
- Utilise Google Search avant de répondre.
- Ne confonds jamais ville, chef-lieu et territoire.
- Si l'élève demande les territoires d'une province, donne uniquement les territoires.
- Ne cite pas une ville comme territoire.
- Si tu n'es pas certain, dis clairement : "Je dois vérifier cette liste."
`; 
  }

  if (antiBoucle.consigne) {
    consigne += `\n${antiBoucle.consigne}`;
  }

  const reponse = await construireReponseDbWebIa(
    user,
    texteUtilisateur,
    historique,
    fiche,
    consigne
  );

  if (reponse && String(reponse).trim()) {
    setCache(cacheKey, reponse);
  } else {
    await logUnansweredQuestion(user, texteUtilisateur, "text", "traiterTexte_empty");
  }

  if (!estSoumissionReponse(texteUtilisateur)) {
    await resetStudentAttempt(user.phone, antiBoucle.sujet || analyse.sujet || "general");
  }

  return {
    reponse,
    fiche: fiche || null,
    bypassFormat: false
  };
}

async function traiterAudio(user, msg, historique = []) {
  const audioId = msg.audio?.id;

  if (!audioId) {
    return {
      reponse: "Je n'arrive pas à lire ton audio.",
      fiche: null,
      bypassFormat: true
    };
  }

  const { buffer, mimeType } = await telechargerMedia(audioId);

  logInfo("audio_received", {
    phone: user?.phone || "",
    mimeType
  });

  if (!estMimeAudioSupporte(mimeType)) {
    return {
      reponse: "Format audio non supporté.",
      fiche: null,
      bypassFormat: true
    };
  }

  const analyse = await analyserAudioCourt(user, buffer, mimeType, historique);
  const transcription = analyse.transcription || "";
  const transcriptionNormale = normaliserTexteRelationnel(transcription);

  if (transcriptionNormale && estMessagePurementSocial(transcriptionNormale)) {
    const simple = construireReponseHumaineSimple(user, transcriptionNormale, historique);
    if (simple) return { reponse: simple, fiche: null, bypassFormat: true };
  }

  if (analyse.type === "social") {
    const simple = construireReponseHumaineSimple(user, transcription || "merci", historique);
    return {
      reponse: simple || "Avec plaisir 😊",
      fiche: null,
      bypassFormat: true
    };
  }

  let reponse = await reponseAudioUneSeulePasse(user, buffer, mimeType, historique);

  if (!reponse || !reponse.trim()) {
    reponse = "Je n'arrive pas encore à analyser ton audio correctement.";
    return { reponse, fiche: null, bypassFormat: true };
  }

  if (!String(reponse).toLowerCase().includes("audio")) {
    reponse = `J'ai bien reçu ton audio.\n\n${reponse}`;
  }

  return {
    reponse,
    fiche: null,
    bypassFormat: false
  };
}

async function traiterImage(user, msg, historique = []) {
  const imageId = msg.image?.id;

  if (!imageId) {
    return {
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Mais je n'arrive pas à l'ouvrir correctement.
🔴 [INSPIRATION] : Nous allons y arriver.
❓ [CONSOLIDATION] : Réessaie avec une image plus nette.`,
      fiche: null,
      bypassFormat: false
    };
  }

  const { buffer, mimeType } = await telechargerMedia(imageId);

  logInfo("image_received", {
    phone: user?.phone || "",
    mimeType
  });

  if (!estMimeImageSupporte(mimeType)) {
    return {
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Le format d'image n'est pas encore supporté.
🔴 [INSPIRATION] : Ce n'est pas grave.
❓ [CONSOLIDATION] : Envoie-moi une image JPG, PNG, WEBP, GIF, BMP, HEIC ou HEIF.`,
      fiche: null,
      bypassFormat: false
    };
  }

  const base64Image = buffer.toString("base64");
  let reponse = "";

  try {
    reponse = await expliquerImageAvecIA(user, base64Image, mimeType, historique);
  } catch (e) {
    reponse = "";
  }

  if (!reponse || !String(reponse).trim()) {
    reponse = `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Je n'arrive pas encore à l'analyser correctement.
🔴 [INSPIRATION] : Nous pouvons reprendre calmement.
❓ [CONSOLIDATION] : Envoie-moi une image plus nette ou mieux cadrée.`;
  }

  return {
    reponse,
    fiche: null,
    bypassFormat: false
  };
}

async function processIncomingMessage(ctx) {
  return { handled: false };
}

module.exports = {
  traiterTexte,
  traiterAudio,
  traiterImage,
  processIncomingMessage
};


 

