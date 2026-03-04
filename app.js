
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// --- 🌍 1. L'ARCHE (DATABASE_URL INSÉRÉE) ---
// Remplace le texte ci-dessous par ton lien postgres://...
const DATABASE_URL = "TON_LIEN_POSTGRES_ICI";

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- 🧠 2. MÉMOIRE ET PERSISTANCE ---
const memoryFile = path.join(__dirname, 'student_memory.json');
let studentMemory = fs.existsSync(memoryFile) ? JSON.parse(fs.readFileSync(memoryFile, 'utf8')) : {};

const saveMemory = () => {
  try {
    fs.writeFileSync(memoryFile, JSON.stringify(studentMemory, null, 2));
  } catch (e) { console.error("Erreur mémoire"); }
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ✅ SIGNATURE EXACTE : Sans astérisques aux extrémités
const HEADER_MWALIMU = `🔵🟡🔴 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩\n\n---\n\n`;

// --- 📚 3. RÉCUPÉRATION DES DONNÉES (L'ARCHE) ---
async function getArcheData() {
    try {
        const geo = await pool.query('SELECT * FROM drc_geographie').catch(() => ({rows: []}));
        const hist = await pool.query('SELECT * FROM drc_histoire_ancienne').catch(() => ({rows: []}));
        return JSON.stringify({ geographie: geo.rows, histoire: hist.rows });
    } catch (err) {
        return "Arche indisponible";
    }
}

// --- ⏰ 4. RAPPEL QUOTIDIEN ---
cron.schedule('0 6 * * *', async () => {
  for (const id in studentMemory) {
    const prenom = studentMemory[id].profile.name || "Champion";
    const motivation = `${HEADER_MWALIMU}Bonjour ${prenom} ! L'excellence est une habitude. Prêt pour ta leçon ?`;
    try {
      await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp", to: id, text: { body: motivation }
      }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { }
  }
});

// --- 🔍 5. ANALYSE DU PROFIL ---
async function updateStudentProfile(text, from) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Extraire en JSON : name, grade. Si inconnu, null." },
        { role: "user", content: text }
      ],
      temperature: 0
    });
    const data = JSON.parse(res.choices[0].message.content);
    if (data.name) studentMemory[from].profile.name = data.name;
    if (data.grade) studentMemory[from].profile.grade = data.grade;
    saveMemory();
  } catch (e) { }
}

// --- 💬 6. WEBHOOK (INTERACTION LOGIQUE) ---
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
    const msg = body.entry[0].changes[0].value.messages[0];
    const from = msg.from;
    const text = msg.text.body;

    if (!studentMemory[from]) {
      studentMemory[from] = { history: [], profile: { name: null, grade: null } };
    }

    await updateStudentProfile(text, from);
    const arche = await getArcheData();
    const profile = studentMemory[from].profile;

    const systemPrompt = `Tu es Mwalimu EdTech, mentor en RDC.
Élève : ${profile.name || "Ami"}, Classe : ${profile.grade || "Inconnue"}.
ARCHE DU SAVOIR : ${arche}

DIRECTIVES :
1. Si le nom/classe manque, demande-les poliment.
2. Pour la géo, l'histoire et la culture, utilise exclusivement l'Arche.
3. Utilise le tutorat approfondi (explications claires).
4. Réponds avec 🔵, 🟡, 🔴.
5. Garde une suite logique avec les messages précédents.
6. Termine toujours par une question.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: systemPrompt },
            ...studentMemory[from].history.slice(-10),
            { role: "user", content: text }
        ]
      });

      const aiMsg = response.choices[0].message.content;
      studentMemory[from].history.push({ role: "user", content: text }, { role: "assistant", content: aiMsg });
      saveMemory();

      await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp", to: from, text: { body: HEADER_MWALIMU + aiMsg }
      }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });

    } catch (e) { console.error("Erreur API"); }
  }
  res.sendStatus(200);
});

// --- 🚀 7. LANCEMENT ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Mwalimu EdTech prêt sur le port ${PORT}`);
});
