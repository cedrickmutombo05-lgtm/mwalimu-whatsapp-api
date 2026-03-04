
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

// ✅ SIGNATURE CORRIGÉE : Pas d'astérisques au début/fin, texte en gras, EdTech avec T majuscule
const HEADER_MWALIMU = `🔵🟡🔴 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩\n\n---\n\n`;

// --- 📚 3. RÉCUPÉRATION DES DONNÉES SQL (L'ARCHE) ---
async function getArcheData() {
    try {
        const parcs = await pool.query('SELECT * FROM drc_parcs_nationaux');
        const infra = await pool.query('SELECT * FROM drc_infrastructures');
        const histoire = await pool.query('SELECT * FROM drc_histoire_ancienne');
        const geographie = await pool.query('SELECT * FROM drc_geographie');
       
        return {
            parcs: parcs.rows,
            infrastructures: infra.rows,
            histoire: histoire.rows,
            geographie: geographie.rows
        };
    } catch (err) {
        console.error("Erreur SQL:", err.message);
        return { error: "Données indisponibles" };
    }
}

// --- ⏰ 4. RAPPEL QUOTIDIEN (CRON) ---
cron.schedule('0 6 * * *', async () => {
  for (const id in studentMemory) {
    const prenom = studentMemory[id].profile.name || "Champion";
    const motivation = `${HEADER_MWALIMU}Bonjour ${prenom} ! 🇨🇩\n\nL'excellence est une habitude. Es-tu prêt à apprendre aujourd'hui ?`;
    try {
      await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp", to: id, text: { body: motivation }
      }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error(`Échec rappel à ${id}`); }
  }
});

// --- 🔍 5. ANALYSE DE PROFIL ---
async function updateStudentProfile(text, from) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Extraire en JSON : name, grade, interest. Si inconnu, mettre null." },
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

// --- 💬 6. LE WEBHOOK WHATSAPP ---
app.post("/webhook", async (req, res) => {
  const body = req.body;
  if (body.entry?.[0]?.changes?.[0]?.value?.messages) {
    const msg = body.entry[0].changes[0].value.messages[0];
    const from = msg.from;
    const text = msg.text.body;

    if (!studentMemory[from]) {
      studentMemory[from] = { history: [], profile: { name: null, grade: null }, mode: "chat" };
    }

    await updateStudentProfile(text, from);
    const profile = studentMemory[from].profile;
    const archeData = await getArcheData();

    if (text.toLowerCase().includes("quiz") || text.toLowerCase().includes("évalue")) {
        studentMemory[from].mode = "quiz";
    }

    const systemPrompt = `Tu es Mwalimu EdTech, mentor expert en RDC.
Élève : ${profile.name || "Inconnu"}, Classe : ${profile.grade || "Inconnue"}.

ARCHE DE SAVOIR (Source OBLIGATOIRE pour Géographie, Histoire, Civisme, Culture) :
${JSON.stringify(archeData)}

CONSIGNES DE FERMETÉ :
1. 🔴 IDENTITÉ : Si l'élève n'est pas identifié, demande poliment son nom et sa classe.
2. 🔵 ARCHE : Ne réponds JAMAIS de tête sur la géo/histoire/civisme/culture. Utilise uniquement l'Arche fournie. Si l'Arche dit que le Haut-Katanga a 6 territoires, c'est la seule vérité.
3. 🟡 PÉDAGOGIE : Tutorat approfondi. Termine toujours par une question pour tester l'élève.
4. STYLE : Structure avec 🔵, 🟡, 🔴.`;

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

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Mwalimu EdTech en ligne sur le port ${PORT}`);
});
