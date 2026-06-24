

require("dotenv").config();

const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cron = require("node-cron");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

axios.defaults.timeout = 15000;

const app = express();
app.set("trust proxy", 1);

/* ================= CONFIG ================= */
function env(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variable manquante : ${name}`);
  }
  return value;
}

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = env("GEMINI_API_KEY");
const DATABASE_URL = env("DATABASE_URL");
const TOKEN = env("TOKEN");
const PHONE_NUMBER_ID = env("PHONE_NUMBER_ID");
const VERIFY_TOKEN = env("VERIFY_TOKEN");
const APP_SECRET = env("APP_SECRET");

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 20
});

app.use(express.json({
  limit: "2mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
}));

/* ================= LOGS ================= */
function log(level, event, data = {}) {
  const payload = {
    level,
    event,
    ts: new Date().toISOString(),
    ...data
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function logError(event, err, meta = {}) {
  log("error", event, {
    message: err?.message || String(err || ""),
    stack: err?.stack || null,
    data: err?.response?.data || null,
    ...meta
  });
}

/* ================= CONSTANTES ================= */
const HEADER = "🔴🟡🔵 *Mwalimu EdTech : Ton Mentor pour l'Excellence* 🇨🇩";
const SEPARATOR = "────────────────";

const CITATIONS = {
  general: "***« Apprendre avec sérieux aujourd'hui, c'est mieux servir le Congo demain. »***",
  geographie: "***« Connaître son pays, c'est déjà commencer à mieux l'aimer. »***",
  histoire: "***« Un peuple qui connaît son histoire prépare mieux son avenir. »***",
  droit: "***« Respecter la loi, c'est aussi participer à la vie de la nation. »***",
  math: "***« La rigueur dans le calcul forme aussi la rigueur dans la vie. »***",
  sciences: "***« Étudier les sciences, c'est se préparer à être utile à sa nation. »***",
  francais: "***« Bien parler et bien écrire donnent de la force à la pensée. »***"
};

const SYSTEM_PROMPT = `
Tu es Mwalimu EdTech, un précepteur numérique congolais, humain, chaleureux, rigoureux et pédagogue.

MISSION :
- Aider l'élève à comprendre.
- Guider sans faire le travail à sa place.
- Expliquer simplement, comme un vrai professeur.
- Adapter le niveau à la classe de l'élève.
- Rester pertinent pour le contexte scolaire de la RDC.

STYLE :
- Réponse claire, courte et naturelle.
- Évite les répétitions.
- Ne sois pas bavard.
- Ne félicite pas exagérément.
- Si l'élève dit simplement bonjour, merci, ok, bonne nuit, réponds naturellement sans structure pédagogique.

STRUCTURE POUR UNE VRAIE RÉPONSE PÉDAGOGIQUE :
🔵 [VÉCU]
🟡 [SAVOIR]
🔴 [INSPIRATION]
❓ [CONSOLIDATION]

RÈGLES :
- Ne donne pas toujours la réponse finale directement.
- Pour un exercice : méthode d'abord.
- Pour maths, physique, chimie : raisonnement étape par étape.
- N'invente jamais une loi, un article, une ville, une commune, une province ou une source.
- Pour droit, géographie administrative, loi, article, OHADA, actualité : utilise Google Search si nécessaire.
- Pas de LaTeX.
- Écris les calculs simplement : x², √9, 2/5, ×, /.
`;

const INTENTION_SCHEMA = {
  type: "OBJECT",
  properties: {
    intention: { type: "STRING" },
    matiere: { type: "STRING" },
    sujet: { type: "STRING" }
  },
  required: ["intention", "matiere", "sujet"]
};

const AUDIO_SCHEMA = {
  type: "OBJECT",
  properties: {
    transcription: { type: "STRING" },
    type: { type: "STRING" }
  },
  required: ["transcription", "type"]
};

/* ================= CACHE ================= */
class TTLCache {
  constructor(ttlMs = 60000, max = 1000) {
    this.ttlMs = ttlMs;
    this.max = max;
    this.store = new Map();
    setInterval(() => this.clean(), ttlMs).unref?.();
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expire) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value) {
    if (this.store.size >= this.max) {
      const first = this.store.keys().next().value;
      this.store.delete(first);
    }
    this.store.set(key, {
      value,
      expire: Date.now() + this.ttlMs
    });
  }

  clean() {
    const now = Date.now();
    for (const [k, v] of this.store.entries()) {
      if (now > v.expire) this.store.delete(k);
    }
  }
}

const cache = new TTLCache();

/* ================= OUTILS ================= */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function cleanName(text = "") {
  return String(text)
    .replace(/je m'appelle|mon nom est|mon prénom est|je suis en|ma classe est|mon rêve est|je veux devenir/gi, "")
    .replace(/[.,!?;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstName(name = "") {
  return String(name || "").trim().split(/\s+/)[0] || "élève";
}

function truncate(text = "", max = 3900) {
  const t = String(text || "").trim();
  return t.length <= max ? t : `${t.slice(0, max)}...`;
}

function normalize(text = "") {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?;:()"`'’´]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSocial(text = "") {
  const t = normalize(text);
  if (!t) return false;

  return [
    "bonjour", "bonsoir", "salut", "hello", "coucou", "bjr", "bsr", "mbote", "cc",
    "merci", "merci beaucoup", "ok", "okay", "d accord", "dac", "oui", "non",
    "ca va", "ca va merci", "bien", "super", "cool", "compris", "parfait",
    "bonne nuit", "bonne journee", "bonne soiree", "bon apres midi", "a demain"
  ].includes(t) ||
  /^(tu vas bien|comment vas tu|comment tu vas|et toi|ca va)$/i.test(t);
}

