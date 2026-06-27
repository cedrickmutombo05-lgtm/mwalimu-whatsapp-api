
const { logError } = require("../core/logger");
const { tronquerTexte } = require("../core");

const { telechargerMedia } = require("../services/media");

const {
  appelerJsonStrict
} = require("../services/geminiService");

const {
  JSON_SCHEMA_AUDIO
} = require("../constants/schemas");

const {
  estMimeAudioSupporte
} = require("./detectors");

const {
  traiterTexte
} = require("./textProcessor");

const {
  estMessagePurementSocial,
  construireReponseHumaineSimple
} = require("./social");

const {
  logUnansweredQuestion
} = require("../db");

function nettoyerMimeType(mimeType = "") {
  return String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

async function transcrireAudio(buffer, mimeType = "audio/ogg") {
  const parsed = await appelerJsonStrict({
    systemInstruction: `Tu es Mwalimu EdTech.
MISSION :
- Transcrire fidèlement l'audio de l'élève
- Identifier le type du message
- Répondre uniquement en JSON valide

Types possibles :
- salutation
- remerciement
- question
- exercice
- soumission_reponse
- autre`,
    prompt: `Transcris cet audio en français clair si possible.
Si l'élève parle en lingala, swahili ou anglais simple, traduis le sens en français simple.

Réponds uniquement sous cette forme :
{
  "transcription": "...",
  "type": "..."
}`,
    schema: JSON_SCHEMA_AUDIO,
    inlineParts: [
      {
        inlineData: {
          mimeType,
          data: buffer.toString("base64")
        }
      }
    ]
  });

  return {
    transcription: String(parsed?.transcription || "").trim(),
    type: String(parsed?.type || "autre").trim()
  };
}

async function traiterAudio(user, msg, historique = []) {
  try {
    const mediaId = msg?.audio?.id || msg?.id || "";
    const mimeWhatsApp = nettoyerMimeType(msg?.audio?.mime_type || msg?.mime_type || "");

    if (!mediaId) {
      throw new Error("ID audio introuvable");
    }

    const media = await telechargerMedia(mediaId, 10 * 1024 * 1024);
    const mimeType = nettoyerMimeType(mimeWhatsApp || media.mimeType || "audio/ogg");

    if (!estMimeAudioSupporte(mimeType)) {
      await logUnansweredQuestion(user, "Audio non supporté", "audio", mimeType);

      return {
        reponse: `J'ai bien reçu ton audio, mais son format n'est pas encore bien supporté. Essaie de m'envoyer un audio WhatsApp vocal normal ou écris ta question en texte.`,
        fiche: null,
        bypassFormat: true,
        transcription: ""
      };
    }

    const analyseAudio = await transcrireAudio(media.buffer, mimeType);
    const transcription = tronquerTexte(analyseAudio.transcription, 2500);

    if (!transcription) {
      await logUnansweredQuestion(user, "Audio sans transcription", "audio", "transcription_empty");

      return {
        reponse: `J'ai bien reçu ton audio, mais je n'ai pas pu comprendre clairement le message. Peux-tu renvoyer un audio plus clair ou écrire ta question ?`,
        fiche: null,
        bypassFormat: true,
        transcription: ""
      };
    }

    if (estMessagePurementSocial(transcription)) {
      const reponseSimple = construireReponseHumaineSimple(user, transcription);

      if (reponseSimple) {
        return {
          reponse: reponseSimple,
          fiche: null,
          bypassFormat: true,
          transcription
        };
      }
    }

    const resultat = await traiterTexte(user, transcription, historique);

    return {
      ...resultat,
      transcription
    };
  } catch (e) {
    logError("traiter_audio", e, {
      phone: user?.phone || ""
    });

    await logUnansweredQuestion(user, "Erreur traitement audio", "audio", e?.message || "audio_error");

    return {
      reponse: `J'ai bien reçu ton audio, mais je rencontre un petit souci pour l'analyser maintenant. Réessaie dans un instant ou écris ta question en texte.`,
      fiche: null,
      bypassFormat: true,
      transcription: ""
    };
  }
}

module.exports = {
  nettoyerMimeType,
  transcrireAudio,
  traiterAudio
};
