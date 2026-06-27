
const axios = require("axios");
const { env } = require("../config/env");

async function recupererMetaMediaInfo(mediaId) {
  const r = await axios.get(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    {
      headers: {
        Authorization: `Bearer ${env.TOKEN}`
      },
      timeout: 15000
    }
  );

  return r.data || {};
}

async function telechargerMedia(mediaId, maxBytes = 8 * 1024 * 1024) {
  const mediaInfo = await recupererMetaMediaInfo(mediaId);
  const mediaUrl = mediaInfo?.url || null;

  if (!mediaUrl) {
    throw new Error("URL média introuvable");
  }

  const response = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    headers: {
      Authorization: `Bearer ${env.TOKEN}`
    },
    timeout: 30000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    validateStatus: (s) => s >= 200 && s < 300
  });

  const contentType = String(
    response.headers["content-type"] || mediaInfo?.mime_type || "application/octet-stream"
  ).toLowerCase();

  const contentLength = Number(
    response.headers["content-length"] || response.data?.byteLength || 0
  );

  if (contentLength > maxBytes) {
    throw new Error("Fichier trop volumineux");
  }

  return {
    buffer: Buffer.from(response.data),
    mimeType: contentType
  };
}

module.exports = {
  recupererMetaMediaInfo,
  telechargerMedia
};
