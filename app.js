
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

// 1. CONNEXION SQL ET POOLING
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 2. MÉMOIRE ET IDENTIFICATION (NOM, CLASSE, LIEU)
const memoryPath = path.join(__dirname, 'student_memory.json');
let studentMemory = fs.existsSync(memoryPath) ? JSON.parse(fs.readFileSync(memoryPath, 'utf8')) : {};
const saveMemory = () => fs.writeFileSync(memoryPath, JSON.stringify(studentMemory, null, 2));

// 3. RÉCUPÉRATION DES DONNÉES (DATABASE_URL)
async function getDbData() {
  try {
    const geo = await pool.query('SELECT * FROM drc_geographie');
    const hist = await pool.query('SELECT * FROM drc_histoire_ancienne');
    return JSON.stringify({ geo: geo.rows, hist: hist.rows });
  } catch (err) { return "Données SQL indisponibles."; }
}

// 4. RAPPEL DE 5H00 (BIENVENUE DU PRÉCEPTEUR)
cron.schedule('0 5 * * *', async () => {
  for (const chatId in studentMemory) {
    const profile = studentMemory[chatId].profile;
    const nom = profile.name || "mon cher élève";
    const msg = `${HEADER_MWALIMU}\n\nBonjour ${nom} ! Il est 5h00. Je suis déjà debout pour t'accompagner. Prêt à briller pour la Nation aujourd'hui ?`;
    try {
      await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp", to: chatId, text: { body: msg }
      }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur rappel"); }
  }
}, { timezone: "Africa/Lagos" });

// 5. WEBHOOK META
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else { res.sendStatus(403); }
});

// 6. CŒUR DU PRÉCEPTEUR : IDENTIFICATION ET TUTORAT
app.post("/webhook", async (req, res) => {
  const body = req.body;
  const msgObj = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msgObj) return res.sendStatus(404);

  const from = msgObj.from;
  const text = msgObj.text.body;

  // Création du profil si inexistant
  if (!studentMemory[from]) {
    studentMemory[from] = { profile: { name: null, grade: null, location: null }, history: [] };
  }

  const profile = studentMemory[from].profile;

  // --- PHASE D'IDENTIFICATION ---
  if (!profile.name || !profile.grade || !profile.location) {
    const identificationPrompt = `L'élève a dit : "${text}".
    Si tu trouves son nom, sa classe ou son lieu, extrais-les en JSON {name, grade, location}.
    Sinon, demande poliment ce qui manque (Nom, Classe, Lieu).
    Parle comme un précepteur chaleureux et protecteur.`;

    const idRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: identificationPrompt }]
    });

    try {
      const data = JSON.parse(idRes.choices[0].message.content);
      if (data.name) profile.name = data.name;
      if (data.grade) profile.grade = data.grade;
      if (data.location) profile.location = data.location;
      saveMemory();
    } catch (e) { /* Pas du JSON, c'est du texte direct */ }

    const reply = idRes.choices[0].message.content.includes('{') ? "Parfait, je note cela. Dis-moi maintenant ta ville ou ta province pour que je puisse adapter mes leçons." : idRes.choices[0].message.content;
   
    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp", to: from, text: { body: `${HEADER_MWALIMU}\n\n${reply}` }
    }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });
    return res.sendStatus(200);
  }

  // --- PHASE DE TUTORAT APPROFONDI (ÉLÈVE CONNU) ---
  const dbContent = await getDbData();
  const precepteurPrompt = `Tu es Mwalimu EdTech, le précepteur personnel de ${profile.name}, élève en ${profile.grade} à ${profile.location}.
  TON ATTITUDE : Chaleureuse, ouverte, protectrice. Dis souvent "Je suis là pour toi", "N'hésite pas à me poser tes questions".
  TES RÈGLES :
  1. Utilise les données : ${dbContent}.
  2. Ne dis JAMAIS "Savoir" ou "Pédagogie".
  3. Utilise 🔵, 🟡, 🔴 pour structurer.
  4. Si l'élève répond à ton Quiz précédent, félicite-le ou corrige-le avec douceur.
  5. Propose toujours un nouveau Quiz (A, B, C) à la fin.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: precepteurPrompt }, ...studentMemory[from].history.slice(-4), { role: "user", content: text }]
    });

    const aiMsg = completion.choices[0].message.content;
    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp", to: from, text: { body: `${HEADER_MWALIMU}\n\n${aiMsg}` }
    }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });

    studentMemory[from].history.push({ role: "user", content: text }, { role: "assistant", content: aiMsg });
    saveMemory();
  } catch (e) { console.error("Erreur OpenAI"); }
  res.sendStatus(200);
});

// 7. DÉMARRAGE
app.listen(process.env.PORT || 10000, () => console.log("🚀 Mwalimu EdTech : Précepteur en ligne"));
