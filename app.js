
/**
* MWALIMU EdTech — app.js (Blindé)
* - Stockage élèves + messages dans Postgres (scalable)
* - Anti-doublon messages via table processed_messages (scalable multi-instances)
* - Rappel 05h00 + advisory lock (évite double envoi)
* - DB prioritaire pour admin (province/territoire/commune) + réponse ferme si DB contient la réponse
* - “j’habite Lubumbashi” = info de profil, pas une question
* - Sensible + ambigu => 1 question de précision (mais pas si province déjà citée)
*/

const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const { Pool } = require("pg");
require("dotenv").config();

const app = express().use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ----------------------------- HEADER --------------------------------- */
const HEADER_MWALIMU =
  "_🔵🟡🔴 *Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant* 🇨🇩_";

/* -------------------------- WARM STYLE -------------------------------- */
const WARM_STARTERS = [
  "Bonsoir champion(ne) 😊 Je suis content de te retrouver.",
  "Bonsoir champion(ne) 🌟 On avance ensemble, tu vas y arriver.",
  "Bonsoir 😊 Installe-toi, on va apprendre tranquillement.",
  "Salut champion(ne) 👋 je suis avec toi pour étudier.",
  "Bonsoir 😊 chaque petit effort te rapproche de ton objectif."
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

/* ---------------------- INIT TABLES (1 fois) -------------------------- */
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      phone TEXT PRIMARY KEY,
      name TEXT,
      grade TEXT,
      location TEXT,
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

  // Anti-doublon scalable (multi-instances)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS processed_messages (
      message_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}
initDb().catch((e) => console.error("initDb error:", e.message));

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

/* ------------- Anti-doublon webhook (scalable Postgres) --------------- */
async function isDuplicateMessageId(messageId) {
  if (!messageId) return false;
  try {
    const r = await pool.query(
      `INSERT INTO processed_messages(message_id) VALUES ($1)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING message_id`,
      [messageId]
    );
    return r.rowCount === 0; // si déjà existant => duplicate
  } catch (e) {
    // En cas d’erreur, on évite de spammer => on traite quand même
    console.error("isDuplicateMessageId error:", e.message);
    return false;
  }
}

/* ----------------------- JSON SAFE (profil) --------------------------- */
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

/* ------------ Profil: “info” vs “question” (FIX Lubumbashi) ----------- */
function looksLikeAQuestion(text) {
  const t = (text || "").trim().toLowerCase();
  if (t.includes("?")) return true;
  const qWords = ["pourquoi", "comment", "combien", "où", "ou", "quel", "quelle", "quels", "quelles", "c'est quoi", "explique"];
  return qWords.some((w) => t.startsWith(w) || t.includes(` ${w} `));
}
function isJustProfileInfo(text) {
  const t = (text || "").toLowerCase();
  const patterns = [
    "j'habite", "je vis", "je suis à", "je suis a", "je suis de",
    "mon nom", "je m'appelle", "m'appelle",
    "je suis en", "classe", "option"
  ];
  return patterns.some((p) => t.includes(p)) && !looksLikeAQuestion(text);
}

/* ------------------ Provinces & admin triggers ------------------------ */
const PROVINCE_KEYWORDS = [
  "kongo central","bas-congo",
  "haut-katanga","haut katanga",
  "lualaba",
  "kinshasa",
  "kasaï","kasai",
  "kasaï central","kasai central",
  "kasaï oriental","kasai oriental",
  "ituri",
  "tshopo",
  "sud-kivu","sud kivu",
  "nord-kivu","nord kivu",
  "maniema",
  "tanganyika",
  "sankuru",
  "mai-ndombe","mai ndombe",
  "kwilu",
  "kwango",
  "mongala",
  "equateur","équateur",
  "bas-uele","bas uele",
  "haut-uele","haut uele",
  "lomami",
  "tsuapa",
  "sud-ubangi","sud ubangi",
  "nord-ubangi","nord ubangi"
];

