 
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
const HEADER_MWALIMU = "_***🔵🟡🔴 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩***_";

// 1. CONNEXION SQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 2. MÉMOIRE RÉSISTANTE (IDENTIFICATION UNIQUE)
const memoryPath = path.join(__dirname, 'student_memory.json');
let studentMemory = fs.existsSync(memoryPath) ? JSON.parse(fs.readFileSync(memoryPath, 'utf8')) : {};

const saveMemory = () => {
    fs.writeFileSync(memoryPath, JSON.stringify(studentMemory, null, 2));
};

// 3. RÉCUPÉRATION DES DONNÉES
async function getDbData() {
  try {
    const geo = await pool.query('SELECT * FROM drc_geographie');
    const hist = await pool.query('SELECT * FROM drc_histoire_ancienne');
    return JSON.stringify({ geo: geo.rows, hist: hist.rows });
  } catch (err) { return "Données indisponibles."; }
}

// 4. RAPPEL DE 5H00 PILE
cron.schedule('0 5 * * *', async () => {
  for (const chatId in studentMemory) {
    const profile = studentMemory[chatId].profile;
    if (profile.name) {
      const msg = `${HEADER_MWALIMU}\n\nBonjour ${profile.name} ! Il est 5h00. Ton précepteur est prêt. Qu'allons-nous découvrir ensemble aujourd'hui ?`;
      try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
          messaging_product: "whatsapp", to: chatId, text: { body: msg }
        }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });
      } catch (e) { console.error("Erreur rappel"); }
    }
  }
}, { timezone: "Africa/Lagos" });

// 5. WEBHOOK META
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else { res.sendStatus(403); }
});

// 6. LOGIQUE DE PRÉCEPTEUR (RÈGLE D'OR : UNE SEULE FOIS)
app.post("/webhook", async (req, res) => {
  const body = req.body;
  const msgObj = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msgObj) return res.sendStatus(404);

  const from = msgObj.from;
  const text = msgObj.text.body;

  if (!studentMemory[from]) {
    studentMemory[from] = { profile: { name: null, grade: null, location: null }, history: [] };
  }

  let profile = studentMemory[from].profile;

  // --- ÉTAPE 1 : SI LE PROFIL EST INCOMPLET ---
  if (!profile.name || !profile.grade || !profile.location) {
    const aiCheck = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: `L'élève dit: "${text}". Extrais Nom, Classe, Ville en JSON: {"name": "...", "grade": "...", "location": "..."}. Si absent, mets null.` }]
    });

    try {
      const found = JSON.parse(aiCheck.choices[0].message.content);
      if (found.name) profile.name = found.name;
      if (found.grade) profile.grade = found.grade;
      if (found.location) profile.location = found.location;
      saveMemory();
    } catch (e) {}

    // Pose la question manquante UNIQUE
    let reply = "";
    if (!profile.name) reply = "Bienvenue ! Je suis Mwalimu EdTech, ton précepteur. Pour commencer, quel est ton nom ? Je suis là pour toi.";
    else if (!profile.grade) reply = `Enchanté ${profile.name} ! En quelle classe es-tu ?`;
    else if (!profile.location) reply = `C'est noté. Enfin, dans quelle ville ou province habites-tu ?`;

    if (reply !== "") {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to: from, text: { body: `${HEADER_MWALIMU}\n\n${reply}` }
        }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });
        return res.sendStatus(200);
    }
  }

  // --- ÉTAPE 2 : TUTORAT APPROFONDI (DÉBLOQUÉ) ---
  const dbContent = await getDbData();
  const prompt = `Tu es Mwalimu EdTech, le précepteur de ${profile.name} (${profile.grade}, ${profile.location}).
  TON ATTITUDE : Protectrice, ouverte. Dis "Je suis là pour toi".
  CONSIGNES :
  1. Utilise : ${dbContent}.
  2. Structure avec 🔵, 🟡, 🔴 (SANS écrire les mots "Savoir" ou "Pédagogie").
  3. Termine TOUJOURS par un Quiz A, B, C.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: prompt }, ...studentMemory[from].history.slice(-4), { role: "user", content: text }]
    });

    const finalReply = `${HEADER_MWALIMU}\n\n${completion.choices[0].message.content}`;
    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp", to: from, text: { body: finalReply }
    }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });

    studentMemory[from].history.push({ role: "user", content: text }, { role: "assistant", content: completion.choices[0].message.content });
    saveMemory();
  } catch (e) { console.error("Erreur OpenAI"); }
  res.sendStatus(200);
});

// 7. DÉMARRAGE
app.listen(process.env.PORT || 10000);
