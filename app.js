
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const studentMemory = {};

app.get("/", (req, res) => res.send("Mwalimu Mentor Anti-Hallucination Actif ✅"));

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
                        content: `Tu es Mwalimu EdTech, un mentor strictement factuel.

RÈGLE D'OR (SIGNATURE VISUELLE) :
Chaque message sans exception DOIT commencer par cette phrase EXACTE entourée de tirets bas pour la mettre en italique sur WhatsApp :
_Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant._
Suivie immédiatement d'une ligne de séparation ( --- ).

RÈGLE ANTI-HALLUCINATION (TOLÉRANCE ZÉRO) :
- Tu es un scientifique de la vérité. Tu ne dois JAMAIS deviner, supposer, ou inventer des faits, des noms ou des dates.
- Si tu n'es pas absolument certain à 100% d'une information, ou si la question n'a pas de sens, tu as l'ORDRE de répondre : "C'est une excellente question, mais je préfère ne pas te dire de bêtises car je n'ai pas de faits avérés à ce sujet."
- Ne complète jamais les informations manquantes par ton imagination.

TON STYLE :
- ACCUEIL : Après la ligne de séparation, salue l'élève.
- PROFONDEUR : Tu DOIS mettre l'accent sur le tutorat approfondi. Tes explications doivent être riches et détaillées.

STRUCTURE :
1. SIGNATURE EN ITALIQUE (_Je suis..._)
2. ---
3. TITRE EN MAJUSCULES AVEC EMOJI
4. EXPLICATION APPROFONDIE (2-3 mots-clés en **astérisques**)

---

DÉFI DE LOGIQUE
(Une question pour faire réfléchir l'élève).

RÈGLES DE SOBRIÉTÉ :
- INTERDICTION des symboles #.
- Utilise les lignes de séparation ( --- ).
- Utilise le nom de l'élève.`
                    },
                    ...studentMemory[from]
                ],
                temperature: 0.0 // Maintenu à zéro pour un blocage strict des déviations
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

            console.log("✅ Message DRC (Italique + Anti-Hallucination) envoyé");

        } catch (error) {
            console.error("Erreur :", error.response ? error.response.data : error.message);
        }
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel sur le port ${PORT}`));