function isSovereigntyQuestion(text) {
  const t = (text || "").toLowerCase();

  // ✅ Coup 2 : dès qu’on parle d’organisation administrative => DB
  const adminTriggers = [
    "territoire","territoires",
    "province","provinces",
    "commune","communes",
    "district","secteur","chefferie",
    "ville","villes",
    "frontière","frontiere","frontières","frontieres",
    "carte"
  ];
  if (adminTriggers.some(k => t.includes(k))) return true;

  // ✅ si province/lieu cité => DB
  if (PROVINCE_KEYWORDS.some(p => t.includes(p))) return true;

  // institutions/souveraineté classiques
  const keywords = [
    "rdc","république démocratique du congo","republique democratique du congo",
    "souveraineté","souverainete",
    "etat","état",
    "constitution","parlement","assemblée","assemblee","sénat","senat",
    "cour constitutionnelle",
    "gouvernement","président","president","premier ministre",
    "drapeau","hymne","armoiries",
    "indépendance","independance","zaïre","zaire"
  ];
  return keywords.some(k => t.includes(k));
}

/* ------------------ Sensible + ambigu (amélioré) ----------------------- */
function isSensitiveCivicsQuestion(text) {
  const t = (text || "").toLowerCase();
  const words = [
    "constitution","parlement","assemblée","assemblee","sénat","senat","bicam",
    "président","president","premier ministre","gouvernement","opposition",
    "élection","election","vote","loi","décret","decret","justice","cour constitutionnelle",
    "souveraineté","souverainete",
    "inflation","dette","budget","pib","taux de change","franc congolais",
    "pauvreté","pauvrete","chômage","chomage","inégalité","inegalite",
    "indépendance","independance","zaïre","zaire","histoire","géographie","geographie",
    "province","territoire","frontière","frontiere"
  ];
  return words.some(w => t.includes(w));
}

function isAmbiguousSensitiveQuestion(text) {
  const t = (text || "").toLowerCase().trim();

  // ✅ si province déjà citée => pas ambigu
  if (PROVINCE_KEYWORDS.some(p => t.includes(p))) return false;

  if (t.length < 18) return true;

  const vaguePatterns = [
    "explique la politique","explique l'économie",
    "parle-moi de la rdc","parle moi de la rdc","parle-moi du pouvoir",
    "comment ça marche","comment ca marche",
    "c'est quoi le système","cest quoi le systeme",
    "forme de l'état","forme de l etat",
    "système politique","systeme politique",
    "bicam","gouvernement","parlement","constitution",
    "élections","elections","budget","inflation","pib",
    "frontières","frontieres","histoire"
  ];
  const hasVague = vaguePatterns.some(p => t.includes(p));

  const hasPrecision =
    /\b(1990|2001|2002|2003|2006|2011|2018|2023|2024|2025|2026)\b/.test(t) ||
    t.includes("article") || t.includes("art.") ||
    t.includes("assemblée nationale") || t.includes("assemblee nationale") ||
    t.includes("sénat") || t.includes("senat") ||
    t.includes("cour constitutionnelle");

  return hasVague && !hasPrecision;
}

function buildClarifyQuestion(text) {
  const t = (text || "").toLowerCase();

  if (t.includes("territoire") || t.includes("territoires")) {
    return "Tu veux (1) le nombre de territoires, (2) la liste des territoires, ou (3) une courte explication ? Réponds 1, 2 ou 3 😊";
  }
  if (t.includes("province") || t.includes("provinces")) {
    return "Tu veux (1) le nombre de provinces, (2) la liste des provinces, ou (3) une explication ? Réponds 1, 2 ou 3 😊";
  }
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
  return "Tu veux que je t’explique le principe général, ou un point précis ? Donne-moi le point précis 😊";
}

/* -------------------- DB SEARCH (Coup 2 intégré) ----------------------- */
function extractDbKey(question) {
  const q = (question || "").toLowerCase();
  // ✅ clé province si présente
  for (const p of PROVINCE_KEYWORDS) {
    if (q.includes(p)) return p;
  }
  // fallback: quelques mots admin
  if (q.includes("territoire")) return "territoire";
  if (q.includes("province")) return "province";
  if (q.includes("commune")) return "commune";
  return (question || "").trim();
}

async function searchDbSovereignty(question) {
  try {
    const key = extractDbKey(question);
    if (!key) return [];

    const geo = await pool.query(
      `SELECT 'geo' AS source, *
       FROM drc_geographie
       WHERE CAST(drc_geographie AS TEXT) ILIKE $1
       LIMIT 12`,
      [`%${key}%`]
    );

    const hist = await pool.query(
      `SELECT 'hist' AS source, *
       FROM drc_histoire_ancienne
       WHERE CAST(drc_histoire_ancienne AS TEXT) ILIKE $1
       LIMIT 12`,
      [`%${key}%`]
    );

    return [...geo.rows, ...hist.rows];
  } catch (e) {
    console.error("Erreur DB search:", e.message);
    return [];
  }
}

