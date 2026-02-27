
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// 1. Réglages de base (calqués sur ton écran)
const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 2. Mémoire vive pour le tutorat approfondi
const studentMemory = {};

app.get("/", (req, res) => res.send("Diagnostic MWALIMU actif ✅")); //

app.get("/webhook", (req, res) => {
    if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
        return res.status(200).send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
    // Ton log exact : OBJET REÇU DE META
    console.log("---------------------------------------");
    console.log("📥 OBJET REÇU DE META : ", JSON.stringify(req.body, null, 2));

    const body = req.body;
    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const text = msg.text.body;

        // Mise en mémoire du message élève
        if (!studentMemory[from]) { studentMemory[from] = []; }
        studentMemory[from].push({ role: "user", content: text });

        if (studentMemory[from].length > 10) { studentMemory[from].shift(); }

        try {
            // Appel à l'IA avec ton SYSTEM_PROMPT
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: process.env.SYSTEM_PROMPT },
                    ...studentMemory[from]
                ],
                temperature: 0
            });

            const aiResponse = response.choices[0].message.content;
            studentMemory[from].push({ role: "assistant", content: aiResponse });

            // Envoi WhatsApp
            await axios.post(
                `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
                {
                    messaging_product: "whatsapp",
                    to: from,
                    type: "text",
                    text: { body: aiResponse }
                },
                { headers: { Authorization: `Bearer ${cleanToken}` } }
            );

            // --- TA LIGNE DE CONFIRMATION AJOUTÉE ICI ---
            console.log("✅ Réponse envoyée");

        } catch (error) {
            console.error("Erreur :", error.response ? error.response.data : error.message);
        }
    }
    res.sendStatus(200);
});

// Ton port exact : 10000
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel sur le port ${PORT}`));
