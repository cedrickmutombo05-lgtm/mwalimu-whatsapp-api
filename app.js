
/**
* MWALIMU EdTech — app.js (IA launch, standards internationaux)
* WhatsApp Cloud API + OpenAI + PostgreSQL (DATABASE_URL)
*
* ✅ Always 200 OK fast to Meta, then process async
* ✅ Dedup message_id in Postgres (multi-instance safe)
* ✅ Optional webhook signature verification (X-Hub-Signature-256)
* ✅ Strong onboarding state machine (no loop / no “Lubumbashi treated as question”)
* ✅ Admin RDC questions => DB-first (provinces/territoires/communes) + “no excuses”
* ✅ Warm, human replies + always end with action/menu
*/

const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
require("dotenv").config();

const app = express();

/* -------------------- RAW BODY for signature verification -------------- */
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf; // keep raw body for signature check
    },
  })
);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ----------------------------- CONFIG --------------------------------- */
const PORT = process.env.PORT || 10000;

const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Optional but recommended for security
const APP_SECRET = process.env.META_APP_SECRET || "";

// feature flags
const ENABLE_SIGNATURE_CHECK = (process.env.ENABLE_SIGNATURE_CHECK || "false").toLowerCase() === "true";
const LAUNCH_MODE = (process.env.LAUNCH_MODE || "ai").toLowerCase(); // ai | hybrid | db
const AI_USAGE_PERCENT = Number(process.env.AI_USAGE_PERCENT || 80); // for hybrid mode

/* ----------------------------- HEADER --------------------------------- */
const HEADER =
  "_🔵🟡🔴 *Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant* 🇨🇩_";

const WARM_STARTERS = [
  "Bonsoir champion(ne) 😊 Je suis content de te retrouver.",
  "Salut champion(ne) 👋 On avance ensemble, tu vas y arriver.",
  "Bonsoir 🌟 Merci d’être là. On étudie tranquillement.",
  "Heyy 😊 Je suis là avec toi, pas à pas.",
  "Bonsoir 💪 Tu progresses, continue comme ça !",
];
const ENCOURAGE = ["Bravo 👏", "Excellent 🌟", "Très bon effort 💪", "Tu progresses bien 😊", "Super 🚀"];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function menuText() {
  return (
    "Que veux-tu faire maintenant ?\n\n" +
    "1️⃣ Leçon\n" +
    "2️⃣ Exercice\n" +
    "3️⃣ Quiz\n\n" +
    "Réponds juste par 1, 2 ou 3 😊"
  );
}

function pack(main, { includeMenu = true } = {}) {
  let out = `${HEADER}\n\n${pick(WARM_STARTERS)}\n\n${main}`;
  if (includeMenu) out += `\n\n${menuText()}`;
  return out;
}

/* ----------------------------- DB ------------------------------------- */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      phone TEXT PRIMARY KEY,
      name TEXT,
      grade TEXT,
      location TEXT,
      stage TEXT DEFAULT 'onboarding', -- onboarding | menu | session
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      phone TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_messages_phone_created ON messages(phone, created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS processed_messages (
      message_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

initDb().catch((e) => console.error("initDb:", e.message));

async function getStudent(phone) {
  const r = await pool.query(`SELECT phone,name,grade,location,stage FROM students WHERE phone=$1`, [phone]);
  return r.rows[0] || { phone, name: null, grade: null, location: null, stage: "onboarding" };
}

async function upsertStudent({ phone, name, grade, location, stage }) {
  await pool.query(
    `INSERT INTO students(phone,name,grade,location,stage,updated_at)
     VALUES ($1,$2,$3,$4,$5,NOW())
     ON CONFLICT (phone) DO UPDATE SET
       name=COALESCE(EXCLUDED.name, students.name),
       grade=COALESCE(EXCLUDED.grade, students.grade),
       location=COALESCE(EXCLUDED.location, students.location),
       stage=COALESCE(EXCLUDED.stage, students.stage),
       updated_at=NOW()`,
    [phone, name || null, grade || null, location || null, stage || null]
  );
}

async function saveMessage(phone, role, content) {
  await pool.query(`INSERT INTO messages(phone,role,content) VALUES ($1,$2,$3)`, [phone, role, content]);
}

async function loadHistory(phone, limit = 6) {
  const r = await pool.query(
    `SELECT role, content FROM messages WHERE phone=$1 ORDER BY created_at DESC LIMIT $2`,
    [phone, limit]
  );
  return r.rows.reverse().map((m) => ({ role: m.role, content: m.content }));
}

async function isDuplicateMessageId(messageId) {
  if (!messageId) return false;
  const r = await pool.query(
    `INSERT INTO processed_messages(message_id) VALUES ($1)
     ON CONFLICT (message_id) DO NOTHING
     RETURNING message_id`,
    [messageId]
  );
  return r.rowCount === 0;
}

/* ---------------------- WhatsApp send --------------------------------- */
async function sendWhatsApp(to, text) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, text: { body: text } },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );
  } catch (e) {
    console.error("WhatsApp send error:", e.response?.data || e.message);
  }
}

