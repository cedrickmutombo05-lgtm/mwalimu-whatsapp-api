
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const fs = require('fs');

const app = express();
app.use(express.json());

// --- 📚 1. CHARGEMENT BASE RDC (Provinces, Biefs, Parcs, Histoire) ---
let rdcData = {};
if (fs.existsSync('./rdc_data.json')) {
    rdcData = JSON.parse(fs.readFileSync('./rdc_data.json', 'utf8'));
}

// --- 💾 2. MÉMOIRE DES ÉLÈVES (Nom, Classe, Historique) ---
const memoryFile = './student_memory.json';
let studentMemory = {};
if (fs.existsSync(memoryFile)) {
    studentMemory = JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
}
const saveMemory = () => fs.writeFileSync(memoryFile, JSON.stringify(studentMemory, null, 2));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const phoneId = process.env.PHONE_NUMBER_ID;
const token = process.env.TOKEN;

// --- 🏷️ 3. L'EN-TÊTE VERROUILLÉ (ITALIQUE + BOULES + DRAPEAU À LA FIN) ---
const HEADER_MWALIMU = `_🔵🟡🔴 Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant 🇨🇩_\n---\n`;

// --- 🌟 4. RELANCE DU LUNDI (POUR TOUS LES ÉLÈVES) ---
cron.schedule('0 7 * * 1', async () => {
    const motiv = `${HEADER_MWALIMU}🔵 *MOTIVATION DU LUNDI*\n\n🟡 "La force de notre pays réside dans ton savoir-faire."\n\n🔴 Es-tu prêt à relever les défis de cette semaine ?`;
    for (const studentId in studentMemory) {
        try {
            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: studentId, type: "text", text: { body: motiv }
            }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (e) {
            console.log(`Erreur relance pour ${studentId}`);
        }
    }
});

// --- 📩 5. LOGIQUE TUTORAT (TEMPÉRATURE 0 + PROTECTION EN-TÊTE) ---
app.post("/webhook", async (req, res) => {
    const body = req.body;
    if (body.entry?.[0].changes?.[0].value.messages) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const text = msg.text.body;

        if (!studentMemory[from]) {
            studentMemory[from] = { history: [], profile: { name: "Inconnu", grade: "Inconnue" } };
        }
       
        studentMemory[from].history.push({ role: "user", content: text });
        if (studentMemory[from].history.length > 20) studentMemory[from].history.shift();
        saveMemory();

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                temperature: 0, // PRÉCISION MAXIMALE
                messages: [
                    { role: "system", content: `Tu es le cerveau de Mwalimu EdTech.
                    IMPORTANT : Ne réécris JAMAIS l'en-tête (🔵🟡🔴 Je suis Mwalimu...), il est ajouté automatiquement par le système.
                    IDENTITÉ : Si tu ne connais pas le nom ou la classe (${JSON.stringify(studentMemory[from].profile)}), demande-les.
                    DONNÉES RDC : ${JSON.stringify(rdcData)}.
                    STYLE : Structure avec 🔵, 🟡, 🔴. Pas de "#". Gras pour l'emphase. Ne mens jamais.` },
                    ...studentMemory[from].history
                ]
            });

            const aiRawResponse = response.choices[0].message.content;
           
            // FUSION SYSTÉMATIQUE DU HEADER ET DE LA RÉPONSE
            const finalMessage = HEADER_MWALIMU + aiRawResponse;

            studentMemory[from].history.push({ role: "assistant", content: aiRawResponse });
            saveMemory();

            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: finalMessage }
            }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (e) {
            console.error("Erreur Webhook");
        }
    }
    res.sendStatus(200);
});

app.listen(process.env.PORT || 10000);