function socialReply(user, text = "") {
  const name = firstName(user?.nom);
  const t = normalize(text);

  if (t.includes("merci")) {
    return pick([
      `Je t'en prie **${name}** 😊`,
      `Avec plaisir **${name}** 😊`,
      `C'est normal **${name}**, je suis là pour t'aider.`
    ]);
  }

  if (t.includes("bonsoir")) {
    return `Bonsoir **${name}** 🌙 Comment s'est passée ta journée ?`;
  }

  if (t.includes("bonne nuit")) {
    return `Bonne nuit **${name}** 🌙 Repose-toi bien.`;
  }

  if (t.includes("bonjour") || t.includes("salut") || t.includes("mbote") || t.includes("cc")) {
    return `Bonjour **${name}** 😊 Comment vas-tu aujourd'hui ?`;
  }

  if (t.includes("ca va") || t.includes("bien")) {
    return `Tant mieux **${name}** 😊 Quelle matière veux-tu travailler maintenant ?`;
  }

  return `D'accord **${name}** 👍`;
}

function detectSubject(text = "") {
  const t = normalize(text);

  if (/(droit|loi|code|article|tribunal|ohada|constitution|juridique)/.test(t)) return "droit";
  if (/(geographie|province|territoire|commune|ville|secteur|chefferie|rdc|congo|haut katanga)/.test(t)) return "geographie";
  if (/(histoire|passe|colonisation|independance|royaume|date historique)/.test(t)) return "histoire";
  if (/(math|maths|equation|fraction|calcul|racine|puissance|geometrie)/.test(t)) return "math";
  if (/(physique|force|vitesse|energie|masse|pression|mouvement)/.test(t)) return "physique";
  if (/(chimie|molecule|atome|acide|base|solution|reaction)/.test(t)) return "chimie";
  if (/(francais|grammaire|orthographe|conjugaison|verbe|phrase)/.test(t)) return "francais";

  return "general";
}

function citationFor(subject) {
  if (subject === "geographie") return CITATIONS.geographie;
  if (subject === "histoire") return CITATIONS.histoire;
  if (subject === "droit") return CITATIONS.droit;
  if (subject === "math") return CITATIONS.math;
  if (subject === "physique" || subject === "chimie") return CITATIONS.sciences;
  if (subject === "francais") return CITATIONS.francais;
  return CITATIONS.general;
}