/* ---------------------- Webhook signature check ------------------------ */
// X-Hub-Signature-256: "sha256=<hex>"
function verifySignature(req) {
  if (!ENABLE_SIGNATURE_CHECK) return true;
  if (!APP_SECRET) return false;

  const header = req.get("x-hub-signature-256") || "";
  const [algo, sig] = header.split("=");
  if (algo !== "sha256" || !sig) return false;

  const expected = crypto.createHmac("sha256", APP_SECRET).update(req.rawBody || Buffer.from("")).digest("hex");

  // constant time compare
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

/* ---------------------- Helpers: detect onboarding text ---------------- */
function looksLikeQuestion(text) {
  const t = (text || "").trim().toLowerCase();
  if (t.includes("?")) return true;
  const q = ["pourquoi", "comment", "combien", "où", "ou", "quel", "quelle", "quels", "quelles", "c'est quoi", "explique"];
  return q.some((w) => t.startsWith(w) || t.includes(` ${w} `));
}

function profileish(text) {
  const t = (text || "").toLowerCase();
  const patterns = ["prenom", "prénom", "mon nom", "je m'appelle", "m'appelle", "j'habite", "je vis", "je suis à", "je suis a", "je suis de", "classe", "niveau", "option", "je suis en", "suis en", "(1)", "(2)", "(3)"];
  return patterns.some((p) => t.includes(p)) && !looksLikeQuestion(text);
}

function normalizeGrade(grade) {
  if (!grade) return null;
  return grade
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace("eme", "e")
    .replace("ème", "e")
    .replace("éme", "e");
}

/* ---------------------- Admin RDC topics => DB-first ------------------- */
const PROVINCES = [
  "kongo central","bas-congo",
  "haut-katanga","haut katanga",
  "lualaba","kinshasa",
  "kasaï","kasai","kasaï central","kasai central","kasaï oriental","kasai oriental",
  "ituri","tshopo","sud-kivu","sud kivu","nord-kivu","nord kivu",
  "maniema","tanganyika","sankuru","mai-ndombe","mai ndombe",
  "kwilu","kwango","mongala","equateur","équateur",
  "bas-uele","bas uele","haut-uele","haut uele",
  "lomami","tsuapa","sud-ubangi","sud ubangi","nord-ubangi","nord ubangi"
];

function isAdminTopic(text) {
  const t = (text || "").toLowerCase();
  const triggers = ["territoire","territoires","province","provinces","commune","communes","district","secteur","chefferie","frontière","frontiere","carte"];
  return triggers.some((k) => t.includes(k)) || PROVINCES.some((p) => t.includes(p));
}

function extractDbKey(text) {
  const q = (text || "").toLowerCase();
  for (const p of PROVINCES) if (q.includes(p)) return p;
  if (q.includes("territoire")) return "territoire";
  if (q.includes("province")) return "province";
  if (q.includes("commune")) return "commune";
  return (text || "").trim();
}

async function searchDbAdmin(text) {
  const key = extractDbKey(text);
  if (!key) return [];
  try {
    const geo = await pool.query(
      `SELECT 'geo' AS source, * FROM drc_geographie
       WHERE CAST(drc_geographie AS TEXT) ILIKE $1
       LIMIT 12`,
      [`%${key}%`]
    );
    const hist = await pool.query(
      `SELECT 'hist' AS source, * FROM drc_histoire_ancienne
       WHERE CAST(drc_histoire_ancienne AS TEXT) ILIKE $1
       LIMIT 12`,
      [`%${key}%`]
    );
    return [...geo.rows, ...hist.rows];
  } catch (e) {
    console.error("searchDbAdmin:", e.message);
    return [];
  }
}

/* ---------------------- OpenAI: profile extraction --------------------- */
async function extractProfile(text) {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: 'Réponds UNIQUEMENT en JSON valide: {"name":null|string,"grade":null|string,"location":null|string}.',
        },
        {
          role: "user",
          content: `Message: "${text}". Extrais prénom, classe (ex: 8e, 6e primaire), ville/province. Si inconnu -> null.`,
        },
      ],
      response_format: { type: "json_object" },
    });

    const raw = res.choices?.[0]?.message?.content || "{}";
    const obj = JSON.parse(raw);

    // block "Mwalimu" as a student's name
    if (obj?.name && obj.name.toLowerCase().includes("mwalimu")) obj.name = null;

    if (obj?.grade) obj.grade = normalizeGrade(obj.grade);
    return { name: obj?.name || null, grade: obj?.grade || null, location: obj?.location || null };
  } catch (e) {
    console.error("extractProfile:", e.message);
    return { name: null, grade: null, location: null };
  }
}

