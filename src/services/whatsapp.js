
const axios = require("axios");
const { env } = require("../config/env");
const { logError, logWarn } = require("../core/logger");
const { tronquerTexte } = require("../core");

axios.defaults.timeout = 15000;

async function envoyerWhatsApp(to, texte) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: {
          body: tronquerTexte(texte, 3900)
        }
      },
      {
        headers: {
          Authorization: `Bearer ${env.TOKEN}`,
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
      `https://graph.facebook.com/v18.0/${env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" }
      },
      {
        headers: {
          Authorization: `Bearer ${env.TOKEN}`,
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

module.exports = {
  envoyerWhatsApp,
  envoyerIndicateurFrappe
};
