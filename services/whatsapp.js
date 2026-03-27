const axios = require("axios");

/* =========================================================
   WHATSAPP
========================================================= */
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: { body: texte.slice(0, 3900) }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.TOKEN}`,
                    "Content-Type": "application/json"
                },
                timeout: 15000
            }
        );
    } catch (e) {
        console.error("Erreur WA:", e.response?.data || e.message);
    }
}

async function recupererMediaUrl(mediaId) {
    const r = await axios.get(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        {
            headers: { Authorization: `Bearer ${process.env.TOKEN}` },
            timeout: 15000
        }
    );
    return r.data?.url || null;
}

async function telechargerMedia(mediaId, maxBytes = 8 * 1024 * 1024) {
    const mediaUrl = await recupererMediaUrl(mediaId);
    if (!mediaUrl) throw new Error("URL média introuvable");

    const response = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
        headers: { Authorization: `Bearer ${process.env.TOKEN}` },
        timeout: 30000,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
        validateStatus: (s) => s >= 200 && s < 300
    });

    const contentType = response.headers["content-type"] || "application/octet-stream";
    const contentLength = Number(response.headers["content-length"] || response.data?.byteLength || 0);

    if (contentLength > maxBytes) {
        throw new Error("Fichier trop volumineux");
    }

    return {
        buffer: Buffer.from(response.data),
        mimeType: contentType
    };
}

module.exports = {
    envoyerWhatsApp,
    recupererMediaUrl,
    telechargerMedia
};
