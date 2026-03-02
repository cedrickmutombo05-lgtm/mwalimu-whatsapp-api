
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const fs = require('fs');

const app = express();
app.use(express.json());

// --- 📚 1. CHARGEMENT DE TA BASE DE DONNÉES ---
const rdcData = JSON.parse(fs.readFileSync('./rdc_data.json', 'utf8'));

// --- 💾 2. MÉMOIRE DES ÉLÈVES ---
const memoryFile = './student_memory.json';
let studentMemory = fs.existsSync(memoryFile) ? JSON.parse(fs.readFileSync(memoryFile, 'utf8')) : {};
const saveMemory = () => fs.writeFileSync(memoryFile, JSON.stringify(studentMemory, null, 2));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const HEADER_MWALIMU = `_🔵🟡🔴 Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant 🇨🇩_\n---\n`;

// --- ⏰ 3. MESSAGE DE RAPPEL QUOTIDIEN (06h00 du matin) ---
cron.schedule('0 6 * * *', async () => {
    const motivation = `${HEADER_MWALIMU}🔵 *MESSAGE DU MATIN*\n\n🟡 Bonjour champion ! L'excellence est une habitude. \n\n🔴 Es-tu prêt à apprendre quelque chose de nouveau aujourd'hui pour construire le Congo de demain ?`;
    for (const id in studentMemory) {
        try {
            await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                messaging_product: "whatsapp", to: id, type: "text", text: { body: motivation }
            }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
        } catch (e) { console.error("Échec envoi matinal"); }
    }
});

// --- 🧠 4. ANALYSE DU PROFIL ---
async function updateStudentProfile(text, from) {
    try {
        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: "Extrais nom et classe en JSON: {\"name\": \"...\", \"grade\": \"...\"}. Sinon null." }, { role: "user", content: text }],
            temperature: 0
        });
        const data = JSON.parse(res.choices[0].message.content);
        if (data.name) studentMemory[from].profile.name = data.name;
        if (data.grade) studentMemory[from].profile.grade = data.grade;
        saveMemory();
    } catch (e) {}
}

// --- 📩 5. WEBHOOK ---
app.post("/webhook", async (req, res) => {
    const body = req.body;
    if (body.entry?.[0].changes?.[0].value.messages) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const text = msg.text.body;

        if (!studentMemory[from]) studentMemory[from] = { history: [], profile: { name: null, grade: null } };

        await updateStudentProfile(text, from);
        const profile = studentMemory[from].profile;
        studentMemory[from].history.push({ role: "user", content: text });

        const systemPrompt = `Tu es Mwalimu EdTech. Élève : ${profile.name || "Ami"}, Classe : ${profile.grade || "Inconnue"}.
        CONSIGNES :
        - Utilise les boules 🔵, 🟡, 🔴 pour structurer chaque paragraphe.
        - Adapte ton niveau à la classe : ${profile.grade}.
        - Puise tes infos ICI : ${JSON.stringify(rdcData)}.
        - Termine TOUJOURS par une question de quiz adaptée au niveau ${profile.grade}.
        - Ne répète JAMAIS l'en-tête (signature).`;

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                temperature: 0,
                messages: [{ role: "system", content: systemPrompt }, ...studentMemory[from].history.slice(-10)]
            });

            const aiMsg = response.choices[0].message.content;
            studentMemory[from].history.push({ role: "assistant", content: aiMsg });
            saveMemory();

            await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: HEADER_MWALIMU + aiMsg }
            }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
        } catch (e) { console.error("Erreur"); }
    }
    res.sendStatus(200);
});

app.listen(process.env.PORT || 10000);
