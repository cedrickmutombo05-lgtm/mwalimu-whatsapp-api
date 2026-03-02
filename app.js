
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const fs = require('fs');

const app = express();
app.use(express.json());

// --- 📚 1. CHARGEMENT BASE COMPACTE ---
let rdcData = {};
if (fs.existsSync('./rdc_data.json')) {
    rdcData = JSON.parse(fs.readFileSync('./rdc_data.json', 'utf8'));
}

// --- 💾 2. MÉMOIRE PERSISTANTE ---
const memoryFile = './student_memory.json';
let studentMemory = {};
if (fs.existsSync(memoryFile)) {
    studentMemory = JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
}
const saveMemory = () => fs.writeFileSync(memoryFile, JSON.stringify(studentMemory, null, 2));

// --- ⚙️ 3. CONFIGURATION ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const phoneId = process.env.PHONE_NUMBER_ID;
const token = process.env.TOKEN;

// --- 🌟 4. RELANCE DU LUNDI (POUR TOUS LES ÉLÈVES) ---
cron.schedule('0 7 * * 1', async () => {
    const motiv = `*🔵🟡🔴 Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant.* 🇨🇩\n---\n🔵 *MOTIVATION DU LUNDI*\n\n🟡 "La force de notre pays réside dans ton savoir-faire."\n\n🔴 Es-tu prêt à relever les défis de cette semaine ? Je suis là pour t'accompagner !`;
   
    // On boucle sur TOUS les numéros enregistrés en mémoire
    for (const studentId in studentMemory) {
        try {
            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: studentId, type: "text", text: { body: motiv }
            }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (e) {
            console.log(`Erreur d'envoi pour ${studentId}`);
        }
    }
});

// --- 📩 5. LOGIQUE TUTORAT ---
app.post("/webhook", async (req, res) => {
    const body = req.body;
    if (body.entry?.[0].changes?.[0].value.messages) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const text = msg.text.body;

        if (!studentMemory[from]) studentMemory[from] = [];
        studentMemory[from].push({ role: "user", content: text });
        if (studentMemory[from].length > 15) studentMemory[from].shift();
        saveMemory();

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                temperature: 0.3, // Plus fluide mais reste précis
                messages: [
                    { role: "system", content: `IDENTITÉ : Tu es Mwalimu EdTech (avec un T majuscule).
                    PRÉCISION ABSOLUE : Tu as l'interdiction formelle de mentir ou d'inventer des faits. Si une information n'est pas dans rdc_data.json, dis que tu vas approfondir tes recherches. Mentir déshonore l'éducation nationale.
                    STYLE : Chaleureux, détaillé, patriotique et inspirant.
                    SIGNATURE : Commence TOUJOURS par : *🔵🟡🔴 Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant.* 🇨🇩
                    ---
                    FORMATAGE : Pas de "#". Gras pour l'emphase. Structure en 🔵, 🟡, 🔴.
                    BASE DE DONNÉES : ${JSON.stringify(rdcData)}.` },
                    ...studentMemory[from]
                ]
            });

            const aiResponse = response.choices[0].message.content;
            studentMemory[from].push({ role: "assistant", content: aiResponse });
            saveMemory();

            await axios.post(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: aiResponse }
            }, { headers: { Authorization: `Bearer ${token}` } });
        } catch (e) {}
    }
    res.sendStatus(200);
});

app.listen(process.env.PORT || 10000);
