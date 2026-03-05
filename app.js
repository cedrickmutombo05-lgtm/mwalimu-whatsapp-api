
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

/**
* ✅ HEADER REMIS (boules + drapeau) + format WhatsApp propre
* WhatsApp supporte italique avec _..._ et gras avec *...* 1
* Ici: italique sur tout + gras seulement sur la phrase.
*/
const HEADER_MWALIMU =
  "_🔵🟡🔴 *Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant* 🇨🇩_";

// 1. CONNEXION SQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// 2. MÉMOIRE RÉSISTANTE (JSON)
const memoryPath = path.join(__dirname, 'student_memory.json');
let studentMemory = fs.existsSync(memoryPath)
  ? JSON.parse(fs.readFileSync(memoryPath, 'utf8'))
  : {};

const saveMemory = () => {
  try {
    fs.writeFileSync(memoryPath, JSON.stringify(studentMemory, null, 2));
  } catch (e) {
    console.error("Erreur écriture mémoire JSON:", e.message);
  }
};

// ✅ Anti-duplication: Meta peut renvoyer le même message (retries)
const processedIds = new Map();
const DEDUPE_TTL_MS = 10 * 60 * 1000;

function isDuplicate(messageId) {
  if (!messageId) return false;
  const now = Date.now();

  for (const [id, ts] of processedIds.entries()) {
    if (now - ts > DEDUPE_TTL_MS) processedIds.delete(id);
  }

  if (processedIds.has(messageId)) return true;
  processedIds.set(messageId, now);
  return false;
}

// ✅ Envoi WhatsApp propre (headers + erreurs)
async function sendWhatsApp(to, textBody) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, text: { body: textBody } },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (e) {
    console.error("Erreur WhatsApp:", e.response?.data || e.message);
  }
}

// ✅ Parse JSON robuste (évite boucle si l’IA ajoute du texte)
function safeJsonParse(text) {
  if (!text || typeof text !== "string") return null;
  try { return JSON.parse(text); } catch (_) {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch (_) { return null; }
}

// 3. RÉCUPÉRATION DES DONNÉES DRC
async function getDbData() {
  try {
    const geo = await pool.query('SELECT * FROM drc_geographie');
    const hist = await pool.query('SELECT * FROM drc_histoire_ancienne');
    return JSON.stringify({ geo: geo.rows, hist: hist.rows });
  } catch (err) {
    console.error("Erreur DB:", err.message);
    return "Données indisponibles.";
  }
}

// 4. WEBHOOK META (VÉRIFICATION)
app.get('/webhook', (req, res) => {
  if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
    res.status(200).send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

// 5. LOGIQUE DU PRÉCEPTEUR (SANS BÉGAIEMENT)
app.post("/webhook", async (req, res) => {
  const body = req.body;

  // ✅ Répondre immédiatement à Meta
  res.sendStatus(200);

  // Bloquer les notifications de lecture/distribution
  if (body.entry?.[0]?.changes?.[0]?.value?.statuses) return;

  const msgObj = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msgObj || msgObj.type !== 'text') return;

  // ✅ Anti-duplication (stop les doubles réponses)
  const messageId = msgObj.id;
  if (isDuplicate(messageId)) return;

  const from = msgObj.from;
  const text = msgObj.text?.body || "";

  if (!studentMemory[from]) {
    studentMemory[from] = { profile: { name: null, grade: null, location: null }, history: [] };
  }

  let profile = studentMemory[from].profile;

  // --- PHASE D'IDENTIFICATION ---
  if (!profile.name || !profile.grade || !profile.location) {
    let found = null;

    try {
      const aicheck = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Réponds UNIQUEMENT en JSON valide, sans texte autour. " +
              "Format: {\"name\":null|string,\"grade\":null|string,\"location\":null|string}"
          },
          {
            role: "user",
            content:
              `L'élève dit: "${text}". Extrais Nom, Classe, Ville en JSON. Si inconnu, mets null.`
          }
        ],
        // Si supporté par ton SDK/compte, ça réduit fortement les réponses non-JSON
        response_format: { type: "json_object" }
      });

      const raw = aicheck.choices?.[0]?.message?.content || "";
      found = safeJsonParse(raw);
    } catch (e) {
      console.error("Erreur extraction profil:", e.message);
    }

    if (found) {
      if (found.name) profile.name = found.name;
      if (found.grade) profile.grade = found.grade;
      if (found.location) profile.location = found.location;
      saveMemory();
    }

    // ✅ Une seule question à la fois
    let reply = "";
    if (!profile.name) reply = "Bienvenue ! Je suis Mwalimu EdTech, ton précepteur. Pour commencer, quel est ton nom ? Je suis là pour toi.";
    else if (!profile.grade) reply = `Enchanté ${profile.name} ! En quelle classe es-tu ?`;
    else if (!profile.location) reply = "C'est noté. Enfin, dans quelle ville ou province habites-tu ?";

    if (reply) {
      await sendWhatsApp(from, `${HEADER_MWALIMU}\n\n${reply}`);
      return; // ✅ très important: on ne continue pas vers le tutorat
    }
  }

  // --- TUTORAT APPROFONDI (RESTE DU CODE) ---
  const dbContent = await getDbData();

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `Tu es Mwalimu EdTech. Utilise : ${dbContent}. Structure : 🔵🟡🔴. Termine par un Quiz.` },
        ...studentMemory[from].history.slice(-4),
        { role: "user", content: text }
      ]
    });

    const aiText = completion.choices?.[0]?.message?.content || "Je n’ai pas pu répondre.";
    const finalReply = `${HEADER_MWALIMU}\n\n${aiText}`;

    await sendWhatsApp(from, finalReply);

    studentMemory[from].history.push(
      { role: "user", content: text },
      { role: "assistant", content: aiText }
    );
    saveMemory();
  } catch (e) {
    console.error("Erreur OpenAI:", e.message);
  }
});

app.listen(process.env.PORT || 10000, () => {
  console.log("Mwalimu EdTech opérationnel.");
});
