
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const fs = require('fs');

const app = express();
app.use(express.json());

// --- 📚 1. BASE DE DONNÉES RDC (Géo & Histoire uniquement) ---
let rdcData = {};
try {
    if (fs.existsSync('./rdc_data.json')) {
        rdcData = JSON.parse(fs.readFileSync('./rdc_data.json', 'utf8'));
        console.log("✅ Base de données RDC chargée.");
    }
} catch (err) { console.error("❌ Erreur JSON:", err); }

// --- 💾 2. MÉMOIRE PERSISTANTE DES ÉLÈVES ---
const memoryFile = './student_memory.json';
let studentMemory = {};

// Charger la mémoire au démarrage
if (fs.existsSync(memoryFile)) {
    try {
        studentMemory = JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
        console.log("✅ Mémoire des élèves restaurée avec succès.");
    } catch (err) { console.error("❌ Erreur de lecture de la mémoire."); }
}

// Fonction pour sauvegarder la mémoire à chaque message
const saveMemory = () => {
    fs.writeFileSync(memoryFile, JSON.stringify(studentMemory, null, 2));
};

// --- ⚙️ 3. CONFIGURATION ---
const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const phoneId = process.env.PHONE_NUMBER_ID;

// --- 🌟 4. RELANCE DU LUNDI ---
cron.schedule('0 7 * * 1', async () => {
    const messageMotiv = `🔵🟡🔴 _Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant._ 🇨🇩\n---\n🔵 *MOTIVATION DE LA SEMAINE*\n\n🟡 "L'éducation est la clé de notre avenir."\n\n🔴 Que tu sois en train de réviser tes maths ou ta comptabilité OHADA, je suis là pour toi aujourd'hui !`;
    for (const from in studentMemory) {
        try {
            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: messageMotiv }
            }, { headers: { Authorization: `Bearer ${cleanToken}` } });
        } catch (e) { console.error("Erreur relance."); }
    }
});

// --- 📩 5. WEBHOOK : VÉRIFICATION ---
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
        return res.status(200).send(req.query["hub.challenge"]);
    }
    res.sendStatus(403);
});

// --- 📩 6. WEBHOOK : RÉCEPTION ET INTERACTION ---
app.post("/webhook", async (req, res) => {
    const body = req.body;
    if (body.entry?.[0].changes?.[0].value.messages) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const text = msg.text.body;

        const isNewStudent = !studentMemory[from] || studentMemory[from].length === 0;

        if (!studentMemory[from]) studentMemory[from] = [];
        studentMemory[from].push({ role: "user", content: text });
       
        // On garde un historique des 12 derniers échanges pour le contexte
        if (studentMemory[from].length > 12) studentMemory[from].shift();
       
        saveMemory(); // Sauvegarde immédiate après le message de l'élève

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                temperature: 0.2, // Précision maximale
                messages: [
                    {
                        role: "system",
                        content: `RÈGLE ABSOLUE DE SIGNATURE : Commence TOUJOURS par exactement cette phrase et cette ligne :
🔵🟡🔴 _Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant._ 🇨🇩
---

IDENTITÉ : Tu es un PRÉCEPTEUR d'excellence, créé pour le système éducatif Congolais, mais ouvert aux sciences du monde entier.

FORMATAGE STRICT (WHATSAPP) :
- N'utilise JAMAIS de hashtags (#).
- Commence CHAQUE paragraphe par une des boules de notre drapeau (🔵, 🟡, ou 🔴) pour structurer tes idées.
- Utilise le gras (*texte*) pour mettre en évidence les mots importants ou les titres.

TUTORAT ET INTERACTION :
- Si c'est un nouvel élève, fais un accueil chaleureux, présente-toi comme son mentor, et demande son prénom et sa classe.
- MATHÉMATIQUES & DÉPENDANCES : Sois analytique. Donne la formule, détaille les calculs pas à pas.
- SCIENCES & COMPTABILITÉ (OHADA) : Explique clairement, donne des exemples précis.
- GÉOGRAPHIE/HISTOIRE RDC : Utilise EXCLUSIVEMENT : ${JSON.stringify(rdcData)}.
- MONDE/AUTRES : Utilise tes vastes connaissances.

RÈGLE D'OR DE L'ENSEIGNANT : Ne tourne pas en rond. RÉSOUD le problème de l'élève, explique la méthode, puis TERMINE TOUJOURS par une question ou un petit défi pour vérifier s'il a bien assimilé la leçon.`
                    },
                    {
                        role: "system",
                        content: isNewStudent ? "Note : C'est le tout premier message de cet élève. Sois très accueillant et demande son prénom et sa classe." : "Note : Poursuis l'accompagnement en te basant sur l'historique de la conversation."
                    },
                    ...studentMemory[from]
                ]
            });

            const aiResponse = response.choices[0].message.content;
           
            // Enregistrer la réponse du mentor et sauvegarder
            studentMemory[from].push({ role: "assistant", content: aiResponse });
            saveMemory();

            // Envoi WhatsApp
            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: aiResponse }
            }, { headers: { Authorization: `Bearer ${cleanToken}` } });

            res.sendStatus(200);
        } catch (error) { res.sendStatus(500); }
    } else res.sendStatus(200);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Mwalimu EdTech (Version Mémoire Persistante) est en ligne.`));
