
/**
* app.js — MWALIMU EdTech (renforcé)
* ✅ Réponses chaleureuses (jamais “sec”)
* ✅ Anti-double réponse WhatsApp (idempotence msg.id)
* ✅ Rappel motivant 05h00 (Africa/Lubumbashi) + lock Postgres (évite double rappel si 2 instances Render)
* ✅ DB (DATABASE_URL) utilisée en priorité pour “souveraineté RDC”
* ✅ Questions civiques sensibles: exige “Source:” + prudence anti-hallucination
* ✅ Si question sensible + ambiguë: Mwalimu pose 1 question de précision avant de répondre
*/

const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

const app = express().use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ----------------------------- HEADER --------------------------------- */
const HEADER_MWALIMU =
  "_🔵🟡🔴 *Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant* 🇨🇩_";

/* -------------------------- WARM STYLE -------------------------------- */
const WARM_STARTERS = [
  "Bonsoir champion 😊 Je suis content de te retrouver.",
  "Heyy 👋 Installe-toi, on va apprendre ensemble tranquillement.",
  "Bonsoir 🌟 Merci d’être là, tu fais un bel effort.",
  "Salut 😊 On y va doucement, je suis avec toi.",
  "Bonsoir 😄 Tu vas y arriver, on avance pas à pas.",
];

function getWarmStarter() {
  return WARM_STARTERS[Math.floor(Math.random() * WARM_STARTERS.length)];
}

function buildReply(content) {
  return `${HEADER_MWALIMU}\n\n${getWarmStarter()}\n\n${content}`;
}

/* ----------------------------- DB ------------------------------------- */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* ------------------------- MEMORY (JSON) ------------------------------- */
const memoryPath = path.join(__dirname, "student_memory.json");
let studentMemory = {};
try {
  studentMemory = fs.existsSync(memoryPath)
    ? JSON.parse(fs.readFileSync(memoryPath, "utf8"))
    : {};
} catch (e) {
  console.error("Erreur lecture student_memory.json:", e.message);
  studentMemory = {};
}

function saveMemorySafe() {
  try {
    fs.writeFileSync(memoryPath, JSON.stringify(studentMemory, null, 2));
  } catch (e) {
    console.error("Erreur écriture student_memory.json:", e.message);
  }
}

/* ------------------- WHATSAPP SEND (centralisé) ------------------------ */
async function sendWhatsApp(to, bodyText) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, text: { body: bodyText } },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );
  } catch (e) {
    console.error("Erreur WhatsApp:", e.response?.data || e.message);
  }
}

/* ----------------- IDÉMPOTENCE (anti double réponse) ------------------- */
const processedIds = new Map();
const DEDUPE_TTL_MS = 15 * 60 * 1000;

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

/* ------------------------- JSON SAFE ---------------------------------- */
function safeJsonParse(text) {
  if (!text || typeof text !== "string") return null;
  try {
    return JSON.parse(text);
  } catch (_) {}
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch (_) {
    return null;
  }
}

/* ------------------ SOUVERAINETÉ + SENSIBLE ---------------------------- */
function isSovereigntyQuestion(text) {
  const t = (text || "").toLowerCase();

  const keywords = [
    "rdc",
    "république démocratique du congo",
    "republique democratique du congo",
    "congo-kinshasa",
    "souveraineté",
    "souverainete",
    "etat",
    "état",
    "constitution",
    "parlement",
    "assemblée",
    "assemblee",
    "sénat",
    "senat",
    "cour constitutionnelle",
    "gouvernement",
    "président",
    "president",
    "premier ministre",
    "frontière",
    "frontiere",
    "frontières",
    "frontieres",
    "territoire",
    "territoires",
    "province",
    "provinces",
    "organisation administrative",
    "capitale",
    "kinshasa",
    "drapeau",
    "hymne",
    "armoiries",
    "indépendance",
    "independance",
    "zaïre",
    "zaire",
    "histoire politique",
    "nationalité",
    "nationalite",
    "citoyenneté",
    "citoyennete",
  ];

  return keywords.some((k) => t.includes(k));
}