function cleanAI(text = "") {
  return String(text || "")
    .replace(new RegExp(HEADER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "")
    .replace(/^🌟\s*Mot d['’]encouragement\s*:.*$/gim, "")
    .replace(/^👉\s*Je reste disponible.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasStructure(text = "") {
  return /🔵\s*\[VÉCU\]/i.test(text)
    && /🟡\s*\[SAVOIR\]/i.test(text)
    && /🔴\s*\[INSPIRATION\]/i.test(text)
    && /❓\s*\[CONSOLIDATION\]/i.test(text);
}

function buildFinal(user, raw, question = "") {
  const subject = detectSubject(question);
  let body = cleanAI(raw);

  if (!hasStructure(body)) {
    const name = firstName(user?.nom);
    body = `🔵 [VÉCU] : D'accord **${name}**, regardons cela simplement.

🟡 [SAVOIR] : ${body}

🔴 [INSPIRATION] : Une notion bien comprise te rend plus solide.

❓ [CONSOLIDATION] : Explique-moi avec tes mots l'idée principale que tu retiens.`;
  }

  return [
    HEADER,
    SEPARATOR,
    body,
    citationFor(subject),
    "👉 Nous pouvons continuer pas à pas."
  ]
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ================= DB ================= */
async function initDB() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS unaccent;");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS processed_messages (
      msg_id TEXT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      phone TEXT PRIMARY KEY,
      nom TEXT DEFAULT '',
      classe TEXT DEFAULT '',
      reve TEXT DEFAULT '',
      historique JSONB DEFAULT '[]'::jsonb,
      reminders_enabled BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bibliotheque (
      id SERIAL PRIMARY KEY,
      titre TEXT,
      matiere TEXT,
      classe TEXT,
      mots_cles TEXT,
      contenu TEXT,
      commentaire_ai TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS unanswered_questions (
      id SERIAL PRIMARY KEY,
      phone TEXT DEFAULT '',
      question TEXT NOT NULL,
      msg_type TEXT DEFAULT 'text',
      classe TEXT DEFAULT '',
      nom TEXT DEFAULT '',
      reason TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_attempts (
      id SERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      sujet TEXT DEFAULT '',
      question TEXT DEFAULT '',
      attempts_count INT DEFAULT 0,
      last_user_answer TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  log("info", "db_ready");
}

async function getUser(phone) {
  const { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [phone]);
  return rows[0] || null;
}

async function createUser(phone) {
  await pool.query(
    `INSERT INTO conversations (phone, historique)
     VALUES ($1, '[]'::jsonb)
     ON CONFLICT (phone) DO NOTHING`,
    [phone]
  );
  return getUser(phone);
}

async function updateUser(phone, field, value) {
  const allowed = {
    nom: "nom",
    classe: "classe",
    reve: "reve",
    historique: "historique",
    reminders_enabled: "reminders_enabled"
  };

  if (!allowed[field]) throw new Error("Champ non autorisé");

  await pool.query(
    `UPDATE conversations SET ${allowed[field]}=$1, updated_at=NOW() WHERE phone=$2`,
    [value, phone]
  );
}

async function addHistory(phone, role, content) {
  const item = {
    role,
    content: truncate(content, 2500),
    ts: new Date().toISOString()
  };

  await pool.query(
    `
    UPDATE conversations
    SET historique = (
      SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
      FROM (
        SELECT value, ord
        FROM jsonb_array_elements(COALESCE(historique, '[]'::jsonb) || $1::jsonb)
        WITH ORDINALITY AS arr(value, ord)
        ORDER BY ord DESC
        LIMIT 12
      ) t
    ),
    updated_at = NOW()
    WHERE phone=$2
    `,
    [JSON.stringify([item]), phone]
  );
}

async function searchLibrary(question = "", classe = "") {
  try {
    const q = String(question || "").trim();
    if (!q) return null;

    const { rows } = await pool.query(
      `
      SELECT *
      FROM bibliotheque
      WHERE
        unaccent(lower(coalesce(titre,''))) LIKE unaccent(lower($1))
        OR unaccent(lower(coalesce(matiere,''))) LIKE unaccent(lower($1))
        OR unaccent(lower(coalesce(mots_cles,''))) LIKE unaccent(lower($1))
        OR unaccent(lower(coalesce(contenu,''))) LIKE unaccent(lower($1))
      ORDER BY updated_at DESC, id DESC
      LIMIT 1
      `,
      [`%${q}%`]
    );

    return rows[0] || null;
  } catch (e) {
    logError("search_library", e);
    return null;
  }
}

async function logUnanswered(user, question, type, reason) {
  try {
    await pool.query(
      `INSERT INTO unanswered_questions (phone, question, msg_type, classe, nom, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        user?.phone || "",
        truncate(question, 2000),
        type,
        user?.classe || "",
        user?.nom || "",
        reason || ""
      ]
    );
  } catch (e) {
    logError("log_unanswered", e);
  }
}

/* ================= WHATSAPP ================= */
function verifySignature(req) {
  try {
    const signature = req.get("x-hub-signature-256");
    if (!signature || !req.rawBody) return false;

    const expected = "sha256=" + crypto
      .createHmac("sha256", APP_SECRET)
      .update(req.rawBody)
      .digest("hex");

    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function extractMessage(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  if (!value || value.statuses?.length || !value.messages?.length) return null;
  return value.messages[0];
}

function msgType(msg) {
  if (msg.text?.body) return "text";
  if (msg.audio) return "audio";
  if (msg.image) return "image";
  if (msg.document) return "document";
  return msg.type || "unknown";
}

async function sendText(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: truncate(text, 3900) }
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (e) {
    logError("send_text", e, { to });
  }
}

async function markRead(messageId) {
  try {
    if (!messageId) return;
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" }
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (e) {
    log("warn", "typing_indicator_error", { message: e.message });
  }
}

async function getMedia(mediaId) {
  const info = await axios.get(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } }
  );

  const url = info.data?.url;
  if (!url) throw new Error("URL média introuvable");

  const response = await axios.get(url, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${TOKEN}` },
    maxContentLength: 8 * 1024 * 1024,
    maxBodyLength: 8 * 1024 * 1024
  });

  return {
    buffer: Buffer.from(response.data),
    mimeType: String(response.headers["content-type"] || info.data?.mime_type || "application/octet-stream").toLowerCase()
  };
}

/* ================= IA ================= */
function geminiModel({ search = false, system = SYSTEM_PROMPT } = {}) {
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: system,
    ...(search ? { tools: [{ googleSearch: {} }] } : {})
  });
}

function toContents(history = []) {
  return history
    .filter(m => m.role !== "system")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content) }]
    }));
}

