
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const fs = require('fs'); // Outil indispensable pour lire ton fichier JSON

const app = express();
app.use(express.json());

// --- 📚 CHARGEMENT DE LA BASE DE DONNÉES RDC ---
let rdcData = {};
try {
    // On vérifie si le fichier existe avant de le lire
    if (fs.existsSync('./rdc_data.json')) {
        const rawData = fs.readFileSync('./rdc_data.json', 'utf8');
        rdcData = JSON.parse(rawData);
        console.log("✅ Base de données RDC connectée avec succès au cerveau de Mwalimu.");
    } else {
        console.log("⚠️ Attention : rdc_data.json est introuvable sur le serveur.");
    }
} catch (err) {
    console.error("❌ Erreur lors de la lecture de la base de données :", err);
}

// Configuration des clés API sécurisées
const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const phoneId = process.env.PHONE_NUMBER_ID;

// Mémoire pour les conversations (maximum 10 messages par élève)
const studentMemory = {};

// --- 🌟 RELANCE AUTOMATIQUE DU LUNDI (07h00) ---
cron.schedule('0 7 * * 1', async () => {
    const messageMotiv = `🔵🟡🔴 _Je suis Mwalimu Edthec, ton mentor._ 🇨🇩\n---\n🌟 *MOTIVATION DU LUNDI* 🌟\n\n"Chaque petit pas compte, commence par une seule page aujourd'hui."\n\nLe Congo compte sur ton intelligence. Qu'as-tu prévu d'apprendre cette semaine ?`;
    for (const from in studentMemory) {
        try {
            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: messageMotiv }
            }, { headers: { Authorization: `Bearer ${cleanToken}` } });
        } catch (e) { console.error("Erreur lors de la relance automatique"); }
    }
});

// --- 📩 CONFIGURATION DU WEBHOOK ---
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
                       
                        RÈGLE D'OR : Chaque message commence par la signature exacte de Mwalimu.
                       
                        SOURCE DE VÉRITÉ (Utilise ces données en priorité pour éviter d'halluciner) :
                        ${JSON.stringify(rdcData)}
                       
                        INSTRUCTIONS DE TUTORAT :
                        1. Ne donne jamais la réponse brute. Pose des questions pour faire réfléchir.
                        2. Si l'information n'est pas dans le JSON ci-dessus, sois extrêmement prudent.
                        3. Utilise des exemples congolais concrets (marchés, fleuve, mines).
                        4. Termine obligatoirement par un "DÉFI DE LOGIQUE" 🧩💡🧠.
                        5. Demande la classe de l'élève s'il ne l'a pas donnée.`
                    },
                    ...studentMemory[from]
                ],
                temperature: 0 // <--- RIGUEUR TOTALE POUR ÉVITER LES INVENTIONS
            });

            const aiResponse = response.choices[0].message.content;

            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: aiResponse }
            }, { headers: { Authorization: `Bearer ${cleanToken}` } });

            res.sendStatus(200);
        } catch (error) {
            console.error("Erreur OpenAI ou WhatsApp");
            res.sendStatus(500);
        }
    } else { res.sendStatus(200); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Mwalimu prêt et connecté à sa Database sur le port ${PORT}`));