function isSensitiveCivicsQuestion(text) {
  const t = (text || "").toLowerCase();
  const words = [
    // institutions/politique
    "constitution",
    "parlement",
    "assemblée",
    "assemblee",
    "sénat",
    "senat",
    "bicam",
    "président",
    "president",
    "premier ministre",
    "gouvernement",
    "opposition",
    "majorité",
    "majorite",
    "élection",
    "election",
    "vote",
    "loi",
    "décret",
    "decret",
    "justice",
    "cour constitutionnelle",
    // souveraineté/sécurité
    "souveraineté",
    "souverainete",
    "armée",
    "armee",
    "far",
    "police",
    "frontière",
    "frontiere",
    // économie/société
    "inflation",
    "dette",
    "budget",
    "pib",
    "taux de change",
    "franc congolais",
    "minerai",
    "cuivre",
    "cobalt",
    "pauvreté",
    "pauvrete",
    "chômage",
    "chomage",
    "inégalité",
    "inegalite",
    // histoire/territoire
    "indépendance",
    "independance",
    "zaïre",
    "zaire",
    "guerre",
    "province",
    "territoire",
    "frontières",
    "frontieres",
    "histoire",
    "géographie",
    "geographie",
  ];
  return words.some((w) => t.includes(w));
}

/* ---- Sensible + ambigu => poser 1 question de précision avant réponse -- */
function isAmbiguousSensitiveQuestion(text) {
  const t = (text || "").toLowerCase().trim();
  if (t.length < 18) return true;

  const vaguePatterns = [
    "explique la politique",
    "explique l'économie",
    "parle-moi de la rdc",
    "parle moi de la rdc",
    "parle-moi du pouvoir",
    "comment ça marche",
    "comment ca marche",
    "c'est quoi le système",
    "cest quoi le systeme",
    "forme de l'état",
    "forme de l etat",
    "système politique",
    "systeme politique",
    "bicam",
    "gouvernement",
    "parlement",
    "constitution",
    "élections",
    "elections",
    "budget",
    "inflation",
    "pib",
    "frontières",
    "frontieres",
    "province",
    "territoire",
    "histoire",
  ];

  const hasVague = vaguePatterns.some((p) => t.includes(p));

  const hasPrecision =
    /\b(1990|2001|2002|2003|2006|2011|2018|2023|2024|2025|2026)\b/.test(t) ||
    t.includes("article") ||
    t.includes("art.") ||
    t.includes("chapitre") ||
    t.includes("titre") ||
    t.includes("assemblée nationale") ||
    t.includes("assemblee nationale") ||
    t.includes("sénat") ||
    t.includes("senat") ||
    t.includes("cour constitutionnelle") ||
    t.includes("kinshasa") ||
    t.includes("lubumbashi") ||
    t.includes("haut-katanga") ||
    t.includes("haut katanga");

  return hasVague && !hasPrecision;
}

function buildClarifyQuestion(text) {
  const t = (text || "").toLowerCase();

  if (t.includes("bicam") || t.includes("parlement")) {
    return "Tu veux comprendre (1) la composition du Parlement (Assemblée + Sénat) ou (2) le rôle de chaque chambre ? Réponds 1 ou 2 😊";
  }
  if (t.includes("constitution") || t.includes("article") || t.includes("art.")) {
    return "Tu parles de la Constitution de 2006 (et ses révisions) ou d’un article précis ? Donne-moi l’article ou le thème 😊";
  }
  if (t.includes("élection") || t.includes("election") || t.includes("vote")) {
    return "Tu veux parler des élections présidentielles, législatives ou provinciales ? 😊";
  }
  if (t.includes("inflation") || t.includes("pib") || t.includes("budget") || t.includes("taux de change")) {
    return "Tu veux une explication simple, ou un exemple concret avec la vie quotidienne (prix, salaire, FC) ? 😊";
  }
  if (t.includes("frontière") || t.includes("frontiere") || t.includes("province") || t.includes("territoire")) {
    return "Tu parles de quelle province/zone exactement ? (ex: Haut-Katanga, Kasaï, Nord-Kivu…) 😊";
  }

  return "Tu veux que je t’explique le principe général, ou un point précis ? Donne-moi le point précis 😊";
}

