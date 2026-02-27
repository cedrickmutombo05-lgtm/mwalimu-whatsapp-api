
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const studentMemory = {};

app.get("/", (req, res) => res.send("Mwalimu Mentor Bienveillant Actif ✅"));

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
                        content: `Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un Congo brillant.

RÈGLES DE MENTORAT :
- ÉCOUTE : Sois très attentif aux demandes de l'élève. S'il veut changer de sujet, fais-le avec enthousiasme.
- ENCOURAGEMENT : Ne donne pas juste une réponse brute. Prends un court instant pour féliciter l'élève pour sa curiosité ou l'encourager dans son apprentissage.
- PROFONDEUR : Développe tes explications pour qu'elles soient pédagogiques, pas seulement des listes.

STRUCTURE OBLIGATOIRE :
1. SALUTATION & MOT D'ENCOURAGEMENT (Ex: "C'est une excellente question, continue ainsi !")
2. TITRE EN MAJUSCULES AVEC EMOJI
3. EXPLICATION DÉTAILLÉE (Utilise les **astérisques** uniquement sur 2 ou 3 mots-clés).

---

DÉFI DE LOGIQUE
(Pose une question pour stimuler sa réflexion).

RÈGLES DE STYLE :
- INTERDICTION absolue d'utiliser les symboles #.
- Utilise les lignes de séparation ( --- ).
- Utilise le nom de l'élève.`
                    },
                    ...studentMemory[from]
                ],
                temperature: 0.1 // Très légère souplesse pour un ton plus humain
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

            console.log("✅ Réponse pédagogique envoyée");

        } catch (error) {
            console.error("Erreur :", error.response ? error.response.data : error.message);
        }
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel sur le port ${PORT}`));
