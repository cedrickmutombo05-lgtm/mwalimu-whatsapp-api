
const express = require('express');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());

// Récupération des clés configurées sur Render
const token = process.env.WA_TOKEN;
const apiKey = process.env.API_KEY;

// 1. Validation du Webhook (pour Meta)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token_sent = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Remplace "votre_token_de_verification" par celui que tu as mis sur Meta
    if (mode && token_sent === "votre_token_de_verification") {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 2. Réception des messages et réponse avec l'IA Gemini
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;

        if (body.object === 'whatsapp_business_account' && body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]) {
            const msg = body.entry[0].changes[0].value.messages[0];
            const from = msg.from; // Numéro de l'utilisateur
            const text = msg.text.body; // Message reçu

            console.log("Message reçu de " + from + " : " + text);

            // --- ÉTAPE A : Demander une réponse à l'IA Gemini ---
            const geminiRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                contents: [{ parts: [{ text: text }] }]
            });

            const aiResponse = geminiRes.data.candidates[0].content.parts[0].text;

            // --- ÉTAPE B : Envoyer la réponse de l'IA sur WhatsApp ---
            await axios.post(`https://graph.facebook.com/v18.0/1052332771286374/messages`, {
                messaging_product: "whatsapp",
                to: from,
                text: { body: aiResponse }
            }, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            res.sendStatus(200);
        } else {
            res.sendStatus(404);
        }
    } catch (error) {
        console.error("Erreur détaillée :", error.response?.data || error.message);
        res.sendStatus(500);
    }
});

app.listen(3000, () => console.log('Mwalimu est prêt et écoute sur le port 3000 !'));
