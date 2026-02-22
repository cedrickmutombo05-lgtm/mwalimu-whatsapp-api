const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// CONFIGURATION VIA VARIABLES D'ENVIRONNEMENT (SÉCURISÉ)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = "10523327712866374";
const VERIFY_TOKEN = "mwalimu_token_2026";

app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === VERIFY_TOKEN) {
        return res.status(200).send(req.query['hub.challenge']);
    }
    res.sendStatus(403);
});

app.post('/webhook', async (req, res) => {
    res.status(200).send("OK");
    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message || !message.text) return;

        const userText = message.text.body;
        const userPhone = message.from;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const geminiRes = await axios.post(geminiUrl, {
            contents: [{ parts: [{ text: userText }] }]
        });

        const aiReply = geminiRes.data.candidates[0].content.parts[0].text;

        await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to: userPhone,
            text: { body: aiReply }
        }, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });
    } catch (error) {
        console.error("Erreur détaillée :", error.response ? JSON.stringify(error.response.data) : error.message);
    }
});

app.listen(process.env.PORT || 3000, () => console.log("Mwalimu est prêt."));
