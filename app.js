const express = require('express');
const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 10000;
const VERIFY_TOKEN = "mwalimu_token_2026"; // Change ceci si nécessaire

// 1. Validation du Webhook (Pour Meta/Facebook)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// 2. Réception des messages WhatsApp
app.post('/webhook', async (req, res) => {
    try {
        const body = req.body;
        if (body.object === 'whatsapp_business_account') {
            res.sendStatus(200); // Réponse immédiate à Meta
           
            // Logique de traitement du message ici (IA + Envoi)
            console.log("Message reçu !");
        }
    } catch (error) {
        res.sendStatus(500);
    }
});

app.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));
