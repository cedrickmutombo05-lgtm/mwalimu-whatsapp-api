
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// Tes réglages d'origine
const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- LA SEULE AJOUT : LA MÉMOIRE ---
const studentMemory = {};

app.get("/", (req, res) => res.send("Diagnostic MWALIMU actif ✅"));

app.get("/webhook", (req, res) => {
    if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
        return res.status(200).send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
    console.log("---------------------------------------");
    console.log("📥 OBJET REÇU DE META : ", JSON.stringify(req.body, null, 2));

    const body = req.body;
    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const text = msg.text.body;

        // On enregistre le message dans la mémoire
        if (!studentMemory[from]) { studentMemory[from] = []; }
        studentMemory[from].push({ role: "user", content: text });
        if (studentMemory[from].length > 8) { studentMemory[from].shift(); }

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: process.env.SYSTEM_PROMPT }, //
                    ...studentMemory[from] // On ajoute l'historique ici
                ],
                temperature: 0
            });

            const aiResponse = response.choices[0].message.content;
            studentMemory[from].push({ role: "assistant", content: aiResponse });

            // On utilise l'ID qui vient DIRECTEMENT du message Meta (plus d'erreur 'undefined')
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

            console.log("✅ Réponse envoyée");

        } catch (error) {
            console.error("Erreur :", error.response ? error.response.data : error.message);
        }
    }
    res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel sur le port ${PORT}`));
