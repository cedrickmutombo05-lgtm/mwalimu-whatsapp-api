

// =========================================================
// HANDLER – ORCHESTRATION DES MESSAGES
// =========================================================

const {
  logInfo,
  normaliserTexteRelationnel
} = require("./utils");

const {
  telechargerMedia,
  estMimeAudioSupporte
} = require("./whatsapp");

const {
  estMessagePurementSocial,
  construireReponseHumaineSimple
} = require("./social");

const {
  analyserAudioCourt,
  reponseAudioUneSeulePasse
} = require("./ai");

async function traiterTexte(ctx) {
  return { handled: false, reponse: "", fiche: null, bypassFormat: false };
}

async function traiterAudio(user, msg, historique = []) {
  const audioId = msg.audio?.id;

  if (!audioId) {
    return { reponse: "Je n'arrive pas à lire ton audio.", fiche: null, bypassFormat: true };
  }

  const { buffer, mimeType } = await telechargerMedia(audioId);

  logInfo("audio_received", {
    phone: user?.phone || "",
    mimeType
  });

  if (!estMimeAudioSupporte(mimeType)) {
    return { reponse: "Format audio non supporté.", fiche: null, bypassFormat: true };
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
    return { reponse: simple || "Avec plaisir 😊", fiche: null, bypassFormat: true };
  }

  let reponse = await reponseAudioUneSeulePasse(user, buffer, mimeType, historique);

  if (!reponse || !reponse.trim()) {
    reponse = "Je n'arrive pas encore à analyser ton audio correctement.";
    return { reponse, fiche: null, bypassFormat: true };
  }

  return {
    reponse,
    fiche: null,
    bypassFormat: estMessagePurementSocial(reponse) && reponse.length < 180
  };
}

async function traiterImage(ctx) {
  return { handled: false, reponse: "", fiche: null, bypassFormat: false };
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
