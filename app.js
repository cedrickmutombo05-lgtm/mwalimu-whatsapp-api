
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const studentMemory = {};

app.get("/", (req, res) => res.send("Mwalimu Adaptatif DRC Actif ✅"));

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

RÈGLE D'OR (SIGNATURE) :
Chaque message commence par : _Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant._
Suivie d'une ligne ( --- ).

PROTOCOLE DE NIVEAU SCOLAIRE :
1. Si c'est le premier message ou si tu ne connais pas encore la classe de l'élève, demande-lui poliment sa classe (ex: 7ème EB, 8ème EB, 1ère Humanité...) avant de proposer un défi.
2. Une fois la classe connue, ADAPTE la complexité de tes explications et de ton DÉFI DE LOGIQUE à son niveau scolaire.
3. Ne pose jamais de questions banales à un élève du secondaire.

RÈGLES DE VÉRITÉ :
- Interdiction d'inventer des faits. Si tu ne sais pas, admets-le.
- Accent mis sur le tutorat approfondi (explications riches).

STRUCTURE :
1. SIGNATURE EN ITALIQUE
2. ---
3. SALUTATION & ENCOURAGEMENT
4. TITRE EN MAJUSCULES (SANS #)
5. EXPLICATION (Mots-clés en **astérisques**)
6. ---
7. DÉFI DE LOGIQUE (Adapté à la classe de l'élève)`
                    },
                    ...studentMemory[from]
                ],
                temperature: 0.0
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

            console.log("✅ Message adaptatif envoyé");

        } catch (error) {
            console.error("Erreur :", error.response ? error.response.data : error.message);
        }
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel sur le port ${PORT}`));