/* -------------------- DB SEARCH (souveraineté) ------------------------- */
async function searchDbSovereignty(question) {
  try {
    const q = (question || "").trim();
    if (!q) return [];

    // À optimiser si tu connais tes colonnes exactes (titre/contenu/chapitre/etc.)
    const geo = await pool.query(
      `SELECT 'geo' AS source, *
       FROM drc_geographie
       WHERE CAST(drc_geographie AS TEXT) ILIKE $1
       LIMIT 6`,
      [`%${q}%`]
    );

    const hist = await pool.query(
      `SELECT 'hist' AS source, *
       FROM drc_histoire_ancienne
       WHERE CAST(drc_histoire_ancienne AS TEXT) ILIKE $1
       LIMIT 6`,
      [`%${q}%`]
    );

    return [...geo.rows, ...hist.rows];
  } catch (e) {
    console.error("Erreur DB search:", e.message);
    return [];
  }
}

/* ------------------ PROMPT MWALIMU (pro) ------------------------------- */
const MWALIMU_SYSTEM_PROMPT = `
Tu es MWALIMU EDTECH, un précepteur congolais chaleureux, patient, proche de l’élève.

STYLE
- Interdit: "Comment puis-je vous aider ?"
- Ton humain, encourageant, rassurant.
- Explications simples + 1 exemple.
- Si tu n’es pas sûr d’un fait précis (nom/date/chiffre): tu le dis clairement.

RÈGLE SOURCES (OBLIGATOIRE)
- Tu commences TOUJOURS la réponse par une ligne:
  "Source: ..."
Formats autorisés:
- "Source: Base Mwalimu (DB)"
- "Source: Connaissance générale"
- "Source: Base Mwalimu (DB) + Connaissance générale"

RÈGLE SOUVERAINETÉ RDC
- Si DB_CONTEXT est fourni et pertinent: utilise-le d’abord.
- Si DB_CONTEXT ne contient pas la réponse:
  tu peux compléter avec connaissance générale fiable,
  mais sans inventer (et si doute => dis-le).

STRUCTURE FIN
- Termine par:
  (1) 1 question courte de vérification
  (2) mini-quiz (3 questions max)
`;

/* ------------------- LOCK POSTGRES (cron) ------------------------------ */
async function tryAcquireLock(lockKeyInt) {
  try {
    const r = await pool.query("SELECT pg_try_advisory_lock($1) AS ok", [lockKeyInt]);
    return r.rows?.[0]?.ok === true;
  } catch (e) {
    console.error("Erreur lock:", e.message);
    return false;
  }
}

async function releaseLock(lockKeyInt) {
  try {
    await pool.query("SELECT pg_advisory_unlock($1)", [lockKeyInt]);
  } catch (e) {
    console.error("Erreur unlock:", e.message);
  }
}

/* ------------------ RAPPEL MOTIVANT 05H00 ------------------------------ */
cron.schedule(
  "0 5 * * *",
  async () => {
    if ((process.env.ENABLE_DAILY_REMINDER || "true").toLowerCase() !== "true") return;

    const LOCK_KEY = 90500;
    const gotLock = await tryAcquireLock(LOCK_KEY);
    if (!gotLock) return;

    try {
      const students = Object.keys(studentMemory || {});
      if (students.length === 0) return;

      for (const to of students) {
        const name = studentMemory[to]?.profile?.name || "champion";

        // 🔵🟡🔴 au début du paragraphe du rappel (header = 1 fois, rappel = 1 fois)
        const reminder =
          `🔵🟡🔴 Bonjour ${name} 😊🌅\n\n` +
          `Un petit mot pour te rappeler que chaque jour d’étude te rapproche de ton rêve.\n` +
          `Je suis là avec toi aujourd’hui 📚\n\n` +
          `Écris simplement :\n` +
          `1️⃣ leçon\n2️⃣ exercice\n3️⃣ quiz`;

        await sendWhatsApp(to, `${HEADER_MWALIMU}\n\n${reminder}`);
      }
    } catch (e) {
      console.error("Erreur cron 05h00:", e.message);
    } finally {
      await releaseLock(LOCK_KEY);
    }
  },
  { timezone: "Africa/Lubumbashi" }
);