/* ------------------ PROMPT MWALIMU (Coup 1 intégré) ------------------- */
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

RÈGLE ADMINISTRATIVE (IMPORTANT — COUP 1)
- Pour provinces/territoires/communes/villes, tu réponds D’ABORD avec DB_CONTEXT.
- Interdit de dire "ça peut changer" / "il faut vérifier" SI DB_CONTEXT contient déjà la réponse.
- Si DB_CONTEXT est vide, tu dis exactement:
  "Je n’ai pas trouvé cette information dans la base Mwalimu."
  Puis tu proposes: (1) ajouter le cours dans la base, ou (2) demander une précision.

PARALLÉLISME
- Tu peux faire une comparaison avec d’autres pays si cela aide à comprendre (sans inventer de faits).

PHRASES CHARNIÈRES (OBLIGATOIRE)
- Après le mini-quiz, ajoute toujours une phrase de suivi, par exemple:
  "Je suis là 😊 Réponds juste 1, 2, 3…"
  "Prends ton temps et envoie-moi tes réponses."
  "Si tu veux, je te donne aussi un autre exercice."

STRUCTURE FIN
- Termine par:
  (1) 1 question courte de vérification
  (2) mini-quiz (3 questions max)
  (3) 1 phrase charnière (jamais silencieux)
