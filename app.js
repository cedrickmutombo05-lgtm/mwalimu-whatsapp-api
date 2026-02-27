
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const studentMemory = {};

app.get("/", (req, res) => res.send("Mwalimu Épuré Actif ✅"));

app.get("/webhook", (req, res) => {
    if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
        return res.status(200).send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
    const body = req.body;
    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const text = msg.text.body;

        if (!studentMemory[from]) { studentMemory[from] = []; }
        studentMemory[from].push({ role: "user", content: text });
        if (studentMemory[from].length > 10) { studentMemory[from].shift(); }

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `Tu es Mwalimu EdTech, mentor pour un Congo brillant.
Ton écriture DOIT être épurée et suivre cette structure :

TITRE EN MAJUSCULES AVEC EMOJI (SANS DIÈSES #)
(Ton explication ici. Utilise les **astérisques** uniquement sur 2 ou 3 mots-clés techniques).

---

DÉFI DE LOGIQUE
(Pose ici une question qui pousse l'élève à réfléchir).

RÈGLES DE SOBRIÉTÉ :
- INTERDICTION d'utiliser les symboles # (dièses).
- INTERDICTION de mettre des phrases entières en gras.
- Utilise des lignes de séparation ( --- ).
- Sois direct, clair et utilise le nom de l'élève.`
                    },
                    ...studentMemory[from]
                ],
                temperature: 0
            });

            const aiResponse = response.choices[0].message.content;
            studentMemory[from].push({ role: "assistant", content: aiResponse });

            const phoneId = body.entry[0].changes[0].value.metadata.phone_number_id;

            await axios.post(
                `https://graph.facebook.com/v18.0/${phoneId}/messages`,
                {
                    messaging_product: "whatsapp",
                    to: from,
                    type: "text",
                    text: { body: aiResponse }
                },
                { headers: { Authorization: `Bearer ${cleanToken}` } }
            );

            console.log("✅ Message épuré envoyé (Sans #)");

        } catch (error) {
            console.error("Erreur :", error.response ? error.response.data : error.message);
        }
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel sur le port ${PORT}`));