/* ---------------------- OpenAI: tutoring answer ------------------------ */
function shouldUseAI() {
  if (LAUNCH_MODE === "ai") return true;
  if (LAUNCH_MODE === "db") return false;
  // hybrid
  return Math.random() * 100 < AI_USAGE_PERCENT;
}

const SYSTEM_PROMPT = `
Tu es MWALIMU EDTECH: un précepteur congolais chaleureux, très pédagogue.
Règles:
- Interdit: "Comment puis-je vous aider ?"
- Réponse courte, claire: 4-10 lignes si possible.
- Toujours encouragement.
- Toujours finir par une action (quoi répondre).
- Si tu ne sais pas: dis-le clairement, ne devine pas.

ADMIN RDC (si DB_CONTEXT est fourni):
- Réponds d’abord depuis DB_CONTEXT.
- Interdit de dire "ça peut changer" si DB_CONTEXT contient la réponse.
- Si DB_CONTEXT est vide: dis exactement
  "Je n’ai pas trouvé cette information dans la base Mwalimu."
  puis propose: ajouter le cours ou préciser.

Structure conseillée:
1) Explication simple
2) Exemple
3) Mini-quiz (max 3)
4) Phrase charnière: "Je suis là 😊 ..."
`;

async function tutorAnswer({ phone, student, userText, dbContext }) {
  const history = await loadHistory(phone, 6);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT}\n\nDB_CONTEXT=${dbContext || ""}` },
      ...history,
      { role: "user", content: userText },
    ],
  });

  return completion.choices?.[0]?.message?.content?.trim() || "";
}

/* ---------------------- Webhook verify -------------------------------- */
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

/* ---------------------- Webhook receive -------------------------------- */
app.post("/webhook", (req, res) => {
  // ✅ respond immediately to avoid retries
  res.sendStatus(200);

  // Security check (optional)
  if (!verifySignature(req)) {
    console.error("Invalid webhook signature");
    return;
  }

  // process async
  setImmediate(() => handleWebhook(req.body).catch((e) => console.error("handleWebhook:", e)));
});

async function handleWebhook(body) {
  // ignore status updates
  if (body?.entry?.[0]?.changes?.[0]?.value?.statuses) return;

  const msg = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || msg.type !== "text") return;

  // dedupe (multi-instances)
  if (await isDuplicateMessageId(msg.id)) return;

  const from = msg.from;
  const text = (msg.text?.body || "").trim();
  if (!text) return;

  // save user message
  await saveMessage(from, "user", text);

  let student = await getStudent(from);

  /* ---------------- ONBOARDING: strict and reliable ---------------- */
  if (!student.name || !student.grade || !student.location || student.stage === "onboarding") {
    // Always attempt extraction during onboarding (prevents loops)
    if (profileish(text) || text.length <= 120) {
      const found = await extractProfile(text);
      await upsertStudent({ phone: from, name: found.name, grade: found.grade, location: found.location, stage: "onboarding" });
      student = await getStudent(from);
    }

    if (student.name && student.grade && student.location) {
      await upsertStudent({ phone: from, stage: "menu" });
      const ok =
        `${pick(ENCOURAGE)} ${student.name} 😊\n\n` +
        `J’ai noté : ${student.grade}, ${student.location}.\n` +
        `On commence tranquillement 📚`;
      const out = pack(ok, { includeMenu: true });
      await sendWhatsApp(from, out);
      await saveMessage(from, "assistant", out);
      return;
    }

    // ask only missing fields
    let ask = "Avant de commencer 😊 envoie-moi en un seul message :\n\n";
    if (!student.name) ask += "1️⃣ Ton prénom\n";
    if (!student.grade) ask += "2️⃣ Ta classe (ex: 8e, 6e primaire…)\n";
    if (!student.location) ask += "3️⃣ Ta ville ou province\n";
    ask += "\nJe suis là, prends ton temps ✍️";

    const out = pack(ask, { includeMenu: false });
    await sendWhatsApp(from, out);
    await saveMessage(from, "assistant", out);
    return;
  }

  /* ---------------- MENU quick path (international UX) ---------------- */
  const t = text.toLowerCase();
  if (text === "1" || t.includes("leçon") || t.includes("lecon")) {
    const out = pack(
      `${pick(ENCOURAGE)}\n\nChoisis une matière 😊\n1️⃣ Math\n2️⃣ Français\n3️⃣ Sciences\n\nRéponds 1, 2 ou 3.`,
      { includeMenu: false }
    );
    await sendWhatsApp(from, out);
    await saveMessage(from, "assistant", out);
    return;
  }

  if (text === "2" || t.includes("exercice") || t.includes("exo")) {
    const out = pack(
      `${pick(ENCOURAGE)}\n\nExercice rapide (niveau ${student.grade}) ✍️\n1) 8+7=?\n2) 12-5=?\n3) 6×3=?\n\nRéponds comme: 1) .. 2) .. 3) ..\nJe suis là 😊`,
      { includeMenu: true }
    );
    await sendWhatsApp(from, out);
    await saveMessage(from, "assistant", out);
    return;
  }

  if (text === "3" || t.includes("quiz")) {
    const out = pack(
      `${pick(ENCOURAGE)}\n\n🧠 Mini-quiz RDC:\nA) Capitale RDC ?\nB) Langue officielle ?\nC) Couleurs du drapeau ?\n\nRéponds: A=..., B=..., C=...\nJe suis là 😊`,
      { includeMenu: true }
    );
    await sendWhatsApp(from, out);
    await saveMessage(from, "assistant", out);
    return;
  }

  /* ---------------- Admin RDC => DB-first (then AI) ---------------- */
  if (isAdminTopic(text)) {
    const hits = await searchDbAdmin(text);
    const dbContext = hits.length ? JSON.stringify(hits).slice(0, 9000) : "";

    if (!hits.length) {
      const out = pack(
        "Je n’ai pas trouvé cette information dans la base Mwalimu.\n\nTu veux que j’ajoute ce cours dans la base, ou tu veux préciser la province/territoire ? 😊",
        { includeMenu: true }
      );
      await sendWhatsApp(from, out);
      await saveMessage(from, "assistant", out);
      return;
    }

    // Launch with AI: summarize DB + teach + quiz
    const ai = await tutorAnswer({ phone: from, student, userText: text, dbContext });

    const out = pack(`${pick(ENCOURAGE)}\n\n${ai}`, { includeMenu: true });
    await sendWhatsApp(from, out);
    await saveMessage(from, "assistant", out);
    return;
  }

  /* ---------------- General tutoring (launch with AI) ---------------- */
  if (!shouldUseAI()) {
    const out = pack(
      "Je peux t’aider 😊\nTape 1 pour une leçon, 2 pour un exercice, 3 pour un quiz.\n\nOu pose-moi une question précise (matière + classe).",
      { includeMenu: true }
    );
    await sendWhatsApp(from, out);
    await saveMessage(from, "assistant", out);
    return;
  }

  const ai = await tutorAnswer({ phone: from, student, userText: text, dbContext: "" });
  const out = pack(`${pick(ENCOURAGE)}\n\n${ai}`, { includeMenu: true });
  await sendWhatsApp(from, out);
  await saveMessage(from, "assistant", out);
}

/* -------------------- START SERVER ------------------------------------ */
app.listen(PORT, () => {
  console.log("Mwalimu EdTech opérationnel (IA launch, production-grade).");
});