`;

/* ------------------- STUDENTS + HISTORY (Postgres) --------------------- */
async function getStudent(phone) {
  const r = await pool.query(`SELECT phone, name, grade, location FROM students WHERE phone=$1`, [phone]);
  return r.rows[0] || { phone, name: null, grade: null, location: null };
}
async function upsertStudent({ phone, name, grade, location }) {
  await pool.query(
    `INSERT INTO students(phone, name, grade, location, updated_at)
     VALUES ($1,$2,$3,$4,NOW())
     ON CONFLICT (phone)
     DO UPDATE SET name=COALESCE(EXCLUDED.name, students.name),
                   grade=COALESCE(EXCLUDED.grade, students.grade),
                   location=COALESCE(EXCLUDED.location, students.location),
                   updated_at=NOW()`,
    [phone, name || null, grade || null, location || null]
  );
}
async function saveMessage(phone, role, content) {
  await pool.query(`INSERT INTO messages(phone, role, content) VALUES ($1,$2,$3)`, [phone, role, content]);
}
async function loadRecentHistory(phone, limit = 6) {
  const r = await pool.query(
    `SELECT role, content FROM messages WHERE phone=$1 ORDER BY created_at DESC LIMIT $2`,
    [phone, limit]
  );
  // remettre dans l’ordre chronologique
  return r.rows.reverse().map(m => ({ role: m.role, content: m.content }));
}

/* ------------------- LOCK POSTGRES (cron) ------------------------------ */
async function tryAcquireLock(lockKeyInt) {
  const r = await pool.query("SELECT pg_try_advisory_lock($1) AS ok", [lockKeyInt]);
  return r.rows?.[0]?.ok === true;
}
async function releaseLock(lockKeyInt) {
  await pool.query("SELECT pg_advisory_unlock($1)", [lockKeyInt]);
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
      // Pour 200k, on n’envoie pas à tous d’un coup ici (risque rate-limit WhatsApp).
      // On envoie aux “actifs” (ex: derniers 2 jours). Ajuste si tu veux.
      const r = await pool.query(`
        SELECT DISTINCT phone
        FROM messages
        WHERE created_at >= NOW() - INTERVAL '2 days'
        LIMIT 5000
      `);

      for (const row of r.rows) {
        const to = row.phone;
        const st = await getStudent(to);
        const name = st.name || "champion";

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
  res.sendStatus(200);

  if (body.entry?.[0]?.changes?.[0]?.value?.statuses) return;

  const msgObj = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msgObj || msgObj.type !== "text") return;

  // ✅ Anti-doublon multi-instances (blindé)
  if (await isDuplicateMessageId(msgObj.id)) return;

  const from = msgObj.from;
  const text = msgObj.text?.body || "";

  // Charger élève depuis DB
  let profile = await getStudent(from);

  /* ------------------ A) IDENTIFICATION (1 message global) ------------ */
  if (!profile.name || !profile.grade || !profile.location) {
    // 1) si l'élève envoie une info de profil simple => on enregistre + on confirme court
    if (isJustProfileInfo(text)) {
      // tenter d’extraire sans déclencher “cours sur Lubumbashi”
      try {
        const aicheck = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: 'Réponds UNIQUEMENT en JSON: {"name":null|string,"grade":null|string,"location":null|string}.' },
            { role: "user", content: `Texte élève: "${text}". Extrais Nom, Classe, Ville. Si inconnu -> null.` }
          ],
          response_format: { type: "json_object" },
        });

        const found = safeJsonParse(aicheck.choices?.[0]?.message?.content || "") || {};

        // ✅ empêcher "Mwalimu" comme nom d’élève
        if (found?.name && found.name.toLowerCase().includes("mwalimu")) found.name = null;

        await upsertStudent({
          phone: from,
          name: found.name || null,
          grade: found.grade || null,
          location: found.location || null,
        });

        profile = await getStudent(from);
      } catch (e) {
        console.error("Erreur extraction profil (info):", e.message);
      }

      let confirm = "Parfait 😊 j’ai bien noté. ";
      if (!profile.name || !profile.grade || !profile.location) {
        confirm +=
          "Avant de commencer, dis-moi en un seul message :\n\n" +
          "1️⃣ Ton prénom\n" +
          "2️⃣ Ta classe\n" +
          "3️⃣ Ta ville ou province\n\n" +
          "Je suis là, prends ton temps ✍️";
      } else {
        confirm += "Super ! Tu veux commencer par (1) leçon (2) exercice (3) quiz ? 😊";
      }

      await sendWhatsApp(from, buildReply(confirm));
      return;
    }

    // 2) Sinon, on demande DIRECTEMENT tout en une fois (prise de contact)
    const ask =
      "Avant de commencer 😊 dis-moi en un seul message :\n\n" +
      "1️⃣ Ton prénom\n" +
      "2️⃣ Ta classe (ex: 6e primaire, 8e, 1re, 4e des humanités…)\n" +
      "3️⃣ Ta ville ou province\n\n" +
      "Je suis là, prends ton temps ✍️";

    await sendWhatsApp(from, buildReply(ask));
    return;
  }

  /* ----------- B) CHECKPOINT: sensible + ambigu => précision ----------- */
  const sensitive = isSensitiveCivicsQuestion(text);
  const ambiguous = sensitive && isAmbiguousSensitiveQuestion(text);
  if (ambiguous) {
    await sendWhatsApp(from, buildReply(buildClarifyQuestion(text)));
    return;
  }

  /* -------------------- C) TUTORAT + DB LOGIC -------------------------- */
  const sovereignty = isSovereigntyQuestion(text);

  let dbContext = "";
  if (sovereignty) {
    const hits = await searchDbSovereignty(text);
    dbContext = hits.length ? JSON.stringify(hits).slice(0, 9000) : "[]";
  }

  try {
    const history = await loadRecentHistory(from, 6);

    const systemContent = sovereignty
      ? `${MWALIMU_SYSTEM_PROMPT}\n\nDB_CONTEXT=${dbContext}`
      : `${MWALIMU_SYSTEM_PROMPT}\n\nDB_CONTEXT=`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemContent },
        ...history,
        { role: "user", content: text },
      ],
    });

    const aiText =
      completion.choices?.[0]?.message?.content ||
      "Source: Connaissance générale\nJe suis là 😊 Peux-tu reformuler un tout petit peu ?";

    await sendWhatsApp(from, buildReply(aiText));

    // ✅ sauvegarde scalable
    await saveMessage(from, "user", text);
    await saveMessage(from, "assistant", aiText);
  } catch (e) {
    console.error("Erreur OpenAI:", e.message);
    await sendWhatsApp(
      from,
      buildReply("Source: Connaissance générale\nOups 😅 petit souci technique. Réécris ta question, je suis là.")
    );
  }
});

/* -------------------- START SERVER ------------------------------------ */
app.listen(process.env.PORT || 10000, () => {
  console.log("Mwalimu EdTech opérationnel.");
});
