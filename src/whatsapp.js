
// =========================================================
// WHATSAPP – ENVOI, MÉDIA ET EXTRACTION MESSAGE
// =========================================================

const axios = require("axios");
const { TOKEN, PHONE_NUMBER_ID } = require("./config");
const { tronquerTexte, logError, logWarn } = require("./utils");

axios.defaults.timeout = 15000;

async function envoyerWhatsApp(to, texte) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: tronquerTexte(texte, 3900) }
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );
  } catch (e) {
    logError("whatsapp_send", e, { to });
  }
}

async function envoyerIndicateurFrappe(messageId) {
  try {
    if (!messageId) return;

    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" }
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );
  } catch (e) {
    logWarn("typing_indicator_error", {
      message: e?.message || "",
      data: e?.response?.data || null
    });
  }
}

async function recupererMetaMediaInfo(mediaId) {
  const r = await axios.get(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 15000
    }
  );

  return r.data || {};
}

async function telechargerMedia(mediaId, maxBytes = 8 * 1024 * 1024) {
  const mediaInfo = await recupererMetaMediaInfo(mediaId);
  const mediaUrl = mediaInfo?.url || null;

  if (!mediaUrl) throw new Error("URL média introuvable");

  const response = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 30000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    validateStatus: (s) => s >= 200 && s < 300
  });

  const mimeType = String(
    response.headers["content-type"] ||
    mediaInfo?.mime_type ||
    "application/octet-stream"
  ).toLowerCase();

  const contentLength = Number(
    response.headers["content-length"] ||
    response.data?.byteLength ||
    0
  );

  if (contentLength > maxBytes) throw new Error("Fichier trop volumineux");

  return {
    buffer: Buffer.from(response.data),
    mimeType
  };
}

function estMimeImageSupporte(mimeType = "") {
  return [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/heic",
    "image/heif"
  ].includes(String(mimeType || "").toLowerCase());
}

function estMimeAudioSupporte(mimeType = "") {
  return [
    "audio/ogg",
    "audio/opus",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/aac",
    "audio/amr"
  ].includes(String(mimeType || "").toLowerCase());
}

function extraireMessageWhatsApp(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;

  if (!value || value.statuses?.length || !value.messages?.length) {
    return null;
  }

  return value.messages[0];
}

function typeMessage(msg) {
  if (!msg) return "unknown";
  if (msg.text?.body) return "text";
  if (msg.audio) return "audio";
  if (msg.image) return "image";
  if (msg.document) return "document";
  if (msg.interactive) return "interactive";
  return msg.type || "unknown";
}

function messageTypeLisible(msgType = "message") {
  if (msgType === "audio") return "ton audio";
  if (msgType === "image") return "ton image";
  if (msgType === "text") return "ton message écrit";
  return "ton message";
}

module.exports = {
  envoyerWhatsApp,
  envoyerIndicateurFrappe,
  recupererMetaMediaInfo,
  telechargerMedia,
  estMimeImageSupporte,
  estMimeAudioSupporte,
  extraireMessageWhatsApp,
  typeMessage,
  messageTypeLisible
};
