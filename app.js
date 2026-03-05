
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

// 1. CONNEXION SQL (DATABASE_URL)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 2. MÉMOIRE RÉSISTANTE (FIX : SAUVEGARDE IMMÉDIATE)
const memoryPath = path.join(__dirname, 'student_memory.json');
let studentMemory = fs.existsSync(memoryPath) ? JSON.parse(fs.readFileSync(memoryPath, 'utf8')) : {};

const saveMemory = (data) => {
    studentMemory = data;
    fs.writeFileSync(memoryPath, JSON.stringify(studentMemory, null, 2));
};

// 3. RÉCUPÉRATION DES DONNÉES DU PAYS
async function getDbData() {
  try {
    const geo = await pool.query('SELECT * FROM drc_geographie');
    const hist = await pool.query('SELECT * FROM drc_histoire_ancienne');
    return JSON.stringify({ geo: geo.rows, hist: hist.rows });
  } catch (err) { return "Données SQL indisponibles."; }
}

// 4. RAPPEL DE 5H00 (INDIVIDUEL)
cron.schedule('0 5 * * *', async () => {
  for (const chatId in studentMemory) {
    const name = studentMemory[chatId].profile?.name || "mon cher élève";
    const msg = `${HEADER_MWALIMU}\n\nBonjour ${name} ! Il est 5h00. Ton précepteur est là. Prêt à apprendre pour le Grand Congo ?`;
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

// 6. LOGIQUE DE MÉMOIRE ET TUTORAT (RÈGLE D'OR)
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

  // --- ANALYSE DE L'IDENTITÉ (NOM, CLASSE, LIEU) ---
  if (!profile.name || !profile.grade || !profile.location) {
    const extractionPrompt = `L'élève dit : "${text}".
    Extrais Nom, Classe, Ville en JSON : {"name": "...", "grade": "...", "location": "..."}.
    Si une info manque, mets null. Réponds UNIQUEMENT le JSON.`;

    const extraction = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: extractionPrompt }]
    });

    try {
      const detected = JSON.parse(extraction.choices[0].message.content);
      if (detected.name) profile.name = detected.name;
      if (detected.grade) profile.grade = detected.grade;
      if (detected.location) profile.location = detected.location;
      saveMemory(studentMemory);
    } catch (e) { console.error("Erreur parsing JSON"); }

    // Si le profil est encore incomplet, on redemande chaleureusement
    if (!profile.name || !profile.grade || !profile.location) {
        const missing = !profile.name ? "ton nom" : (!profile.grade ? "ta classe" : "ta ville");
        const reply = `Bienvenue ! Je suis Mwalimu EdTech, ton précepteur. Pour mieux t'accompagner, j'ai besoin de connaître ${missing}. Peux-tu me le dire ? Je suis là pour toi.`;
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to: from, text: { body: `${HEADER_MWALIMU}\n\n${reply}` }
        }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });
        return res.sendStatus(200);
    }
  }

  // --- TUTORAT APPROFONDI (IDENTITÉ CONFIRMÉE) ---
  const dbContent = await getDbData();
  const precepteurPrompt = `Tu es Mwalimu EdTech, précepteur de ${profile.name} (${profile.grade}, ${profile.location}).
  TON ATTITUDE : Protectrice, très ouverte, humaine. Dis "Je suis là pour toi".
  CONSIGNES :
  1. Utilise les données : ${dbContent}.
  2. Structure avec 🔵, 🟡, 🔴 (SANS écrire les mots "Savoir" ou "Pédagogie").
  3. Propose systématiquement un Quiz A, B, C à la fin.
  4. N'hésite pas à dire : "N'hésite pas à me poser d'autres questions".`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: precepteurPrompt }, ...studentMemory[from].history.slice(-4), { role: "user", content: text }]
    });

    const response = `${HEADER_MWALIMU}\n\n${completion.choices[0].message.content}`;
    await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp", to: from, text: { body: response }
    }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });

    studentMemory[from].history.push({ role: "user", content: text }, { role: "assistant", content: completion.choices[0].message.content });
    saveMemory(studentMemory);
  } catch (e) { console.error("Erreur OpenAI"); }
  res.sendStatus(200);
});

// 7. DÉMARRAGE
app.listen(process.env.PORT || 10000, () => console.log("🚀 Mwalimu EdTech Connecté"));
