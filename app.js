
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// --- CONFIGURATION ---
const GEMINI_API_KEY = "AIzaSyDbJqC_h1VimLfnKC_u0okfXNQtlw_F2bs";
const WHATSAPP_TOKEN = "TON_TOKEN_PERMANENT_ICI";
const PHONE_NUMBER_ID = "10523327712866374";
const VERIFY_TOKEN = "mwalimu_token_2026";

// 1. Validation Webhook
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        return res.status(200).send(req.query['hub.challenge']);
    }
    res.sendStatus(403);
});

// 2. Traitement des messages
app.post('/webhook', async (req, res) => {
    // On répond TOUT DE SUITE à Meta pour éviter les messages en boucle dans les logs
    res.status(200).send("OK");

    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message || !message.text) return;

        const userText = message.text.body;
        const userPhone = message.from;

        console.log(`📩 Reçu de ${userPhone}: ${userText}`);

        // APPEL GEMINI (Format ultra-simplifié)
        try {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
           
            const geminiRes = await axios.post(geminiUrl, {
                contents: [{ parts: [{ text: userText }] }]
            });

            const aiReply = geminiRes.data.candidates[0].content.parts[0].text;

            // ENVOI WHATSAPP
            await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                messaging_product: "whatsapp",
                to: userPhone,
                text: { body: aiReply }
            }, {
                headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
            });

            console.log("🚀 Mwalimu a répondu !");

        } catch (apiErr) {
            console.error("❌ ERREUR API (Gemini ou Meta) :");
            console.error(apiErr.response ? JSON.stringify(apiErr.response.data) : apiErr.message);
        }

    } catch (error) {
        console.error("❌ ERREUR SYSTÈME :", error.message);
    }
});

app.listen(process.env.PORT || 3000, () => console.log("Mwalimu est prêt !"));
