
const { GoogleGenerativeAI } = require("@google/generative-ai");

const { env } = require("../config/env");
const { aiConfig } = require("../config/aiConfig");
const { logError } = require("../core/logger");
const { attendre, construireAppelNaturel } = require("../core");

const {
  SYSTEM_BASE,
  SYSTEM_TUTORAT,
  SYSTEM_JURIDIQUE_WEB,
  SYSTEM_GEO_WEB
} = require("../constants/prompts");

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

function estErreurQuotaGemini(err) {
  const msg = String(err?.message || "").toLowerCase();
  const data = String(err?.response?.data ? JSON.stringify(err.response.data) : "").toLowerCase();

  return msg.includes("429") ||
    msg.includes("quota") ||
    data.includes("429") ||
    data.includes("quota");
}

async function attendreAvecBackoff(tentative = 0) {
  const base = aiConfig.retry.baseDelayMs;
  const extra = tentative * aiConfig.retry.extraDelayMs;

  await attendre(base + extra);
}

async function genererAvecRetry(model, payload, maxRetries = aiConfig.retry.maxRetries) {
  let lastError = null;

  for (let tentative = 0; tentative <= maxRetries; tentative++) {
    try {
      await attendreAvecBackoff(tentative);
      return await model.generateContent(payload);
    } catch (e) {
      lastError = e;

      logError("gemini_retry", e, {
        tentative: tentative + 1
      });

      if (estErreurQuotaGemini(e) && tentative < maxRetries) {
        await attendre(aiConfig.retry.quotaDelayMs + tentative * 3000);
        continue;
      }

      throw e;
    }
  }

  throw lastError;
}

async function safeAI(generateFn, fallbackMessage = "") {
  try {
    const res = await generateFn();

    if (!res || !String(res).trim()) {
      throw new Error("Réponse vide");
    }

    return res;
  } catch (e) {
    logError("safe_ai", e);
    return fallbackMessage;
  }
}

function extraireJsonGemini(brut = "") {
  const txt = String(brut || "").trim();
  if (!txt) return null;

  try {
    return JSON.parse(txt);
  } catch {}

  const sansFence = txt
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(sansFence);
  } catch {}

  const match = sansFence.match(/\{[\s\S]*\}/);

  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  return null;
}

function construireSystemPrompt(user) {
  const appelEleve = construireAppelNaturel(user);
  const classe = user?.classe ? `Classe de l'élève : ${user.classe}` : "Classe non précisée";
  const reve = user?.reve ? `Rêve de l'élève : ${user.reve}` : "Rêve non précisé";

  return `${SYSTEM_BASE}
${SYSTEM_TUTORAT}
${SYSTEM_JURIDIQUE_WEB}
${SYSTEM_GEO_WEB}
PERSONNALISATION :
- Adresse l'élève naturellement ainsi : ${appelEleve}
- N'utilise pas systématiquement "Ah, Prénom"
- N'utilise pas systématiquement "mon cher" ou "ma chère"
- Tu peux parfois ne pas mettre le prénom dans la première phrase
- ${classe}
- ${reve}

RÈGLE DE COHÉRENCE THÉMATIQUE :
- La CONSOLIDATION doit porter uniquement sur la question principale
- Interdiction totale de mélanger deux matières différentes dans une même consolidation
- Si la question porte sur le droit, la consolidation doit rester en droit
- Si la question porte sur la géographie, la consolidation doit rester en géographie
- Si la question porte sur l'histoire, la consolidation doit rester en histoire
- La citation finale doit rester dans la même matière que la question
- L'ouverture finale doit rester dans la même matière que la question
- Ne bascule jamais du droit vers la géographie, de l'histoire vers la géographie, ou d'une matière vers une autre, sauf si l'élève le demande

RÈGLE POUR LA CONSOLIDATION :
- Rédige EXACTEMENT une ou deux questions brèves qui testent la compréhension de la notion principale.
- Les questions doivent être directement liées à la question de l'élève, pas à la matière en général.
- Exemples acceptables : "Peux-tu m'expliquer avec tes mots pourquoi … ?", "Qu'arriverait-il si on changeait … ?", "Donne-moi un autre exemple qui illustre cette règle."
- Pas de QCM automatique, sauf si la question s'y prête naturellement.
- Sois concis : maximum deux phrases pour l'ensemble du bloc.

INTERDICTION :
- Ne dis pas "mon élève"
- Ne donne pas une réponse froide de moteur de recherche
- Ne répète jamais le header Mwalimu
- Ne génère jamais une citation finale
- Ne génère jamais une deuxième ouverture finale
- Ne génère jamais un mot d'encouragement final`;
}

function toGeminiContents(messages = []) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content) }]
    }));
}

async function appelerChatCompletion(messages) {
  const systemMessages = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = toGeminiContents(messages);

  const model = genAI.getGenerativeModel({
    model: aiConfig.model,
    systemInstruction: systemMessages,
    tools: [{ googleSearch: {} }]
  });

  const result = await genererAvecRetry(model, {
    contents,
    generationConfig: {
      temperature: aiConfig.temperature.normal
    }
  });

  return result.response.text();
}

async function appelerJsonStrict({
  systemInstruction = "",
  prompt = "",
  schema = null,
  history = [],
  inlineParts = []
}) {
  const model = genAI.getGenerativeModel({
    model: aiConfig.model,
    systemInstruction
  });

  const result = await genererAvecRetry(model, {
    contents: [
      ...toGeminiContents(history),
      {
        role: "user",
        parts: [{ text: prompt }, ...inlineParts]
      }
    ],
    generationConfig: {
      temperature: aiConfig.temperature.strict,
      responseMimeType: "application/json",
      ...(schema ? { responseSchema: schema } : {})
    }
  });

  return extraireJsonGemini(result.response.text());
}

module.exports = {
  genAI,
  estErreurQuotaGemini,
  attendreAvecBackoff,
  genererAvecRetry,
  safeAI,
  extraireJsonGemini,
  construireSystemPrompt,
  toGeminiContents,
  appelerChatCompletion,
  appelerJsonStrict
};
