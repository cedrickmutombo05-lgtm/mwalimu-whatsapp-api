
const { aiConfig } = require("../config/aiConfig");
const { logError } = require("../core/logger");
const { tronquerTexte } = require("../core");

const { telechargerMedia } = require("../services/media");

const {
  genAI,
  genererAvecRetry,
  construireSystemPrompt
} = require("../services/geminiService");

const {
  estMimeImageSupporte
} = require("./detectors");

const {
  logUnansweredQuestion
} = require("../db");

function nettoyerMimeTypeImage(mimeType = "") {
  return String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
}

async function analyserImageAvecIA(user, buffer, mimeType = "image/jpeg") {
  const model = genAI.getGenerativeModel({
    model: aiConfig.model,
    systemInstruction: `${construireSystemPrompt(user)}
MODE IMAGE :
- Analyse l'image comme un précepteur
- Si l'image contient un exercice, explique la méthode avant la réponse
- Si l'image contient un texte, lis-le et explique-le simplement
- Si une partie est floue ou illisible, dis-le honnêtement
- Ne fais pas le devoir à la place de l'élève
- Guide l'élève pas à pas
- Réponds en français clair
- Utilise la structure Mwalimu si c'est pédagogique`
  });

  const result = await genererAvecRetry(model, {
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Analyse cette image envoyée par l'élève.
Explique ce qui est visible, puis aide l'élève à comprendre.
Si c'est un exercice, donne la méthode et guide sans tout faire à sa place.`
          },
          {
            inlineData: {
              mimeType,
              data: buffer.toString("base64")
            }
          }
        ]
      }
    ],
    generationConfig: {
      temperature: aiConfig.temperature.media
    }
  });

  return tronquerTexte(result.response.text(), 3500);
}

async function traiterImage(user, msg, historique = []) {
  try {
    const mediaId = msg?.image?.id || msg?.id || "";
    const mimeWhatsApp = nettoyerMimeTypeImage(msg?.image?.mime_type || msg?.mime_type || "");

    if (!mediaId) {
      throw new Error("ID image introuvable");
    }

    const media = await telechargerMedia(mediaId, 8 * 1024 * 1024);
    const mimeType = nettoyerMimeTypeImage(mimeWhatsApp || media.mimeType || "image/jpeg");

    if (!estMimeImageSupporte(mimeType)) {
      await logUnansweredQuestion(user, "Image non supportée", "image", mimeType);

      return {
        reponse: "J'ai bien reçu ton image, mais son format n'est pas encore bien supporté. Essaie d'envoyer une image en JPG, PNG ou WEBP.",
        fiche: null,
        bypassFormat: true
      };
    }

    const reponse = await analyserImageAvecIA(user, media.buffer, mimeType);

    if (!reponse || !String(reponse).trim()) {
      await logUnansweredQuestion(user, "Image sans réponse IA", "image", "image_ai_empty");

      return {
        reponse: "J'ai bien reçu ton image, mais je n'arrive pas encore à l'analyser clairement. Essaie d'envoyer une image plus nette.",
        fiche: null,
        bypassFormat: true
      };
    }

    return {
      reponse,
      fiche: null,
      bypassFormat: false
    };
  } catch (e) {
    logError("traiter_image", e, {
      phone: user?.phone || ""
    });

    await logUnansweredQuestion(user, "Erreur traitement image", "image", e?.message || "image_error");

    return {
      reponse: "J'ai bien reçu ton image, mais je rencontre un petit souci pour l'analyser maintenant. Réessaie avec une image plus nette ou écris ta question.",
      fiche: null,
      bypassFormat: true
    };
  }
}

module.exports = {
  nettoyerMimeTypeImage,
  analyserImageAvecIA,
  traiterImage
};
