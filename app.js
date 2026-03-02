
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

// --- 🌟 3. RELANCE DU LUNDI (POUR TOUS LES ÉLÈVES EN MÉMOIRE) ---
cron.schedule('0 7 * * 1', async () => {
    const motiv = `*🔵🟡🔴 Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant.* 🇨🇩\n---\n🔵 *MOTIVATION DU LUNDI*\n\n🟡 "La force de notre pays réside dans ton savoir-faire."\n\n🔴 Es-tu prêt à relever les défis de cette semaine ? Je suis là pour t'accompagner !`;
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

// --- 📩 4. LOGIQUE TUTORAT (TEMPÉRATURE 0) ---
app.post("/webhook", async (req, res) => {
    const body = req.body;
    if (body.entry?.[0].changes?.[0].value.messages) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const text = msg.text.body;

        // Initialisation si nouvel élève
        if (!studentMemory[from]) {
            studentMemory[from] = { history: [], profile: { name: "Inconnu", grade: "Inconnue" } };
        }
       
        studentMemory[from].history.push({ role: "user", content: text });
        if (studentMemory[from].history.length > 20) studentMemory[from].history.shift();
        saveMemory();

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                temperature: 0, // PRÉCISION ABSOLUE DEMANDÉE
                messages: [
                    { role: "system", content: `IDENTITÉ : Tu es Mwalimu EdTech.
                    PROFIL ÉLÈVE : Si le nom ou la classe est inconnu (${JSON.stringify(studentMemory[from].profile)}), demande-les poliment.
                    HONNÊTETÉ : Interdiction formelle de mentir. Si l'info n'est pas dans rdc_data.json, admets que tu ne sais pas. Mentir déshonore EdTech.
                    BASE RDC : ${JSON.stringify(rdcData)}.
                    SIGNATURE : *🔵🟡🔴 Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant.* 🇨🇩
                    ---
                    FORMATAGE : Pas de "#". Gras pour l'emphase. Structure en 🔵, 🟡, 🔴.` },
                    ...studentMemory[from].history
                ]
            });

            const aiResponse = response.choices[0].message.content;
            studentMemory[from].history.push({ role: "assistant", content: aiResponse });
            saveMemory();

            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: aiResponse }
            }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (e) {
            console.error("Erreur OpenAI ou WhatsApp");
        }
    }
    res.sendStatus(200);
});

app.listen(process.env.PORT || 10000);
