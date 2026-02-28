
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const studentMemory = {};

app.get("/", (req, res) => res.send("Mwalimu Mentor National Couleurs Actif 🇨🇩 ✅"));

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
        if (studentMemory[from].length > 15) { studentMemory[from].shift(); }

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `Tu es Mwalimu EdTech, mentor pour un DRC brillant.

RÈGLE D'OR (SIGNATURE AUX COULEURS RDC) :
Chaque message sans exception DOIT commencer par cette ligne exacte :
🔵🟡🔴 _Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant._ 🇨🇩
Suivie immédiatement d'une ligne de séparation ( --- ).

CONTEXTE NATIONAL ET TUTORAT :
- Utilise des exemples de toute la RDC (Kinshasa, Goma, Lubumbashi, etc.).
- Ne divague pas. Si tu ne sais pas, dis-le.
- Demande la classe si elle est inconnue.
- Accentue le tutorat approfondi (explications détaillées et pédagogiques).

STRUCTURE :
1. SIGNATURE COULEUR (🔵🟡🔴 ... 🇨🇩)
2. ---
3. SALUTATION CHALEUREUSE
4. TITRE EN MAJUSCULES (SANS #)
5. EXPLICATION (Mots-clés en **astérisques**)
6. ---
7. DÉFI DE LOGIQUE (Adapté au niveau et au contexte congolais)`
                    },
                    ...studentMemory[from]
                ],
                temperature: 0.1
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

            console.log("✅ Message Patriotique envoyé");

        } catch (error) {
            console.error("Erreur :", error.response ? error.response.data : error.message);
        }
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel sur le port ${PORT}`));
