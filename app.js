
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
const HEADER_MWALIMU = "_🔵🟡🔴 **Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_\n\n---";

// 1. CONNEXION À LA BASE DE DONNÉES (IMAGE 3)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 2. GESTION DE LA MÉMOIRE ÉLÈVE
const memoryFile = path.join(__dirname, 'student_memory.json');
let studentMemory = fs.existsSync(memoryFile) ? JSON.parse(fs.readFileSync(memoryFile, 'utf8')) : {};
const saveMemory = () => fs.writeFileSync(memoryFile, JSON.stringify(studentMemory, null, 2));

// 3. RÉCUPÉRATION DES DONNÉES (DATABASE_URL)
async function getDbData() {
  try {
    const geo = await pool.query('SELECT * FROM drc_geographie');
    const hist = await pool.query('SELECT * FROM drc_histoire_ancienne');
    return JSON.stringify({ geographie: geo.rows, histoire: hist.rows });
  } catch (err) {
    return "Données indisponibles.";
  }
}

// 4. MESSAGE DE RAPPEL À 5H00 JUSTE
cron.schedule('0 5 * * *', async () => {
  for (const chatId in studentMemory) {
    try {
      await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp",
        to: chatId,
        text: { body: `${HEADER_MWALIMU}\n\nBonjour ! Il est 5h. Prêt à découvrir une nouvelle leçon sur la RDC ?` }
      }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur rappel 5h"); }
  }
});

// 5. WEBHOOK META : VÉRIFICATION
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else { res.sendStatus(403); }
});

// 6. TRAITEMENT DES MESSAGES ET TUTORAT APPROFONDI
app.post("/webhook", async (req, res) => {
  const body = req.body;
  const msgObj = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
 
  if (msgObj) {
    const from = msgObj.from;
    const text = msgObj.text.body;
    if (!studentMemory[from]) studentMemory[from] = { history: [], profile: {} };

    const dbContent = await getDbData();
    const systemPrompt = `Tu es Mwalimu Edthec. Mentor expert en RDC.
    DATABASE: ${dbContent}. MISSION: Tutorat approfondi.
    STRUCTURE: 🔵 Savoir, 🟡 Pédagogie, 🔴 Action. Relance toujours.`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }]
      });

      const response = `${HEADER_MWALIMU}\n\n${completion.choices[0].message.content}`;
     
      await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp", to: from, text: { body: response }
      }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });

      studentMemory[from].history.push({ role: "user", content: text }, { role: "assistant", content: response });
      saveMemory();
    } catch (e) { console.error("Erreur Meta/OpenAI"); }
    res.sendStatus(200);
  } else { res.sendStatus(404); }
});

// 7. LANCEMENT SUR PORT RENDER
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Mwalimu actif sur le port ${PORT}`));
