
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// --- 🌍 1. L'ARCHE (CONNEXION DIRECTE) ---
const DATABASE_URL = "TON_LIEN_POSTGRES_ICI";
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- 🧠 2. MÉMOIRE ET PERSISTANCE (SUITE LOGIQUE) ---
const memoryFile = path.join(__dirname, 'student_memory.json');
let studentMemory = fs.existsSync(memoryFile) ? JSON.parse(fs.readFileSync(memoryFile, 'utf8')) : {};

const saveMemory = () => {
  try {
    fs.writeFileSync(memoryFile, JSON.stringify(studentMemory, null, 2));
  } catch (e) { console.error("Erreur sauvegarde mémoire"); }
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const HEADER_MWALIMU = `🔵🟡🔴 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩\n\n---\n\n`;

// --- 📚 3. RÉCUPÉRATION DU SAVOIR (L'ARCHE) ---
async function getArcheData() {
    try {
        const geo = await pool.query('SELECT * FROM drc_geographie');
        const hist = await pool.query('SELECT * FROM drc_histoire_ancienne');
        return JSON.stringify({ geographie: geo.rows, histoire: hist.rows });
    } catch (err) {
        console.error("Erreur SQL Arche:", err.message);
        return "Données indisponibles";
    }
}

// --- ⏰ 4. RAPPEL QUOTIDIEN (CRON) ---
cron.schedule('0 6 * * *', async () => {
  for (const id in studentMemory) {
    const prenom = studentMemory[id].profile.name || "Champion";
    const motivation = `${HEADER_MWALIMU}Bonjour ${prenom} ! Prêt pour une nouvelle leçon sur notre cher pays ?`;
    axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
    { messaging_product: "whatsapp", to: id, text: { body: motivation } },
    { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }).catch(() => {});
  }
});

// --- 🔍 5. ANALYSE ET PROFILAGE ---
async function updateProfile(text, from) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "Extraire JSON : name, grade. Sinon null." }, { role: "user", content: text }],
      temperature: 0
    });
    const data = JSON.parse(res.choices[0].message.content);
    if (data.name) studentMemory[from].profile.name = data.name;
    if (data.grade) studentMemory[from].profile.grade = data.grade;
    saveMemory();
  } catch (e) {}
}

// --- 💬 6. INTERACTION ET TUTORAT APPROFONDI ---
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
    const msg = body.entry[0].changes[0].value.messages[0];
    const from = msg.from;
    const text = msg.text.body;

    if (!studentMemory[from]) {
      studentMemory[from] = { history: [], profile: { name: null, grade: null } };
    }

    await updateProfile(text, from);
    const arche = await getArcheData();
    const profile = studentMemory[from].profile;

    const systemPrompt = `Tu es Mwalimu EdTech, mentor expert en RDC.
Élève : ${profile.name || "Inconnu"}, Classe : ${profile.grade || "Inconnue"}.
ARCHE DU SAVOIR (Priorité Absolue) : ${arche}

DIRECTIVES DE TUTORAT :
1. Si l'info est dans l'Arche (ex: Matadi, Kolwezi), utilise-la strictement.
2. Identité : Demande poliment le nom/classe si manquants.
3. Pédagogie : Explique en profondeur, sois encourageant.
4. Structure : Utilise 🔵 pour le Savoir, 🟡 pour la Pédagogie, 🔴 pour l'Action.
5. Suite Logique : Réfère-toi aux messages précédents de l'élève.
6. Question : Termine toujours par une question pour relancer l'élève.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            { role: "system", content: systemPrompt },
            ...studentMemory[from].history.slice(-10), // Garde les 10 derniers échanges
            { role: "user", content: text }
        ]
      });

      const aiMsg = response.choices[0].message.content;
      studentMemory[from].history.push({ role: "user", content: text }, { role: "assistant", content: aiMsg });
      saveMemory();

      await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to: from, text: { body: HEADER_MWALIMU + aiMsg } },
      { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });

    } catch (e) { console.error("Erreur OpenAI/WhatsApp"); }
  }
  res.sendStatus(200);
});

// --- 🚀 7. LANCEMENT ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Mwalimu opérationnel sur ${PORT}`));
