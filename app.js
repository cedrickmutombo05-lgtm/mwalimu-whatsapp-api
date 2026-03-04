
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// --- 🌍 1. CONNEXION À L'ARCHE (RENDER POSTGRES) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// --- 🧠 2. MÉMOIRE ET PERSISTANCE ---
const memoryFile = path.join(__dirname, 'student_memory.json');
let studentMemory = fs.existsSync(memoryFile) ? JSON.parse(fs.readFileSync(memoryFile, 'utf8')) : {};

const saveMemory = () => {
  try {
    fs.writeFileSync(memoryFile, JSON.stringify(studentMemory, null, 2));
  } catch (e) { console.error("Erreur sauvegarde mémoire"); }
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const HEADER_MWALIMU = `_***🔵🟡🔴 Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant 🇨🇩***_\n\n---\n\n`;

// --- 📚 3. RÉCUPÉRATION DES DONNÉES SQL (L'ARCHE) ---
async function getArcheData() {
    try {
        const parcs = await pool.query('SELECT * FROM drc_parcs_nationaux');
        const infra = await pool.query('SELECT * FROM drc_infrastructures');
        const histoire = await pool.query('SELECT * FROM drc_histoire_ancienne');
        return { parcs: parcs.rows, infrastructures: infra.rows, histoire: histoire.rows };
    } catch (err) {
        console.error("Erreur SQL:", err.message);
        return { error: "Données indisponibles" };
    }
}

// --- ⏰ 4. RAPPEL QUOTIDIEN (CRON) ---
// Se déclenche chaque matin à 06h00
cron.schedule('0 6 * * *', async () => {
  console.log("🌞 Envoi des messages de motivation matinale...");
  const archeData = await getArcheData();
 
  for (const id in studentMemory) {
    const profile = studentMemory[id].profile;
    const prenom = profile.name || "Champion";
   
    const motivation = `${HEADER_MWALIMU}Bonjour ${prenom} ! 🇨🇩\n\nL'excellence est une habitude, pas un acte. Es-tu prêt à découvrir un nouveau secret de notre beau pays aujourd'hui ?\n\n*Astuce du jour :* Savais-tu que le Parc des Virunga est le plus vieux d'Afrique ?`;

    try {
      await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp",
        to: id,
        type: "text",
        text: { body: motivation }
      }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) {
      console.error(`Échec envoi matinal à ${id}`);
    }
  }
});

// --- 🔍 5. ANALYSE DE PROFIL ET ÉVOLUTION ---
async function updateStudentProfile(text, from) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Extraire en JSON : name, grade, interest (histoire/geographie). Si inconnu, mettre null." },
        { role: "user", content: text }
      ],
      temperature: 0
    });
    const data = JSON.parse(res.choices[0].message.content);
    if (data.name) studentMemory[from].profile.name = data.name;
    if (data.grade) studentMemory[from].profile.grade = data.grade;
    if (data.interest) studentMemory[from].profile.interest = data.interest;
    saveMemory();
  } catch (e) { /* Silencieux */ }
}

// --- 💬 6. LE WEBHOOK WHATSAPP (L'INTELLIGENCE) ---
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
    const msg = body.entry[0].changes[0].value.messages[0];
    const from = msg.from;
    const text = msg.text.body;

    if (!studentMemory[from]) {
      studentMemory[from] = {
        history: [],
        profile: { name: null, grade: null, interest: null, score: 0 },
        mode: "chat"
      };
    }

    await updateStudentProfile(text, from);
    const profile = studentMemory[from].profile;
    const archeData = await getArcheData();

    if (text.toLowerCase().includes("quiz") || text.toLowerCase().includes("évalue-moi")) {
        studentMemory[from].mode = "quiz";
    }

    const systemPrompt = `Tu es Mwalimu Edthec, mentor expert en RDC.
Élève : ${profile.name || "Ami"}, Grade : ${profile.grade || "Inconnu"}.
DONNÉES SQL RÉELLES (L'ARCHE) : ${JSON.stringify(archeData)}

MODE ACTUEL : ${studentMemory[from].mode}

DIRECTIVES :
1. Si mode QUIZ : Pose UNE question précise basée sur les données SQL. Si l'élève répond, utilise le TUTORAT APPROFONDI pour expliquer pourquoi c'est juste ou faux.
2. Si mode CHAT : Réponds avec sagesse. Structure avec 🔵, 🟡, 🔴.
3. Toujours encourager l'excellence pour un "DRC brillant".
4. Ne jamais répéter la signature HEADER_MWALIMU.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "system", content: systemPrompt }, ...studentMemory[from].history.slice(-6), { role: "user", content: text }]
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
  console.log(`🚀 Mwalimu Edthec est en ligne sur le port ${PORT}`);
});
