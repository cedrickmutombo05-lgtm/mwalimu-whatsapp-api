
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const fs = require('fs');

const app = express();
app.use(express.json());

// --- 📚 CHARGEMENT DE LA BASE DE DONNÉES RDC ---
let rdcData = {};
try {
    if (fs.existsSync('./rdc_data.json')) {
        const rawData = fs.readFileSync('./rdc_data.json', 'utf8');
        rdcData = JSON.parse(rawData);
        console.log("✅ Base de données RDC chargée avec succès.");
    } else {
        console.log("⚠️ Attention: rdc_data.json manquant.");
    }
} catch (err) {
    console.error("❌ Erreur de lecture du fichier JSON:", err);
}

// Configuration des Variables d'Environnement
const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const phoneId = process.env.PHONE_NUMBER_ID;
const verifyToken = process.env.VERIFY_TOKEN;

// Mémoire des discussions par élève
const studentMemory = {};

// --- 🌟 RELANCE AUTOMATIQUE DU LUNDI (07:00 AM) ---
cron.schedule('0 7 * * 1', async () => {
    const messageMotiv = `🔵🟡🔴 _Je suis Mwalimu Edthec, ton mentor._ 🇨🇩\n---\n🌟 *MOTIVATION* 🌟\n\n"Le succès est la somme de petits efforts répétés jour après jour."\n\nPrêt pour une nouvelle semaine d'apprentissage ?`;
    for (const from in studentMemory) {
        try {
            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: messageMotiv }
            }, { headers: { Authorization: `Bearer ${cleanToken}` } });
        } catch (e) { console.error("Erreur lors de la relance auto."); }
    }
});

// --- 📩 WEBHOOK : VÉRIFICATION FACEBOOK ---
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === verifyToken) {
        return res.status(200).send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

// --- 📩 WEBHOOK : RÉCEPTION DES MESSAGES ---
app.post("/webhook", async (req, res) => {
    const body = req.body;

    if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const text = msg.text.body;

        // Gestion de la mémoire (Historique de 10 messages max)
        if (!studentMemory[from]) { studentMemory[from] = []; }
        studentMemory[from].push({ role: "user", content: text });
        if (studentMemory[from].length > 10) { studentMemory[from].shift(); }

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `RÈGLE CRITIQUE : Commence TOUJOURS ta réponse exactement par cette ligne :
                        🔵🟡🔴 _Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant._ 🇨🇩
                        ---

                        IDENTITÉ : Tu es Mwalimu EdTech, un tuteur expert de la RDC.
                        TON RÔLE : Faire du tutorat approfondi. Ne donne jamais la réponse directement, pose des questions pour faire réfléchir l'élève.
                       
                        SOURCE DE DONNÉES (Utilise uniquement cela pour les faits) :
                        ${JSON.stringify(rdcData)}
                       
                        CONSIGNES :
                        - Demande toujours la classe de l'élève s'il ne l'a pas précisée.
                        - Sois sérieux, direct et encourageant.
                        - Utilise les noms des provinces et rivières du fichier JSON.`
                    },
                    ...studentMemory[from]
                ],
                temperature: 0
            });

            const aiResponse = response.choices[0].message.content;

            // Envoi de la réponse sur WhatsApp
            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: aiResponse }
            }, { headers: { Authorization: `Bearer ${cleanToken}` } });

            res.sendStatus(200);
        } catch (error) {
            console.error("Erreur API OpenAI ou WhatsApp");
            res.sendStatus(500);
        }
    } else {
        res.sendStatus(200);
    }
});

// Lancement du serveur
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Mwalimu EdTech est prêt sur le port ${PORT}`));
