
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// --- CONFIGURATION MWALIMU ---
const GEMINI_API_KEY = "TA_CLE_GEMINI_ICI"; // <-- Vérifie que ta clé est bien là
const WHATSAPP_TOKEN = "TON_TOKEN_PERMANENT_ICI"; // <-- Ton Token de Meta
const PHONE_NUMBER_ID = "10523327712866374"; // Ton nouvel ID mis à jour
const VERIFY_TOKEN = "mwalimu_token_2026";

// --- 1. VALIDATION DU WEBHOOK ---
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log("✅ Webhook validé !");
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// --- 2. RÉCEPTION ET RÉPONSE ---
app.post('/webhook', async (req, res) => {
    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (message && message.text) {
            const userText = message.text.body;
            const userPhone = message.from;

            console.log(`📩 Élève (${userPhone}) : ${userText}`);

            // A. Demander à Gemini
            const geminiRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`, {
                contents: [{ parts: [{ text: userText }] }]
            });

            const aiReply = geminiRes.data.candidates[0].content.parts[0].text;

            // B. Envoyer la réponse sur WhatsApp
            try {
                await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                    messaging_product: "whatsapp",
                    to: userPhone,
                    type: "text",
                    text: { body: aiReply }
                }, {
                    headers: {
                        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                });
                console.log("🚀 Mwalimu a répondu sur WhatsApp !");
            } catch (metaErr) {
                console.error("❌ Erreur Meta :", metaErr.response?.data || metaErr.message);
            }
        }
        res.status(200).send("OK");
    } catch (error) {
        console.error("❌ Erreur générale :", error.message);
        res.status(500).send("ERR");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mwalimu Edtech est en ligne sur le port ${PORT}`));