async function generateText({ user, question, history = [], fiche = null }) {
  const subject = detectSubject(question);
  const useSearch = ["droit", "geographie", "histoire"].includes(subject);

  const system = `${SYSTEM_PROMPT}

PROFIL :
- Nom : ${user?.nom || "non précisé"}
- Classe : ${user?.classe || "non précisée"}
- Rêve : ${user?.reve || "non précisé"}

CONSIGNES :
- Matière détectée : ${subject}
- La réponse doit rester dans cette matière.
- La consolidation doit porter sur la question exacte.
- Pas de répétitions.
`;

  const context = fiche
    ? `CONTEXTE LOCAL :
Titre : ${fiche.titre || ""}
Matière : ${fiche.matiere || ""}
Contenu : ${fiche.contenu || ""}
Commentaire : ${fiche.commentaire_ai || ""}`
    : "Aucune fiche locale disponible.";

  const model = geminiModel({ search: useSearch, system });

  const result = await model.generateContent({
    contents: [
      ...toContents(history.slice(-5)),
      {
        role: "user",
        parts: [{
          text: `QUESTION DE L'ÉLÈVE :
${question}

${context}

Réponds comme Mwalimu.`
        }]
      }
    ],
    generationConfig: { temperature: 0.2 }
  });

  return result.response.text();
}

