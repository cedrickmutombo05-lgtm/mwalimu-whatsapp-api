
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron'); // <--- Restauré
const fs = require('fs');

const app = express();
app.use(express.json());

// --- 📚 1. CHARGEMENT DE LA BASE DE DONNÉES RDC ---
let rdcData = {};
try {
    if (fs.existsSync('./rdc_data.json')) {
        rdcData = JSON.parse(fs.readFileSync('./rdc_data.json', 'utf8'));
        console.log("✅ Base de données RDC connectée.");
    }
} catch (err) { console.error("❌ Erreur JSON:", err); }

// --- ⚙️ 2. CONFIGURATION DES CLÉS ---
const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const phoneId = process.env.PHONE_NUMBER_ID;
const studentMemory = {};

// --- 🌟 3. RELANCE AUTOMATIQUE DU LUNDI (07:00 AM) ---
// Cette fonction parcourt les élèves actifs pour les motiver
cron.schedule('0 7 * * 1', async () => {
    const messageMotiv = `🔵🟡🔴 _Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant._ 🇨🇩\n---\n🌟 *MOTIVATION DU LUNDI* 🌟\n\n"Le succès est la somme de petits efforts répétés jour après jour."\n\nPrêt pour une nouvelle semaine d'apprentissage en Maths, SVT ou Anglais ? Que révisons-nous aujourd'hui ?`;
    for (const from in studentMemory) {
        try {
            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: messageMotiv }
            }, { headers: { Authorization: `Bearer ${cleanToken}` } });
        } catch (e) { console.error("Erreur lors de la relance auto."); }
    }
});

// --- 📩 4. WEBHOOK : VÉRIFICATION FACEBOOK ---
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
        return res.status(200).send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

// --- 📩 5. WEBHOOK : RÉCEPTION ET TUTORAT MULTIDISCIPLINAIRE ---
app.post("/webhook", async (req, res) => {
    const body = req.body;
    if (body.entry?.[0].changes?.[0].value.messages) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const text = msg.text.body;

        // Gestion de la mémoire
        if (!studentMemory[from]) studentMemory[from] = [];
        studentMemory[from].push({ role: "user", content: text });
        if (studentMemory[from].length > 10) studentMemory[from].shift();

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                temperature: 0.2, // Précision maximale pour les sciences et maths
                messages: [
                    {
                        role: "system",
                        content: `RÈGLE DE SIGNATURE : Commence TOUJOURS tes réponses par :
🔵🟡🔴 _Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant._ 🇨🇩
---

IDENTITÉ : Tu es un PRÉCEPTEUR expert multidisciplinaire pour les élèves de la RDC.

CHAMPS D'EXPERTISE :
1. MATHÉMATIQUES : Résolution étape par étape.
2. SVT & SCIENCES : Explications claires des phénomènes naturels.
3. ANGLAIS : Traduction et grammaire.
4. GÉOGRAPHIE/HISTO RDC : Utilise obligatoirement ces données : ${JSON.stringify(rdcData)}.

MISSION DE PRÉCEPTEUR :
- Ne tourne pas en rond. DONNE la solution ou l'explication complète immédiatement.
- Explique la méthode comme un professeur particulier.
- Demande la classe de l'élève s'il ne l'a pas donnée.
- Termine par une question de vérification ou un défi de logique.`
                    },
                    ...studentMemory[from]
                ]
            });

            const aiResponse = response.choices[0].message.content;
           
            // Sauvegarde de la réponse de l'assistant dans la mémoire
            studentMemory[from].push({ role: "assistant", content: aiResponse });

            // Envoi vers WhatsApp
            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: aiResponse }
            }, { headers: { Authorization: `Bearer ${cleanToken}` } });

            res.sendStatus(200);
        } catch (error) {
            console.error("Erreur API");
            res.sendStatus(500);
        }
    } else res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Mwalimu est opérationnel sur toutes les matières.`));
