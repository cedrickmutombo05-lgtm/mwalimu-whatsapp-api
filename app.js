
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

// Tes identifiants (récupérés automatiquement depuis Render)
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = "10523327712866374"; // Ton ID WhatsApp

app.post('/webhook', async (req, res) => {
    // 1. Répondre immédiatement à Facebook
    res.sendStatus(200);

    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message || !message.text) return;

    const userText = message.text.body;
    const userPhone = message.from;

    try {
        // 2. Envoyer la question à l'IA d'OpenAI (payée avec tes 10$)
        const aiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: userText }]
        }, {
            headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
        });

        const botResponse = aiRes.data.choices[0].message.content;

        // 3. Envoyer la réponse de l'IA sur le WhatsApp de l'élève
        await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to: userPhone,
            text: { body: botResponse }
        }, {
            headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
        });

    } catch (error) {
        console.error("Erreur Mwalimu:", error.response ? error.response.data : error.message);
    }
});

// Validation du webhook pour Facebook
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token === "mwalimu_secret_token") {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

app.listen(process.env.PORT || 3000, () => console.log("Mwalimu est prêt !"));