async function analyzeAudio(user, buffer, mimeType, history = []) {
  const model = geminiModel({
    search: false,
    system: `${SYSTEM_PROMPT}

Analyse l'audio et retourne uniquement un JSON :
{
  "transcription": "...",
  "type": "social" ou "pedagogique" ou "incompris"
}`
  });

  const result = await model.generateContent({
    contents: [
      ...toContents(history.slice(-3)),
      {
        role: "user",
        parts: [
          { text: "Analyse cet audio." },
          { inlineData: { mimeType, data: buffer.toString("base64") } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: AUDIO_SCHEMA
    }
  });

  try {
    return JSON.parse(result.response.text());
  } catch {
    return { transcription: "", type: "incompris" };
  }
}

async function analyzeImage(user, buffer, mimeType, history = []) {
  const model = geminiModel({
    search: true,
    system: `${SYSTEM_PROMPT}

Mode image :
- Commence par dire : "J'ai bien reçu ton image."
- Recopie ce qui est visible.
- Si c'est flou, dis-le.
- Explique simplement.`
  });

  const result = await model.generateContent({
    contents: [
      ...toContents(history.slice(-3)),
      {
        role: "user",
        parts: [
          { text: "Analyse cette image." },
          { inlineData: { mimeType, data: buffer.toString("base64") } }
        ]
      }
    ],
    generationConfig: { temperature: 0.2 }
  });

  return result.response.text();
}

/* ================= TRAITEMENT ================= */
async function handleCommand(from, text) {
  const cmd = normalize(text);

  if (cmd === "/aide") {
    await sendText(from, `${HEADER}
${SEPARATOR}
📘 *Commandes disponibles*
/aide → voir les commandes
/profil → refaire ton profil
/reset → vider l'historique
/stop → arrêter les rappels
/start → réactiver les rappels`);
    return true;
  }

  if (cmd === "/reset") {
    await updateUser(from, "historique", JSON.stringify([]));
    await sendText(from, `${HEADER}
${SEPARATOR}
Historique remis à zéro. Envoie-moi maintenant ta question.`);
    return true;
  }

  if (cmd === "/stop") {
    await updateUser(from, "reminders_enabled", false);
    await sendText(from, "Les rappels du matin sont arrêtés. Envoie /start pour les réactiver.");
    return true;
  }

  if (cmd === "/start") {
    await updateUser(from, "reminders_enabled", true);
    await sendText(from, "Les rappels du matin sont réactivés.");
    return true;
  }

  if (cmd === "/profil") {
    await pool.query(
      "UPDATE conversations SET nom='', classe='', reve='', historique='[]'::jsonb, updated_at=NOW() WHERE phone=$1",
      [from]
    );
    await sendText(from, `${HEADER}
${SEPARATOR}
Quel est ton *prénom* ?`);
    return true;
  }

  return false;
}

async function handleText(user, text, history) {
  if (isSocial(text)) {
    return { text: socialReply(user, text), bypass: true };
  }

  const key = `${user.phone}|${normalize(text)}`;
  const cached = cache.get(key);
  if (cached) return { text: cached, bypass: false };

  const fiche = await searchLibrary(text, user.classe || "");
  const raw = await generateText({ user, question: text, history, fiche });

  cache.set(key, raw);
  return { text: buildFinal(user, raw, text), bypass: true };
}

async function handleAudio(user, msg, history) {
  const audioId = msg.audio?.id;
  if (!audioId) return { text: "Je n'arrive pas à lire ton audio.", bypass: true };

  const media = await getMedia(audioId);
  const analysis = await analyzeAudio(user, media.buffer, media.mimeType, history);
  const transcription = String(analysis?.transcription || "").trim();

  if (!transcription) {
    return { text: "Je n'arrive pas encore à comprendre clairement ton audio. Réessaie avec une voix plus claire.", bypass: true };
  }

  if (analysis.type === "social" || isSocial(transcription)) {
    return { text: socialReply(user, transcription), bypass: true };
  }

  const fiche = await searchLibrary(transcription, user.classe || "");
  const raw = await generateText({ user, question: transcription, history, fiche });
  return { text: buildFinal(user, raw, transcription), bypass: true };
}

async function handleImage(user, msg, history) {
  const imageId = msg.image?.id;
  if (!imageId) return { text: "Je n'arrive pas à lire ton image.", bypass: true };

  const media = await getMedia(imageId);
  const raw = await analyzeImage(user, media.buffer, media.mimeType, history);
  return { text: buildFinal(user, raw, "[image envoyée]"), bypass: true };
}

async function processMessage(msg) {
  const from = msg.from;
  const id = msg.id;
  const type = msgType(msg);
  const text = msg.text?.body?.trim() || "";

  log("info", "incoming_message", { from, id, type, preview: text.slice(0, 80) });

  const inserted = await pool.query(
    "INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [id]
  );

  if (inserted.rowCount === 0) {
    log("warn", "duplicate_ignored", { id });
    return;
  }

  await markRead(id);

  let user = await getUser(from);
  if (!user) {
    user = await createUser(from);
    await sendText(from, `${HEADER}
${SEPARATOR}
🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.
🟡 Quel est ton *prénom* ?`);
    return;
  }

  if (type === "text" && await handleCommand(from, text)) return;

  if (!user.nom) {
    const nom = cleanName(text);
    if (!nom) {
      await sendText(from, "Donne-moi simplement ton prénom.");
      return;
    }

    await updateUser(from, "nom", nom);
    await sendText(from, `Enchanté *${nom}* ! En quelle *classe* es-tu ?`);
    return;
  }

  if (!user.classe) {
    const classe = cleanName(text);
    if (!classe) {
      await sendText(from, "Écris-moi simplement ta classe. Exemple : 6e, 8e, Terminale.");
      return;
    }

    await updateUser(from, "classe", classe);
    user = await getUser(from);
    await sendText(from, `C'est bien noté, *${user.nom}*. Quel est ton plus grand rêve professionnel ?`);
    return;
  }

  if (!user.reve) {
    const reve = cleanName(text);
    if (!reve) {
      await sendText(from, "Dis-moi simplement ton rêve professionnel. Exemple : avocat, médecin, ingénieur.");
      return;
    }

    await updateUser(from, "reve", reve);
    await sendText(from, `✨ Très belle ambition !
Pour commencer, dis-moi : quelle matière ou quel chapitre te pose problème ?`);
    return;
  }

  const history = Array.isArray(user.historique) ? user.historique : [];

  if (type === "text" && text) await addHistory(from, "user", text);
  if (type === "audio") await addHistory(from, "user", "[audio envoyé]");
  if (type === "image") await addHistory(from, "user", "[image envoyée]");

  let result;

  try {
    if (type === "text") result = await handleText({ ...user, phone: from }, text, history);
    else if (type === "audio") result = await handleAudio({ ...user, phone: from }, msg, history);
    else if (type === "image") result = await handleImage({ ...user, phone: from }, msg, history);
    else result = { text: "Pour l'instant, je traite surtout les textes, les audios et les images.", bypass: true };
  } catch (e) {
    logError("handle_message", e, { from, type });
    await logUnanswered({ ...user, phone: from }, text || `[${type}]`, type, e.message);
    result = {
      text: `${HEADER}
${SEPARATOR}
🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Je rencontre un petit souci technique.
🔴 [INSPIRATION] : Ce n'est pas grave, nous pouvons reprendre calmement.
❓ [CONSOLIDATION] : Réessaie dans un instant ou reformule ta question.`,
      bypass: true
    };
  }

  await sendText(from, result.text);
  await addHistory(from, "assistant", result.text);

  log("info", "message_processed", { from, id, type });
}

/* ================= QUEUE ================= */
const queues = new Map();

function runByUser(key, task) {
  const previous = queues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  queues.set(key, current.finally(() => {
    if (queues.get(key) === current) queues.delete(key);
  }));
}

/* ================= CRON ================= */
cron.schedule("0 7 * * *", async () => {
  try {
    const { rows } = await pool.query(`
      SELECT phone, nom
      FROM conversations
      WHERE coalesce(phone,'') <> ''
        AND coalesce(nom,'') <> ''
        AND coalesce(reminders_enabled, TRUE) = TRUE
    `);

    for (const u of rows) {
      await sendText(u.phone, `${HEADER}
${SEPARATOR}
Bonjour **${firstName(u.nom)}** ☀️
Petit rappel du matin : quelle matière veux-tu travailler aujourd'hui ?
${CITATIONS.general}`);
    }

    log("info", "morning_reminders_done", { count: rows.length });
  } catch (e) {
    logError("morning_reminders", e);
  }
}, { timezone: "Africa/Lubumbashi" });

cron.schedule("0 3 * * *", async () => {
  try {
    await pool.query("DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '2 days'");
    log("info", "cleanup_done");
  } catch (e) {
    logError("cleanup", e);
  }
}, { timezone: "Africa/Lubumbashi" });

/* ================= ROUTES ================= */
app.get("/", (_req, res) => {
  res.send("Mwalimu EdTech Server: OK");
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "healthy", ts: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: "unhealthy", error: e.message });
  }
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  if (!verifySignature(req)) {
    log("warn", "invalid_signature");
    return res.sendStatus(403);
  }

  const msg = extractMessage(req.body);
  if (!msg) return res.sendStatus(200);

  res.sendStatus(200);

  runByUser(msg.from, async () => {
    await processMessage(msg);
  });
});

/* ================= START ================= */
(async () => {
  try {
    await initDB();
    app.listen(PORT, () => {
      log("info", "server_started", { port: PORT });
    });
  } catch (e) {
    logError("startup_failed", e);
    process.exit(1);
  }
})();
