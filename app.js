

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

// ✅ SIGNATURE STRICTE : Pas d'astérisques au début/fin, texte en gras, EdTech avec T majuscule
const HEADER_MWALIMU = `🔵🟡🔴 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩\n\n---\n\n`;

// --- 📚 3. RÉCUPÉRATION ROBUSTE DE L'ARCHE ---
async function getArcheData() {
    let data = { parcs: [], infrastructures: [], histoire: [], geographie: [] };
    try {
        // On récupère chaque table séparément pour éviter qu'une seule erreur bloque tout
        const p = await pool.query("SELECT * FROM drc_parcs_nationaux").catch(() => ({rows: []}));
        const i = await pool.query("SELECT * FROM drc_infrastructures").catch(() => ({rows: []}));
        const h = await pool.query("SELECT * FROM drc_histoire_ancienne").catch(() => ({rows: []}));
        const g = await pool.query("SELECT * FROM drc_geographie").catch(() => ({rows: []}));
       
        data = { parcs: p.rows, infrastructures: i.rows, histoire: h.rows, geographie: g.rows };
        return data;
    } catch (err) {
        return data; // Retourne au moins les tableaux vides au lieu d'une erreur fatale
    }
}

// --- ⏰ 4. RAPPEL QUOTIDIEN ---
cron.schedule('0 6 * * *', async () => {
  for (const id in studentMemory) {
    const prenom = studentMemory[id].profile.name || "Champion";
    const motivation = `${HEADER_MWALIMU}Bonjour ${prenom} ! L'excellence t'attend aujourd'hui.`;
    try {
      await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp", to: id, text: { body: motivation }
      }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { }
  }
});

// --- 🔍 5. ANALYSE DE PROFIL ---
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

    // Mode Quiz automatique
    if (text.toLowerCase().includes("quiz") || text.toLowerCase().includes("évalue")) {
        studentMemory[from].mode = "quiz";
    }

    const systemPrompt = `Tu es Mwalimu EdTech, mentor en RDC.
Élève : ${profile.name || "Inconnu"}, Classe : ${profile.grade || "Inconnue"}.

ARCHE DE SAVOIR (Source Prioritaire) : ${JSON.stringify(archeData)}

CONSIGNES :
1. 🔴 IDENTITÉ : Si le nom/classe manque, demande-les poliment dès le début.
2. 🔵 ARCHE : Utilise UNIQUEMENT l'Arche pour la Géo, l'Histoire, le Civisme et la Culture.
   - SI L'ARCHE EST VIDE, explique poliment que tu consultes tes archives et pose une question générale en attendant.
3. 🟡 INTERACTION : Pose TOUJOURS une question à l'élève pour maintenir le dialogue.
4. STYLE : Structure avec 🔵, 🟡, 🔴. Pas de signature HEADER_MWALIMU dans ton texte.`;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        // ✅ MÉMOIRE AUGMENTÉE : slice(-10) pour garder les 10 derniers messages
        messages: [{ role: "system", content: systemPrompt }, ...studentMemory[from].history.slice(-10), { role: "user", content: text }]
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
