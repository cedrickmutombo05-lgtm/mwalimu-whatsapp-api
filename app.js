
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express().use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const HEADER_MWALIMU = "_🔵🟡🔴 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

// 1. ARCHITECTURE DE LA BASE DE DONNÉES (RENFORCÉE)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20, // Capacité de connexions simultanées
  idleTimeoutMillis: 30000
});

// 2. MÉMOIRE PERSISTANTE ET PROFILAGE (SYSTÈME DE FICHIERS)
const memoryPath = path.join(__dirname, 'student_memory.json');
let studentMemory = {};
if (fs.existsSync(memoryPath)) {
  try { studentMemory = JSON.parse(fs.readFileSync(memoryPath, 'utf8')); } catch (e) { studentMemory = {}; }
}
const saveMemory = () => fs.writeFileSync(memoryPath, JSON.stringify(studentMemory, null, 2));

// 3. EXTRACTION INTELLIGENTE DES DONNÉES SQL
async function fetchComprehensiveData() {
  const client = await pool.connect();
  try {
    const geo = await client.query('SELECT * FROM drc_geographie');
    const hist = await client.query('SELECT * FROM drc_histoire_ancienne');
    return { geo: geo.rows, hist: hist.rows };
  } catch (err) {
    console.error("Erreur d'extraction SQL");
    return null;
  } finally { client.release(); }
}

// 4. MOTEUR DE RAPPEL ET DISCIPLINE (5H00 PILE)
cron.schedule('0 5 * * *', async () => {
  const data = await fetchComprehensiveData();
  const prompt = `Génère une pensée matinale motivante et une brève leçon sur la RDC basée sur : ${JSON.stringify(data)}.`;
 
  for (const chatId in studentMemory) {
    try {
      const aiRes = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: "Tu es Mwalimu EdTech. Sois bref et inspirant." }, { role: "user", content: prompt }]
      });
      await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp", to: chatId, text: { body: `${HEADER_MWALIMU}\n\n${aiRes.choices[0].message.content}` }
      }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error(`Rappel échoué pour ${chatId}`); }
  }
}, { timezone: "Africa/Lagos" });

// 5. WEBHOOK : SÉCURITÉ ET VALIDATION META
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else { res.sendStatus(403); }
});

// 6. LOGIQUE DE TUTORAT APPROFONDI ET QUIZ INTERACTIF
app.post("/webhook", async (req, res) => {
  const body = req.body;
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return res.sendStatus(404);

  const from = message.from;
  const userText = message.text.body;

  // Initialisation ou récupération du profil
  if (!studentMemory[from]) {
    studentMemory[from] = { history: [], lastQuiz: null, score: 0 };
  }

  const dbData = await fetchComprehensiveData();
  const systemPrompt = `Tu es Mwalimu EdTech, mentor expert en RDC.
  DATA: ${JSON.stringify(dbData)}.
  MISSION: Tutorat approfondi. Ne JAMAIS utiliser les mots "Savoir" ou "Pédagogie".
  METHODE: 1. Analyse la question. 2. Explique en profondeur avec 🔵, 🟡, 🔴.
  3. Si l'élève répond à un quiz précédent, valide sa réponse.
  4. Termine TOUJOURS par une question de quiz (A, B, C) pour tester sa compréhension.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...studentMemory[from].history.slice(-5),
        { role: "user", content: userText }
      ]
    });

    const mwalimuReply = completion.choices[0].message.content;
   
    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp", to: from, text: { body: `${HEADER_MWALIMU}\n\n${mwalimuReply}` }
    }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });

    studentMemory[from].history.push({ role: "user", content: userText }, { role: "assistant", content: mwalimuReply });
    saveMemory();
  } catch (error) { console.error("Erreur Flux :"); }
  res.sendStatus(200);
});

// 7. SURVEILLANCE ET LANCEMENT (PORT RENDER)
const PORT = process.env.PORT || 10000;
const server = app.listen(PORT, () => {
  console.log(`🚀 Mwalimu EdTech : Système renforcé actif sur le port ${PORT}`);
});

// Gestion des arrêts propres
process.on('SIGTERM', () => {
  saveMemory();
  server.close(() => process.exit(0));
});