/* ------------------- WEBHOOK VERIFY ----------------------------------- */
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

/* ------------------- WEBHOOK MESSAGE ---------------------------------- */
app.post("/webhook", async (req, res) => {
  const body = req.body;

  // Répondre immédiatement à Meta
  res.sendStatus(200);

  // Ignorer statuts
  if (body.entry?.[0]?.changes?.[0]?.value?.statuses) return;

  const msgObj = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msgObj || msgObj.type !== "text") return;

  // Anti-double réponse
  if (isDuplicate(msgObj.id)) return;

  const from = msgObj.from;
  const text = msgObj.text?.body || "";

  if (!studentMemory[from]) {
    studentMemory[from] = {
      profile: { name: null, grade: null, location: null },
      history: [],
    };
  }

  const profile = studentMemory[from].profile;

  /* -------------------- A) IDENTIFICATION ----------------------------- */
  if (!profile.name || !profile.grade || !profile.location) {
    try {
      const aicheck = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              'Réponds UNIQUEMENT en JSON valide: {"name":null|string,"grade":null|string,"location":null|string}. Sans texte autour.',
          },
          {
            role: "user",
            content: `Texte élève: "${text}". Extrais Nom, Classe, Ville. Si inconnu -> null.`,
          },
        ],
        response_format: { type: "json_object" },
      });

      const raw = aicheck.choices?.[0]?.message?.content || "";
      const found = safeJsonParse(raw);

      if (found) {
        if (found.name) profile.name = found.name;
        if (found.grade) profile.grade = found.grade;
        if (found.location) profile.location = found.location;
        saveMemorySafe();
      }
    } catch (e) {
      console.error("Erreur extraction profil:", e.message);
    }

    let ask = "";
    if (!profile.name) ask = "Dis-moi ton prénom 😊 (comme ça on travaille vraiment ensemble).";
    else if (!profile.grade) ask = `Merci ${profile.name} 😊 Tu es en quelle classe ?`;
    else if (!profile.location) ask = "Et tu es dans quelle ville ou province ? 😊";

    if (ask) {
      await sendWhatsApp(from, buildReply(ask));
      return;
    }
  }

  /* ----------- B) CHECKPOINT: sensible + ambigu => précision ----------- */
  const sensitive = isSensitiveCivicsQuestion(text);
  const ambiguous = sensitive && isAmbiguousSensitiveQuestion(text);

  if (ambiguous) {
    const q = buildClarifyQuestion(text);
    await sendWhatsApp(from, buildReply(q));
    return;
  }

  /* -------------------- C) TUTORAT + DB LOGIC -------------------------- */
  const sovereignty = isSovereigntyQuestion(text);

  let dbContext = "";
  if (sovereignty) {
    const hits = await searchDbSovereignty(text);
    dbContext = hits.length ? JSON.stringify(hits).slice(0, 7000) : "[]";
  }

  try {
    const systemContent = sovereignty
      ? `${MWALIMU_SYSTEM_PROMPT}\n\nDB_CONTEXT=${dbContext}\n\nSENSITIVE=${sensitive}\nSOVEREIGNTY=true`
      : `${MWALIMU_SYSTEM_PROMPT}\n\nDB_CONTEXT=\n\nSENSITIVE=${sensitive}\nSOVEREIGNTY=false`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemContent },
        ...studentMemory[from].history.slice(-6),
        { role: "user", content: text },
      ],
    });

    const aiText =
      completion.choices?.[0]?.message?.content ||
      "Source: Connaissance générale\nJe suis là 😊 Peux-tu reformuler un tout petit peu ?";

    await sendWhatsApp(from, buildReply(aiText));

    studentMemory[from].history.push(
      { role: "user", content: text },
      { role: "assistant", content: aiText }
    );
    saveMemorySafe();
  } catch (e) {
    console.error("Erreur OpenAI:", e.message);
    await sendWhatsApp(
      from,
      buildReply(
        "Source: Connaissance générale\nOups 😅 petit souci technique. Réécris ta question, je suis là."
      )
    );
  }
});

/* -------------------- START SERVER ------------------------------------ */
app.listen(process.env.PORT || 10000, () => {
  console.log("Mwalimu EdTech opérationnel.");
});
