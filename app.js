
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// --- 📚 1. CHARGEMENT DE LA BASE DE DONNÉES RDC ---
const rdcDataPath = path.join(__dirname, 'rdc_data.json');
let rdcData = {};
try {
    rdcData = JSON.parse(fs.readFileSync(rdcDataPath, 'utf8'));
    console.log("✅ Base de données RDC chargée.");
} catch (err) {
    console.error("❌ Erreur rdc_data.json :", err.message);
}

// --- 💾 2. MÉMOIRE DES ÉLÈVES ---
const memoryFile = path.join(__dirname, 'student_memory.json');
let studentMemory = fs.existsSync(memoryFile) ? JSON.parse(fs.readFileSync(memoryFile, 'utf8')) : {};

const saveMemory = () => {
    try {
        fs.writeFileSync(memoryFile, JSON.stringify(studentMemory, null, 2));
    } catch (e) { console.error("Erreur sauvegarde mémoire"); }
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const HEADER_MWALIMU = `_🔵🟡🔴 Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant 🇨🇩_\n---\n`;

// --- ⏰ 3. RAPPEL QUOTIDIEN (06h00) ---
cron.schedule('0 6 * * *', async () => {
    const motivation = `${HEADER_MWALIMU}🔵 *MESSAGE DU MATIN*\n\n🟡 Bonjour champion ! L'excellence est une habitude.\n\n🔴 Es-tu prêt à explorer les richesses de nos 145 territoires aujourd'hui ?`;
    for (const id in studentMemory) {
        try {
            await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                messaging_product: "whatsapp", to: id, type: "text", text: { body: motivation }
            }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
        } catch (e) { console.error(`Échec envoi matinal à ${id}`); }
    }
});

// --- 🧠 4. ANALYSE DU PROFIL (NOM ET CLASSE) ---
async function updateStudentProfile(text, from) {
    // Si on a déjà le nom et la classe, on ne demande plus à l'IA d'extraire pour économiser
    if (studentMemory[from].profile.name && studentMemory[from].profile.grade) return;

    try {
        const res = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "Tu es un extracteur de données. Si l'utilisateur mentionne son nom ou sa classe (ex: 'Je suis Moussa en 6ème'), réponds UNIQUEMENT en JSON: {\"name\": \"...\", \"grade\": \"...\"}. Si rien n'est trouvé, réponds null." },
                { role: "user", content: text }
            ],
            temperature: 0
        });
        const data = JSON.parse(res.choices[0].message.content);
        if (data && data.name) studentMemory[from].profile.name = data.name;
        if (data && data.grade) studentMemory[from].profile.grade = data.grade;
        saveMemory();
    } catch (e) { /* Extraction silencieuse en cas d'échec */ }
}

// --- 📩 5. WEBHOOK WHATSAPP ---
app.post("/webhook", async (req, res) => {
    const body = req.body;
    if (body.entry?.[0].changes?.[0].value.messages) {
        const msg = body.entry[0].changes[0].value.messages[0];
        const from = msg.from;
        const text = msg.text.body;

        // Initialisation si nouvel élève
        if (!studentMemory[from]) {
            studentMemory[from] = { history: [], profile: { name: null, grade: null } };
        }

        await updateStudentProfile(text, from);
        const profile = studentMemory[from].profile;
        studentMemory[from].history.push({ role: "user", content: text });

        // CONSTRUCTION DU CERVEAU DE MWALIMU
        const systemPrompt = `Tu es Mwalimu EdTech, mentor en RDC.
        Élève : ${profile.name || "Cher élève"}, Classe : ${profile.grade || "Inconnue"}.
       
        CONSIGNES :
        - Structure : Utilise 🔵, 🟡, 🔴 au début de chaque paragraphe.
        - Savoir : Puise impérativement dans cette base RDC : ${JSON.stringify(rdcData)}.
        - Pédagogie : Tutorat approfondi. Si tu ne connais pas le nom/classe de l'élève, demande-lui poliment.
        - Quiz : Termine TOUJOURS par une question de quiz sur la RDC adaptée au niveau ${profile.grade}.
        - Style : Ne répète JAMAIS la signature HEADER_MWALIMU (elle est ajoutée automatiquement).`;

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                temperature: 0.7,
                messages: [{ role: "system", content: systemPrompt }, ...studentMemory[from].history.slice(-6)]
            });

            const aiMsg = response.choices[0].message.content;
            studentMemory[from].history.push({ role: "assistant", content: aiMsg });
            saveMemory();

            // ENVOI VERS WHATSAPP
            await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                messaging_product: "whatsapp", to: from, type: "text", text: { body: HEADER_MWALIMU + aiMsg }
            }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });

        } catch (e) {
            console.error("Erreur API OpenAI ou WhatsApp");
        }
    }
    res.sendStatus(200);
});

// --- ⚙️ 6. LANCEMENT DU SERVEUR ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Mwalimu EdTech déployé sur le port ${PORT}`);
});
