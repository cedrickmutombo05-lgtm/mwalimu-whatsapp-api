
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');

const app = express();
app.use(express.json());

const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const phoneId = process.env.PHONE_NUMBER_ID;

const studentMemory = {};

// --- 🌟 RELANCE AUTOMATIQUE DU LUNDI (07h00) ---
cron.schedule('0 7 * * 1', async () => {
    const messageMotiv = `🔵🟡🔴 _Je suis Mwalimu Edthec, ton mentor._ 🇨🇩\n---\n🌟 *MOTIVATION DU LUNDI* 🌟\n\n"Chaque petit pas compte, commence par une seule page aujourd'hui."\n\nLe Congo compte sur ton intelligence. Qu'as-tu prévu d'apprendre cette semaine ?`;
    for (const from in studentMemory) {
        try {
            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: messageMotiv }
            }, { headers: { Authorization: `Bearer ${cleanToken}` } });
        } catch (e) { console.error("Erreur relance"); }
    }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
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
                        content: `Tu es Mwalimu EdTech, mentor pour un DRC brillant.
                        RÈGLE D'OR : Chaque message commence par : 🔵🟡🔴 _Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant._ 🇨🇩\n---
                        INSTRUCTIONS :
                        1. TUTORAT : Ne donne jamais la réponse brute. Explique le "Pourquoi".
                        2. CONTEXTE : Utilise des exemples de la RDC (climat, mines, fleuve, marchés de Kinshasa/Lubumbashi).
                        3. PRÉCISION : Sois factuel. Ne pas inventer de noms de communes ou de faits historiques.
                        4. DÉFI DE LOGIQUE : Termine obligatoirement par un "DÉFI DE LOGIQUE" avec les émojis 🧩, 💡, 🧠.
                        5. CLASSE : Demande toujours la classe de l'élève au début.`
                    },
                    ...studentMemory[from]
                ],
                temperature: 0
            });

            const aiResponse = response.choices[0].message.content;

            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: aiResponse }
            }, { headers: { Authorization: `Bearer ${cleanToken}` } });

            res.sendStatus(200);
        } catch (error) { res.sendStatus(500); }
    } else { res.sendStatus(200); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Mwalimu prêt sur le port ${PORT}`));
