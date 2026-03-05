
const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const { Pool } = require("pg"); // Turbo : Persistance des données
require("dotenv").config();

const app = express().use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const HEADER = "_🔵🟡🔴 **Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

/* ---------------- DB CONFIG (Postgres) ---------------- */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ---------------- ANTI-DOUBLE RÉPONSE (Idempotence) ---------------- */
const processedIds = new Map();
const DEDUPE_TTL = 15 * 60 * 1000; // 15 mins

function isDuplicate(msgId) {
  if (processedIds.has(msgId)) return true;
  processedIds.set(msgId, Date.now());
  setTimeout(() => processedIds.delete(msgId), DEDUPE_TTL);
  return false;
}

/* ---------------- SAFE JSON PARSE (Anti-Crash IA) ---------------- */
function safeJsonParse(text) {
  try { return JSON.parse(text); }
  catch (e) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch (e2) { return null; }
  }
}

/* ---------------- WHATSAPP ENGINE ---------------- */
async function sendWhatsApp(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, text: { body: text } },
      { headers: { Authorization: `Bearer ${process.env.TOKEN}` }, timeout: 10000 }
    );
  } catch (err) { console.error("WhatsApp Error:", err.message); }
}

/* ---------------- LOGIQUE MENTORAT (Turbo Prompt) ---------------- */
const MASTER_PROMPT = `
Tu es MWALIMU EDTHEC, Mentor d'élite en RDC.
STYLE : Socratique (ne donne pas la réponse, guide l'élève).
STRUCTURE :
🔵 Explication simple.
🟡 Analogie congolaise ou exemple.
🔴 Mini-Quiz (2 questions).
Utilise LaTeX pour les sciences : $$v = \\frac{d}{t}$$.
`;

/* ---------------- WEBHOOK ---------------- */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Réponse immédiate à Meta

  const entry = req.body.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];

  if (!message || message.type !== "text") return;
  if (isDuplicate(message.id)) return; // Anti-doublon

  const from = message.from;
  const text = message.text.body;

  try {
    // 1. Charger l'élève (Postgres)
    let resDb = await pool.query("SELECT * FROM students WHERE phone = $1", [from]);
    let student = resDb.rows[0] || { phone: from, name: null, grade: null, history: [] };

    // 2. Identification Turbo (si infos manquantes)
    if (!student.name || !student.grade) {
      const extract = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: "Extrais {name, grade} en JSON." }, { role: "user", content: text }],
        response_format: { type: "json_object" }
      });
     
      const data = safeJsonParse(extract.choices[0].message.content);
      if (data?.name) student.name = data.name;
      if (data?.grade) student.grade = data.grade;

      // Sauvegarde immédiate
      await pool.query(
        "INSERT INTO students (phone, name, grade, history) VALUES ($1,$2,$3,$4) ON CONFLICT (phone) DO UPDATE SET name=$2, grade=$3",
        [from, student.name, student.grade, JSON.stringify(student.history)]
      );

      if (!student.name) return sendWhatsApp(from, `${HEADER}\n\nBienvenue ! Quel est ton prénom et ta classe ? 😊`);
    }

    // 3. Réponse Pédagogique
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `${MASTER_PROMPT} Élève: ${student.name}, Classe: ${student.grade}` },
        ...student.history.slice(-6),
        { role: "user", content: text }
      ]
    });

    const reply = completion.choices[0].message.content;
    await sendWhatsApp(from, `${HEADER}\n\n${reply}`);

    // 4. Update Histoire
    student.history.push({ role: "user", content: text }, { role: "assistant", content: reply });
    await pool.query("UPDATE students SET history = $1 WHERE phone = $2", [JSON.stringify(student.history.slice(-10)), from]);

  } catch (err) {
    console.error("Global Error:", err);
    sendWhatsApp(from, "Désolé champion, j'ai eu un petit vertige. Repose ta question ! 😅");
  }
});

app.listen(process.env.PORT || 10000, () => console.log("Mwalimu Turbo Online 🚀"));
