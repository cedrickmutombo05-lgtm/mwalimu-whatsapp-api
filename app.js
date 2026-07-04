

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cron = require("node-cron");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const pdfParse = require("pdf-parse");

axios.defaults.timeout = 15000;

const app = express();
app.set("trust proxy", 1);

/* =========================================================
   1) CONFIG
========================================================= */
function requireEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

const PORT = process.env.PORT || 10000;
const GEMINI_API_KEY = requireEnv("GEMINI_API_KEY");
const DATABASE_URL = requireEnv("DATABASE_URL");
const TOKEN = requireEnv("TOKEN");
const PHONE_NUMBER_ID = requireEnv("PHONE_NUMBER_ID");
const VERIFY_TOKEN = requireEnv("VERIFY_TOKEN");
const APP_SECRET = requireEnv("APP_SECRET");

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 20
});

pool.on("error", (err) => {
  logError("postgres_idle", err);
});

app.use(express.json({
  limit: "2mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests"
});

app.use(webhookLimiter);

/* =========================================================
   2) LOGS
========================================================= */
function horodatage() {
  return new Date().toISOString();
}

function logInfo(event, meta = {}) {
  console.log(JSON.stringify({
    level: "info",
    event,
    ts: horodatage(),
    ...meta
  }));
}

function logWarn(event, meta = {}) {
  console.warn(JSON.stringify({
    level: "warn",
    event,
    ts: horodatage(),
    ...meta
  }));
}

function logError(event, error, meta = {}) {
  console.error(JSON.stringify({
    level: "error",
    event,
    ts: horodatage(),
    message: error?.message || String(error || ""),
    stack: error?.stack || null,
    data: error?.response?.data || null,
    ...meta
  }));
}

function nowMs() {
  return Date.now();
}

/* =========================================================
   3) CONSTANTES
========================================================= */
const HEADER_MWALIMU = "🔴🟡🔵 *Mwalimu EdTech : Ton Mentor pour l'Excellence* 🇨🇩";

const MAX_PDF_SIZE = 10 * 1024 * 1024;
const MAX_PDF_TEXT_LENGTH = 4000;

const CITATIONS = {
  patriotisme: [
    "***« Aimer sa patrie, c'est la servir avec intelligence, honnêteté et discipline. »***",
    "***« Un bon élève d'aujourd'hui peut devenir un grand bâtisseur du Congo de demain. »***"
  ],
  geographie: [
    "***« Connaître son pays, c'est déjà commencer à mieux l'aimer. »***",
    "***« La géographie aide à mieux comprendre le monde et à mieux servir sa patrie. »***"
  ],
  mathematiques: [
    "***« La rigueur dans le calcul forme aussi la rigueur dans la vie. »***",
    "***« Un esprit qui raisonne bien peut mieux construire l'avenir. »***"
  ],
  histoire: [
    "***« Comprendre l'histoire aide à aimer sa patrie avec plus de conscience. »***",
    "***« Un peuple qui connaît son histoire prépare mieux son avenir. »***"
  ],
  francais: [
    "***« Bien parler et bien écrire donnent de la force à la pensée. »***",
    "***« La maîtrise des mots fortifie l'intelligence et la dignité. »***"
  ],
  sciences: [
    "***« La science bien apprise peut aider à résoudre les vrais problèmes du pays. »***",
    "***« Étudier les sciences, c'est se préparer à être utile à sa nation. »***"
  ],
  civisme: [
    "***« Le civisme commence par de petits actes honnêtes. »***",
    "***« Respecter la loi, c'est aussi participer à la vie de la nation. »***"
  ],
  relationnel: [
    "***« La politesse et le respect élèvent aussi la personne. »***",
    "***« Un cœur discipliné honore sa famille et sa patrie. »***"
  ],
  general: [
    "***« Apprendre avec sérieux aujourd'hui, c'est mieux servir le Congo demain. »***",
    "***« Le savoir et la discipline font grandir la nation. »***"
  ]
};

const OUVERTURES = [
  "👉 Nous avançons ensemble, pas à pas.",
  "👉 Tu peux m'envoyer ta réponse, et je vais la vérifier avec toi.",
  "👉 Garde confiance, nous allons comprendre cela ensemble."
];

const MATIERE_MATH = "math";
const MATIERE_PHYSIQUE = "physique";
const MATIERE_CHIMIE = "chimie";
const MATIERE_GENERAL = "general";

const REGLE_FORMAT_MATH = `FORMAT OBLIGATOIRE D'ÉCRITURE SCIENTIFIQUE (WhatsApp) :
- Écris les calculs, formules et expressions de manière simple, scolaire et lisible
- Interdiction totale de LaTeX et pseudo-LaTeX
- N'utilise jamais : \\( \\) \\[ \\] \\frac \\sqrt ^{} \\left \\right \\times \\div
- Puissance : x², x³, a², b², cm², cm³, m², m³
- Multiplication : ×
- Division : /
- Fraction simple : 2/5, 3/4, 7/10
- Exemple correct : D = b² - 4ac
- Exemple correct : x = (-b ± √D) / 2a
- Pour la racine, écris : √9
- Les molécules doivent être propres : H₂O, CO₂, O₂, H₂SO₄, NaCl`;

const REGLE_CALCUL_INTELLIGENT = `RÈGLES SPÉCIALES POUR LES CALCULS :
- Sois rigoureux
- Vérifie chaque étape
- Avance ligne par ligne
- Explique la logique avant le résultat
- N'invente jamais un chiffre, une unité ou une formule`;

const SYSTEM_BASE = `Tu es Mwalimu EdTech, un précepteur numérique congolais, humain, chaleureux, rigoureux, pédagogue et bienveillant.
MISSION :
- Aider l'élève à comprendre
- Guider sans faire le travail à sa place
- Expliquer comme un vrai précepteur
- Utiliser un ton humain, simple, motivant et respectueux
- Adapter le niveau à la classe de l'élève
- Te référer au contexte scolaire de la RDC lorsque c'est pertinent
STYLE OBLIGATOIRE :
- Réponse claire, naturelle et brève
- Évite les répétitions
- Ne sois jamais bavard
- Ne félicite pas exagérément
- N'écris pas "bravo" sauf si l'élève a réellement bien répondu, corrigé juste ou fourni une bonne démarche
- Évite les compliments excessifs comme "future avocate", "futur avocat", "œil de lynx" ou autres formules théâtrales
- Le début doit être humain et simple
- N'utilise pas toujours "Ah, prénom"
- N'utilise pas toujours le prénom au début
- Quand tu utilises le prénom, fais-le naturellement
- Si l'élève dit juste bonjour, bonsoir, merci, bonne nuit, réponds humainement et normalement, sans structure pédagogique
- Quand il faut une vraie réponse pédagogique, la structure est :
🔵 [VÉCU]
🟡 [SAVOIR]
🔴 [INSPIRATION]
❓ [CONSOLIDATION]
${REGLE_CALCUL_INTELLIGENT}
${REGLE_FORMAT_MATH}`;

const SYSTEM_TUTORAT = `RÈGLES DE TUTORAT :
- Tu es un précepteur, pas un solveur automatique
- Pour un exercice : méthode d'abord, réponse finale seulement si nécessaire
- Pour maths/physique/chimie : guider pas à pas
- Pour une correction : corrige avec douceur et précision`;

const SYSTEM_JURIDIQUE_WEB = `RÈGLES JURIDIQUES ET WEB :
- Pour droit, loi, code, article, OHADA, fiscalité, procédure : utilise Google Search si nécessaire
- N'invente jamais un article ou une source
- Si un article exact est trouvé de manière fiable, recopie-le d'abord puis commente brièvement
- Si le texte exact n'est pas certain, dis-le honnêtement`;

const SYSTEM_GEO_WEB = `RÈGLES GÉOGRAPHIE / ADMINISTRATION :
- Pour province, territoire, commune, ville, secteur, chefferie, subdivision administrative : privilégie le web si nécessaire
- Si la question demande une liste complète, donne la liste complète trouvée
- N'invente jamais un nom manquant
- Si tu n'es pas sûr qu'une liste soit exhaustive, dis-le honnêtement
- Pour le Haut-Katanga, la RDC, provinces et subdivisions, sois particulièrement précis
- Quand tu donnes une liste administrative, recopie tous les éléments trouvés, pas seulement une partie`;

const JSON_SCHEMA_INTENTION = {
  type: "OBJECT",
  properties: {
    intention: { type: "STRING" },
    matiere: { type: "STRING" },
    besoinCorrectionRenforcee: { type: "BOOLEAN" },
    sujet: { type: "STRING" }
  },
  required: ["intention", "matiere", "besoinCorrectionRenforcee", "sujet"]
};

const JSON_SCHEMA_AUDIO = {
  type: "OBJECT",
  properties: {
    transcription: { type: "STRING" },
    type: { type: "STRING" }
  },
  required: ["transcription", "type"]
};

const JSON_SCHEMA_DECISION = {
  type: "OBJECT",
  properties: {
    intention: { type: "STRING" },
    route: { type: "STRING" },
    besoinIA: { type: "BOOLEAN" },
    besoinWeb: { type: "BOOLEAN" },
    bypassFormat: { type: "BOOLEAN" },
    raison: { type: "STRING" }
  },
  required: ["intention", "route", "besoinIA", "besoinWeb", "bypassFormat", "raison"]
};

/* =========================================================
   4) CACHE TTL
========================================================= */
class TTLCache {
  constructor({ ttlMs = 60_000, maxEntries = 500, cleanupIntervalMs = 120_000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map();
    this.timer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    entry.lastAccess = Date.now();
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.store.size >= this.maxEntries) {
      this.evictOldest();
    }
    this.store.set(key, {
      value,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      expiresAt: Date.now() + ttlMs
    });
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }

  evictOldest() {
    let oldestKey = null;
    let oldestAccess = Infinity;
    for (const [key, entry] of this.store.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }
}

const cache = new TTLCache({
  ttlMs: 60_000,
  maxEntries: 1000,
  cleanupIntervalMs: 120_000
});

function makeCacheKey(user = {}, texte = "") {
  const classe = String(user?.classe || "").toLowerCase().trim();
  const nom = String(user?.nom || "").toLowerCase().trim();
  const q = normaliserTexteMemoire(texte);
  return `${nom}|${classe}|${q}`;
}

function getCache(key) {
  return cache.get(key);
}

function setCache(key, value) {
  cache.set(key, value);
}

/* =========================================================
   5) QUEUE PAR NUMÉRO
========================================================= */
const processingQueues = new Map();

function runSequentialByKey(key, task) {
  const previous = processingQueues.get(key) || Promise.resolve();
  const execution = previous
    .catch(() => {})
    .then(() => task());

  const tracked = execution.finally(() => {
    if (processingQueues.get(key) === tracked) {
      processingQueues.delete(key);
    }
  });

  processingQueues.set(key, tracked);
  return tracked;
}

/* =========================================================
   6) OUTILS SIMPLES
========================================================= */
function pick(arr = []) {
  if (!arr.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function safeJsonParse(v, fallback) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function normaliserNom(nom = "") {
  return String(nom || "").trim().replace(/\s+/g, " ");
}

function nettoyer(texte = "") {
  return String(texte || "")
    .replace(/je m'appelle|mon nom est|mon prénom est|je suis en|ma classe est|mon rêve est|je veux devenir/gi, "")
    .replace(/^devenir\s+/i, "")
    .replace(/^être\s+/i, "")
    .replace(/[.,!?;: ]+/g, " ")
    .trim();
}

function tronquerTexte(texte = "", max = 3500) {
  const t = String(texte || "").trim();
  return t.length <= max ? t : `${t.slice(0, max)}...`;
}

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estErreurQuotaGemini(err) {
  const msg = String(err?.message || "").toLowerCase();
  const data = String(err?.response?.data ? JSON.stringify(err.response.data) : "").toLowerCase();
  return msg.includes("429") || msg.includes("quota") || data.includes("429") || data.includes("quota");
}

function genreEleve(nom = "") {
  const prenom = String(nom || "").trim().split(" ")[0].toLowerCase();
  const prenomsFeminins = [
    "dora", "marie", "anne", "anna", "annie", "anuarite", "ruth", "grace",
    "esther", "sarah", "sara", "debora", "fatou", "chantal", "nadine",
    "joyce", "mireille", "patience", "rebecca", "prisca", "gloria",
    "divine", "naomie", "noella", "blandine", "huguette"
  ];
  if (prenomsFeminins.includes(prenom)) return "ma chère";
  return "mon cher";
}

function premierPrenom(nom = "") {
  return normaliserNom(nom).split(" ")[0] || "élève";
}

function construireAppelNaturel(user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  return pick([prenom, `**${prenom}**`]);
}

function construireAppel(user = {}) {
  return construireAppelNaturel(user);
}

function normaliserMessageCourt(texte = "") {
  return String(texte || "")
    .toLowerCase()
    .replace(/[.,!?;:()"'`´']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function retirerAccents(texte = "") {
  return String(texte || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normaliserTexteRelationnel(texte = "") {
  let t = retirerAccents(String(texte || "").toLowerCase());
  t = t
    .replace(/[-_]/g, " ")
    .replace(/[.,!?;:()"`''´]/g, " ")
    .replace(/\bmwalimu\b/g, " ")
    .replace(/\bmon\s+cher\b/g, " ")
    .replace(/\bma\s+chere\b/g, " ")
    .replace(/\bcher\b/g, " ")
    .replace(/\bchere\b/g, " ")
    .replace(/\bs il te plait\b/g, " ")
    .replace(/\bsvp\b/g, " ")
    .replace(/\bstp\b/g, " ")
    .replace(/\beuh\b/g, " ")
    .replace(/\bah\b/g, " ")
    .replace(/\boh\b/g, " ")
    .replace(/\bhum\b/g, " ")
    .replace(/\bhein\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  t = t
    .replace(/^mercii+$/i, "merci")
    .replace(/^mersi$/i, "merci")
    .replace(/^mercie$/i, "merci")
    .replace(/^okai$/i, "okay")
    .replace(/^okey$/i, "okay")
    .replace(/^okayy+$/i, "okay")
    .replace(/^o k$/i, "ok")
    .replace(/^dac$/i, "d accord")
    .replace(/^dacc$/i, "d accord")
    .replace(/^ca vas$/i, "ca va")
    .replace(/^sa va$/i, "ca va")
    .replace(/^cc$/i, "cc")
    .trim();

  return t;
}

function adapterTexteGenre(texte = "", nom = "") {
  const appel = construireAppel({ nom });
  return String(texte || "")
    .replace(/ma chère\s+\*\*[^*]+\*\*/gi, appel)
    .replace(/mon cher\s+\*\*[^*]+\*\*/gi, appel)
    .replace(/ma chère\s+[^,\n]+/gi, appel)
    .replace(/mon cher\s+[^,\n]+/gi, appel)
    .replace(/mon élève/gi, appel)
    .replace(/cher élève/gi, appel);
}

function nettoyerAppelsRepetitifs(texte = "", nom = "") {
  let t = adapterTexteGenre(texte, nom);
  t = t.replace(/(ma chère|mon cher)\s+\*\*[^\*]+\*\*/gi, construireAppel({ nom }));
  return t;
}

function supprimerFormulesLourdesDAppel(texte = "", user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  let t = String(texte || "");

  t = t.replace(/\bAh,\s*\*\*[^*]+\*\*,?\s*/gi, "");
  t = t.replace(/\bAh,\s*[^,\n]+,?\s*/gi, "");
  t = t.replace(/\bc'est une excellente question qui nous emmène dans un tout autre domaine, celui de l'histoire\s*!?/gi, "");
  t = t.replace(/\bfuture avocate\b/gi, "");
  t = t.replace(/\bfutur avocat\b/gi, "");
  t = t.replace(/\bmon cher\b/gi, prenom);
  t = t.replace(/\bma chère\b/gi, prenom);
  t = t.replace(/\bcher élève\b/gi, prenom);
  t = t.replace(/\bmon élève\b/gi, prenom);

  return t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/* =========================================================
   DÉTECTION SOCIALE
========================================================= */
function estMessagePurementSocial(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  const academiqueFort = [
    /\bexplique\b/,
    /\bexplique moi\b/,
    /\bc est quoi\b/,
    /\bqu est ce que\b/,
    /\bcalcule\b/,
    /\bcalculer\b/,
    /\bresous\b/,
    /\bresoudre\b/,
    /\bequation\b/,
    /\bexercice\b/,
    /\bprobleme\b/,
    /\bdevoir\b/,
    /\bcorrige cet exercice\b/,
    /\bcorrection de\b/,
    /\bdefinition\b/,
    /\bdefinis\b/,
    /\bresume\b/,
    /\bmath\b/,
    /\bmaths\b/,
    /\bphysique\b/,
    /\bchimie\b/,
    /\bgeographie\b/,
    /\bhistoire\b/,
    /\bfrancais\b/,
    /\bdroit\b/,
    /\bloi\b/,
    /\barticle\b/,
    /\bprovince\b/,
    /\bterritoire\b/,
    /\bcommune\b/,
    /\bcours\b/,
    /\blecon\b/,
    /\bchapitre\b/
  ];

  const socialExplicite = [
    /^(bonjour|bonsoir|salut|hello|coucou|bjr|bsr|mbote|yo|cc|slt)\b/,
    /^(merci|merci beaucoup|grand merci|mille mercis|merci infiniment|merci encore|merci bien|merci a toi|je te remercie|je vous remercie|thanks|thx)\b/,
    /^(ok|okay|d accord|dac|dacc|oui|non|entendu|compris|parfait|tres bien|nickel|ca marche)$/,
    /^(bonne nuit|fais de beaux reves|dors bien|bonne soiree|bonne journee|bonne matinee|bon apres midi|bon week end|bon weekend|a demain|a bientot)\b/,
    /\b(comment tu vas|comment vas tu|tu vas bien|vous allez bien|comment ca va|ca va|et toi|et vous)\b/,
    /\b(je vais bien|je vais tres bien|je vais super bien|je me porte bien|je me porte tres bien|je me sens bien|ca va merci|bien merci|tranquille|tranquille merci|pas mal|au top|ca roule|imboko)\b/,
    /\b(tu m ecoutes|m ecoutes|tu es la|tu es encore la|tu me suis|tu me lis|tu m entends)\b/,
    /\b(je t ecoute|je suis la|vas y|continue|poursuis|reprends)\b/,
    /\b(ce n est pas ca|ce n est pas la bonne maniere|ce n est pas la bonne facon|tu as mal repondu|mauvaise reponse|tu ne comprends pas|tu n as pas compris|reponds mieux|sois naturel|parle normalement)\b/,
    /\b(c est bon|c est bien|pas de souci|pas de probleme|on continue|allons y|d accord on continue)\b/
  ];

  if (socialExplicite.some((regex) => regex.test(t))) {
    const socialFort = /\b(comment tu vas|comment vas tu|tu vas bien|comment ca va|ca va|et toi|tu m ecoutes|tu es la)\b/.test(t);
    if (socialFort) return true;
    if (academiqueFort.some((regex) => regex.test(t))) return false;
    return true;
  }

  if (/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\s]+$/u.test(t)) return true;

  return false;
}


function estMessageSalutation(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;
  return (
    /^(bonjour|bonsoir|salut|hello|coucou|bjr|mbote|yo|cc)$/.test(t) ||
    /^(bonne?\s+nuit)$/.test(t) ||
    /^(bonne?\s+soiree)$/.test(t) ||
    /^(bonne?\s+journee)$/.test(t) ||
    /^(bonne?\s+matinee)$/.test(t) ||
    /^(bon(ne)?\s+apres\s+midi)$/.test(t) ||
    /^(bon(ne)?\s+week\s*end)$/.test(t) ||
    /^(bon(ne)?\s+weekend)$/.test(t) ||
    /^(a\s+demain)$/.test(t) ||
    /^(bon\s+reveil)$/.test(t) ||
    /^(re\s*bonjour)$/.test(t)
  );
}

function estMessageRemerciement(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;
  const exacts = [
    "merci",
    "merci beaucoup",
    "grand merci",
    "mille mercis",
    "merci infiniment",
    "merci encore",
    "merci bien",
    "un grand merci",
    "vraiment merci",
    "ok merci",
    "okay merci",
    "d accord merci",
    "merci pour tout",
    "merci pour ton aide",
    "merci pour votre aide",
    "je te remercie",
    "je vous remercie",
    "je te dis merci",
    "je vous dis merci"
  ];
  if (exacts.includes(t)) return true;
  return (
    /^merci$/.test(t) ||
    /^merci\s+beaucoup$/.test(t) ||
    /^grand\s+merci$/.test(t) ||
    /^mille\s+mercis$/.test(t) ||
    /^merci\s+infiniment$/.test(t) ||
    /^merci\s+encore$/.test(t) ||
    /^merci\s+bien$/.test(t) ||
    /^un\s+grand\s+merci$/.test(t) ||
    /^vraiment\s+merci$/.test(t) ||
    /^merci\s+pour\s+tout$/.test(t) ||
    /^merci\s+pour\s+ton\s+aide$/.test(t) ||
    /^merci\s+pour\s+votre\s+aide$/.test(t) ||
    /^je\s+te\s+remercie$/.test(t) ||
    /^je\s+vous\s+remercie$/.test(t) ||
    /^je\s+te\s+dis\s+merci$/.test(t) ||
    /^je\s+vous\s+dis\s+merci$/.test(t) ||
    /^(ok|okay|d accord)\s+merci$/.test(t)
  );
}

function estMessageCourtHumain(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  return [
    "ok",
    "okay",
    "d accord",
    "oui",
    "non",
    "ca va",
    "bien",
    "super",
    "cool",
    "entendu",
    "compris",
    "parfait",
    "tres bien",
    "nickel",
    "ca marche",
    "ca va merci"
  ].includes(t);
}

function estReponseRelationnelleSimpleIA(texte = "") {
  const t = String(texte || "").trim();
  const n = normaliserMessageCourt(t);
  if (!t) return false;
  if (/🔵\s*\[VÉCU\]|🟡\s*\[SAVOIR\]|🔴\s*\[INSPIRATION\]|❓\s*\[CONSOLIDATION\]/i.test(t)) return false;
  if (t.length > 180) return false;
  return (
    n.startsWith("je t en prie") ||
    n.startsWith("avec plaisir") ||
    n.startsWith("c est normal") ||
    n.startsWith("toujours la") ||
    n.startsWith("bonjour") ||
    n.startsWith("bonsoir") ||
    n.startsWith("salut") ||
    n.startsWith("bonne nuit") ||
    n.startsWith("d accord") ||
    n.startsWith("bonne journee") ||
    n.startsWith("bon apres midi") ||
    n.startsWith("bon week end")
  );
}

function estSoumissionReponse(texte = "") {
  const t = String(texte || "").toLowerCase().trim();
  const indices = [
    "ma réponse", "ma reponse", "j'ai trouvé", "jai trouvé", "j'ai fait",
    "voici ma réponse", "voici ma reponse", "mon résultat", "mon resultat",
    "j'obtiens", "j'ai obtenu", "le résultat est", "le resultat est", "ça donne"
  ];
  if (indices.some((i) => t.includes(i))) return true;
  if (/^[0-9xXyYzZ\s=+\-÷/*().,]+$/.test(t) && t.length <= 80) return true;
  return false;
}

function estQuestionTechnique(texte = "") {
  const t = String(texte || "").toLowerCase();
  const mots = [
    "calcule", "calculer", "résous", "resous", "équation", "equation", "fraction",
    "physique", "chimie", "exercice", "problème", "probleme", "géométrie",
    "geometrie", "puissance", "racine", "math", "maths", "formule"
  ];
  return mots.some((m) => t.includes(m));
}

function normaliserTexteMemoire(texte = "") {
  return String(texte || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extraireSujetMemoire(texte = "") {
  const t = normaliserTexteMemoire(texte);
  if (!t || estMessageRelationnelSimple(texte)) return "";
  const sujets = [
    "nepal", "chine", "geographie", "math", "mathematiques", "equation",
    "fraction", "histoire", "francais", "grammaire", "impot", "taxe",
    "civisme", "rdc", "congo", "province", "territoire", "constitution",
    "droit", "sciences", "physique", "chimie", "haut katanga", "commune", "ville"
  ];
  for (const s of sujets) {
    if (t.includes(s)) return s;
  }
  return t.split(" ").slice(0, 4).join(" ");
}

function retrouverSujetProche(historique = [], texteActuel = "") {
  const actuel = extraireSujetMemoire(texteActuel);
  if (!actuel) return "";
  for (let i = historique.length - 1; i >= 0; i--) {
    const item = historique[i];
    if (!item || item.role !== "user") continue;
    const ancien = extraireSujetMemoire(item.content || "");
    if (ancien && (ancien === actuel || String(item.content || "").toLowerCase().includes(actuel))) {
      return ancien;
    }
  }
  return "";
}

function construirePhraseRetourMemoire(historique = [], texteActuel = "", user = {}) {
  if (estMessageRelationnelSimple(texteActuel)) return "";
  const sujet = retrouverSujetProche(historique, texteActuel);
  const prenom = premierPrenom(user?.nom || "");
  if (!sujet) return "";
  return `🔵 [VÉCU] : Nous revenons sur ${sujet}, ${prenom}. Prenons cela calmement.`;
}

function detecterMatierePrincipale(question = "", corps = "") {
  const q = String(question || "").toLowerCase().trim();
  const c = String(corps || "").toLowerCase().trim();
  const scores = { droit: 0, geographie: 0, histoire: 0, math: 0, physique: 0, chimie: 0, francais: 0, general: 0 };
  const ajouter = (theme, motsQuestion = [], motsCorps = [], poidsQuestion = 6, poidsCorps = 1) => {
    for (const mot of motsQuestion) { if (q.includes(mot)) scores[theme] += poidsQuestion; }
    for (const mot of motsCorps) { if (c.includes(mot)) scores[theme] += poidsCorps; }
  };
  ajouter("droit",["droit", "droit positif", "loi", "code", "article", "juridique", "tribunal", "ohada", "constitution"],["droit", "loi", "code", "article", "juridique", "tribunal", "ohada", "constitution"]);
  ajouter("geographie",["géographie", "geographie", "province", "territoire", "commune", "ville", "secteur", "chefferie", "subdivision administrative"],["géographie", "geographie", "province", "territoire", "commune", "ville", "secteur", "chefferie"]);
  ajouter("histoire",["histoire", "passé", "passe", "événement passé", "evenement passe", "colonisation", "indépendance", "independance", "royaume", "date historique"],["histoire", "passé", "passe", "colonisation", "indépendance", "independance", "royaume", "date"]);
  ajouter("math",["math", "maths", "équation", "equation", "fraction", "calcul", "racine", "puissance", "géométrie", "geometrie"],["math", "maths", "équation", "equation", "fraction", "calcul", "racine", "puissance"]);
  ajouter("physique",["physique", "force", "vitesse", "énergie", "energie", "masse", "pression", "mouvement"],["physique", "force", "vitesse", "énergie", "energie", "masse", "pression", "mouvement"]);
  ajouter("chimie",["chimie", "molécule", "molecule", "atome", "acide", "base", "solution", "réaction", "reaction"],["chimie", "molécule", "molecule", "atome", "acide", "base", "solution", "réaction", "reaction"]);
  ajouter("francais",["français", "francais", "grammaire", "orthographe", "conjugaison", "verbe", "phrase"],["français", "francais", "grammaire", "orthographe", "conjugaison", "verbe", "phrase"]);
  let meilleur = "general", meilleurScore = 0;
  for (const [theme, score] of Object.entries(scores)) {
    if (score > meilleurScore) { meilleur = theme; meilleurScore = score; }
  }
  return meilleurScore > 0 ? meilleur : "general";
}

function construireVecuNaturel(user = {}, question = "", historique = []) {
  const prenom = premierPrenom(user?.nom || "");
  const sujetMemoire = retrouverSujetProche(historique, question);
  const matiere = detecterMatierePrincipale(question, "");
  if (estMessageRelationnelSimple(question)) {
    return `🔵 [VÉCU] : Je te lis, ${prenom}.`;
  }
  if (sujetMemoire) {
    return pick([
      `🔵 [VÉCU] : D'accord ${prenom}, reprenons cela calmement.`,
      `🔵 [VÉCU] : Très bien ${prenom}, nous revenons sur ce point.`,
      `🔵 [VÉCU] : Allons-y doucement ${prenom}, reprenons ensemble.`
    ]);
  }
  if (matiere === "droit") {
    return pick([
      `🔵 [VÉCU] : D'accord ${prenom}, regardons cette notion de droit simplement.`,
      `🔵 [VÉCU] : Très bien ${prenom}, prenons cette question juridique pas à pas.`,
      `🔵 [VÉCU] : Voyons cela clairement ${prenom}.`
    ]);
  }
  if (matiere === "geographie") {
    return pick([
      `🔵 [VÉCU] : D'accord ${prenom}, regardons ce point de géographie calmement.`,
      `🔵 [VÉCU] : Très bien ${prenom}, prenons cela pas à pas.`,
      `🔵 [VÉCU] : Voyons cela simplement ${prenom}.`
    ]);
  }
  if (matiere === "histoire") {
    return pick([
      `🔵 [VÉCU] : D'accord ${prenom}, regardons cela comme un point d'histoire.`,
      `🔵 [VÉCU] : Très bien ${prenom}, prenons ce sujet d'histoire simplement.`,
      `🔵 [VÉCU] : Voyons cela calmement ${prenom}.`
    ]);
  }
  return pick([
    `🔵 [VÉCU] : D'accord ${prenom}, voyons cela simplement.`,
    `🔵 [VÉCU] : Très bien ${prenom}, prenons cette question pas à pas.`,
    `🔵 [VÉCU] : Je t'accompagne ${prenom}. Regardons l'idée essentielle.`,
    `🔵 [VÉCU] : Bien ${prenom}, allons à l'essentiel.`
  ]);
}

function supprimerDoublonsLignes(texte = "") {
  if (!texte) return "";
  const lignes = String(texte).split("\n").map((l) => l.trimEnd());
  const resultat = [];
  let precedent = "";
  for (const ligne of lignes) {
    const normalisee = ligne.trim().toLowerCase();
    if (normalisee && normalisee === precedent) continue;
    resultat.push(ligne);
    precedent = normalisee;
  }
  return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function nettoyerOuverturesDupliquees(texte = "") {
  const lignes = String(texte || "").split("\n");
  const resultat = [];
  let ouvertureTrouvee = false;
  for (const ligne of lignes) {
    const l = String(ligne || "").trim();
    if (l.startsWith("👉 ")) {
      if (ouvertureTrouvee) continue;
      ouvertureTrouvee = true;
    }
    resultat.push(ligne);
  }
  return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function nettoyerReponseIA(texte = "") {
  if (!texte) return "";
  let t = String(texte);
  t = t.replace(/🔴🟡🔵\s*\*?Mwalimu EdTech\s*:\s*Ton Mentor pour l'Excellence\*?\s*🇨🇩/gi, "");
  t = t.replace(/^\s*🌟\s*Mot d['']encouragement\s*:\s*.*$/gim, "");
  t = t.replace(/^\s*👉\s*Je reste disponible.*$/gim, "");
  t = t.replace(/^\s*👉\s*Continue à me parler.*$/gim, "");
  return supprimerDoublonsLignes(t).replace(/\n{3,}/g, "\n\n").trim();
}

function simplifierNotationMath(texte = "") {
  if (!texte) return "";
  let t = String(texte);
  t = t.replace(/\\times/g, "×");
  t = t.replace(/\\div/g, "/");
  t = t.replace(/\\pm/g, "±");
  t = t.replace(/\\cdot/g, "×");
  t = t.replace(/\\sqrt\{([^}]+)\}/g, "√$1");
  t = t.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1 / $2");
  t = t.replace(/\^2/g, "²");
  t = t.replace(/\^3/g, "³");
  t = t.replace(/[{}]/g, "");
  t = t.replace(/\bH2O\b/g, "H₂O");
  t = t.replace(/\bCO2\b/g, "CO₂");
  t = t.replace(/\bO2\b/g, "O₂");
  return t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function simplifierPresentationScientifique(texte = "") {
  return String(texte || "")
    .replace(/\b([0-9]+)\.([0-9]+)\b/g, "$1,$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function nettoyerSelonMatiere(texte = "", matiere = MATIERE_GENERAL) {
  if ([MATIERE_MATH, MATIERE_PHYSIQUE, MATIERE_CHIMIE].includes(matiere)) {
    return simplifierNotationMath(texte);
  }
  return texte;
}

function reformaterFinalSelonMatiere(texte = "", _matiere = MATIERE_GENERAL) {
  return String(texte || "").replace(/\n{3,}/g, "\n\n").trim();
}

function detecterMatiereScientifique(question = "", reponse = "", fiche = null) {
  const base = [
    String(question || ""),
    String(reponse || ""),
    String(fiche?.matiere || ""),
    String(fiche?.titre || ""),
    String(fiche?.contenu || "").slice(0, 1200),
    String(fiche?.commentaire_ai || "").slice(0, 1200)
  ].join(" ").toLowerCase();
  const score = { math: 0, physique: 0, chimie: 0 };
  ["math", "maths", "équation", "equation", "fraction", "racine", "calcul"].forEach((m) => { if (base.includes(m)) score.math += 2; });
  ["physique", "force", "vitesse", "énergie", "energie", "masse", "distance", "temps"].forEach((m) => { if (base.includes(m)) score.physique += 2; });
  ["chimie", "mol", "solution", "acide", "base", "h2o", "co2", "o2", "nacl"].forEach((m) => { if (base.includes(m)) score.chimie += 2; });
  const maxScore = Math.max(score.math, score.physique, score.chimie);
  if (maxScore <= 0) return MATIERE_GENERAL;
  if (score.chimie === maxScore) return MATIERE_CHIMIE;
  if (score.physique === maxScore) return MATIERE_PHYSIQUE;
  if (score.math === maxScore) return MATIERE_MATH;
  return MATIERE_GENERAL;
}

function appliquerLes4EtapesScientifiques(reponse = "", question = "", fiche = null) {
  const matiere = detecterMatiereScientifique(question, reponse, fiche);
  let texte = String(reponse || "");
  texte = simplifierNotationMath(texte);
  texte = simplifierPresentationScientifique(texte);
  texte = nettoyerSelonMatiere(texte, matiere);
  texte = reformaterFinalSelonMatiere(texte, matiere);
  return { matiere, texte };
}

function blocEstPertinent(bloc = "") {
  const lignes = bloc.split("\n").map(l => l.trim());
  const nbQuestions = lignes.filter(l => l.endsWith("?")).length;
  if (nbQuestions === 0) return false;
  const lignesSignificatives = lignes.filter(l => l && !l.startsWith("A.") && !l.startsWith("B."));
  return lignesSignificatives.some(l => l.length > 5);
}

function remplacerBlocConsolidation(corps = "", question = "", sujet = "") {
  let t = String(corps || "").trim();
  if (!t) return t;
  const blocRegex = /❓\s*\[CONSOLIDATION\][\s\S]*?(?=\n👉|\n🌟|\n\*\*\*«|$)/i;
  const existingBloc = t.match(blocRegex)?.[0] || "";
  if (existingBloc && blocEstPertinent(existingBloc)) {
    return t;
  }
  const newBloc = construireQuestionsConsolidationCiblee(question, t, sujet);
  if (existingBloc) {
    t = t.replace(blocRegex, newBloc);
  } else {
    t = `${t}\n\n${newBloc}`;
  }
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function construireQuestionsConsolidationCiblee(question = "", corps = "", sujet = "") {
  const matiere = detecterMatierePrincipale(question, corps);
  const notion = sujet || extraireSujetMemoire(question) || "cette notion";
  const modeles = {
    droit: `Pour t'assurer d'avoir bien compris : peux-tu m'expliquer en une phrase ce qu'est le/la ${notion} ?`,
    geographie: `Si tu devais citer un exemple concret lié à ${notion}, lequel choisirais-tu ?`,
    histoire: `Quelle est, selon toi, la conséquence la plus importante de ${notion} ?`,
    math: `Essaie de m'expliquer la méthode que tu utiliserais pour résoudre un problème de type "${notion}".`,
    physique: `Comment pourrais-tu vérifier expérimentalement la notion de ${notion} ?`,
    chimie: `Quelle erreur fréquente un élève pourrait-il commettre en travaillant sur ${notion} ?`,
    francais: `Donne-moi un autre exemple de phrase qui illustre la règle de ${notion}.`,
    general: `Résume avec tes mots l'idée principale de ${notion}.`
  };
  return `❓ [CONSOLIDATION]\n${modeles[matiere] || modeles.general}`;
}

function choisirCitationFinale(question = "", corps = "") {
  const matiere = detecterMatierePrincipale(question, corps);
  const citationsMixtes = {
    droit: "***« Un droit compris est un droit mieux défendu, pour soi et pour la nation. »***",
    geographie: "***« Connaître les communes de sa ville, c'est déjà participer à la vie de la cité. »***",
    histoire: "***« Comprendre le passé de son pays, c'est honorer ceux qui l'ont bâti. »***",
    math: "***« Un esprit rigoureux en mathématiques est un esprit prêt à servir avec précision. »***",
    physique: "***« La physique nous apprend à observer le monde ; la citoyenneté, à l'améliorer. »***",
    chimie: "***« La chimie transforme la matière, la détermination transforme le pays. »***",
    francais: "***« Maîtriser sa langue, c'est porter haut la culture de sa nation. »***",
    general: "***« Apprendre aujourd'hui, c'est bâtir un Congo plus fort demain. »***"
  };
  return citationsMixtes[matiere] || citationsMixtes.general;
}

function detecterMatiereFineConclusion(question = "", corps = "") {
  const base = retirerAccents(`${question || ""} ${corps || ""}`.toLowerCase());

  const contient = (mots = []) => mots.some((mot) => base.includes(retirerAccents(String(mot).toLowerCase())));

  if (contient(["photosynthese", "chlorophylle", "plante", "plantes", "feuille", "feuilles", "cellule", "cellules", "biologie", "respiration", "ecosysteme", "organisme", "organismes", "vivant", "vivants", "oxygene", "dioxyde de carbone", "co2", "h2o"])) return "biologie";
  if (contient(["equation", "inequation", "calcul", "fraction", "racine", "puissance", "fonction", "derivee", "integrale", "polynome", "algebre", "geometrie"]) || /[0-9xy]\s*[+\-*/=]/i.test(base)) return "math";
  if (contient(["electricite", "tension", "intensite", "courant", "resistance", "ohm", "volt", "ampere", "circuit", "diode", "transistor", "condensateur"])) return "electricite";
  if (contient(["mecanique", "force", "vitesse", "acceleration", "mouvement", "masse", "poids", "newton", "pression", "energie cinetique", "travail mecanique"])) return "physique";
  if (contient(["chimie", "molecule", "atome", "reaction", "solution", "acide", "base", "nacl", "h2so4"])) return "chimie";
  if (contient(["comptabilite", "debit", "credit", "bilan", "journal", "grand livre", "actif", "passif", "charge", "produit", "amortissement"])) return "comptabilite";
  if (contient(["algorithme", "algorithmique", "programmation", "javascript", "python", "variable", "boucle", "condition", "tableau"])) return "informatique";
  if (contient(["rdm", "resistance des materiaux", "poutre", "contrainte", "deformation", "traction", "flexion", "cisaillement"])) return "technique";

  return detecterMatierePrincipale(question, corps);
}

function choisirCitationContextuelle(reponse = "", question = "") {
  if (estMessageRelationnelSimple(question)) return "";

  const matiere = detecterMatiereFineConclusion(question, reponse);

  const citationsParMatiere = {
    droit: "***« Comprendre le droit, c’est apprendre à défendre la justice avec intelligence. »***",
    geographie: "***« Connaître son pays, c’est déjà commencer à mieux le servir. »***",
    histoire: "***« Comprendre l’histoire aide un peuple à mieux préparer son avenir. »***",
    math: "***« La rigueur dans le calcul forme aussi la rigueur dans la pensée. »***",
    physique: "***« Observer les lois de la nature apprend à raisonner avec précision. »***",
    chimie: "***« Comprendre la matière, c’est mieux comprendre les transformations du monde. »***",
    biologie: "***« Comprendre le vivant, c’est apprendre à respecter la nature et la vie. »***",
    electricite: "***« Maîtriser l’électricité, c’est apprendre à canaliser l’énergie avec intelligence. »***",
    technique: "***« La technique bien comprise transforme la connaissance en solution concrète. »***",
    comptabilite: "***« Une bonne comptabilité éclaire les décisions et protège l’avenir. »***",
    informatique: "***« Un bon raisonnement algorithmique transforme un problème en solution. »***",
    francais: "***« Bien parler et bien écrire donnent de la force à la pensée. »***",
    general: "***« Apprendre avec méthode aujourd’hui, c’est mieux construire demain. »***"
  };

  return citationsParMatiere[matiere] || citationsParMatiere.general;
}

function retirerCitationsFinales(texte = "") {
  return String(texte || "")
    .replace(/^\s*\*\*\*«[^»]+»\*\*\*\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function verifierStructureMwalimu(corps = "", user = {}, historique = [], question = "") {
  let t = String(corps || "").trim();
  const aVecu = /🔵\s*\[VÉCU\]/i.test(t);
  const aSavoir = /🟡\s*\[SAVOIR\]/i.test(t);
  const aInspiration = /🔴\s*\[INSPIRATION\]/i.test(t);
  const aConsolidation = /❓\s*\[CONSOLIDATION\]/i.test(t);
  if (aVecu && aSavoir && aInspiration && aConsolidation) return t;
  const vecu = aVecu ? "" : construireVecuNaturel(user, question, historique);
  const savoir = aSavoir ? "" : "🟡 [SAVOIR] : Voici l'idée essentielle à retenir.";
  const inspiration = aInspiration ? "" : "🔴 [INSPIRATION] : Une notion bien comprise te rend plus solide.";
  const consolidation = aConsolidation ? "" : "❓ [CONSOLIDATION] : Dis-moi maintenant ce que tu retiens.";
  const morceaux = [];
  if (!aVecu) morceaux.push(vecu);
  morceaux.push(t);
  if (!aSavoir) morceaux.push(savoir);
  if (!aInspiration) morceaux.push(inspiration);
  if (!aConsolidation) morceaux.push(consolidation);
  return morceaux.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function choisirOuvertureContextuelle(reponse = "", _user = {}, question = "") {
  const q = String(question || "").trim();
  const qNorm = normaliserTexteRelationnel(q);
  if (estMessageRelationnelSimple(q)) return "";

  let intention = null;
  try {
    intention = detecterIntentionAcademiqueEcrite(q);
  } catch (_) {
    intention = null;
  }

  const estExercice = Boolean(intention?.symbolesResolution || intention?.procedureResolution);
  const estQuestionCours = Boolean(intention?.demandeDefinition) || /\b(qu est ce que|c est quoi|explique|definition|definis)\b/i.test(qNorm);
  const matiere = detecterMatiereFineConclusion(q, reponse);

  if (estExercice) {
    return "👉 Fais l’étape demandée, puis envoie-moi ta réponse pour correction.";
  }

  if (estQuestionCours) {
    return "👉 Réponds d’abord à la question de consolidation, puis nous continuerons.";
  }

  if (matiere === "droit") return "👉 Réponds d’abord à la question de consolidation juridique, puis nous continuerons.";
  if (matiere === "geographie") return "👉 Réponds d’abord à la question de consolidation géographique, puis nous continuerons.";

  return "👉 Réponds d’abord à la question de consolidation, puis nous continuerons.";
}

function choisirEncouragementContextuel(reponse = "", question = "") {
  const corps = String(reponse || "").toLowerCase();
  const q = String(question || "").toLowerCase();
  if (estMessageRelationnelSimple(question)) return "";
  if (corps.includes("je n'arrive pas encore") || corps.includes("petit souci technique") || corps.includes("réessaie") || corps.includes("image plus nette") || corps.includes("message vocal plus clair")) {
    return "🌟 Mot d'encouragement : Ne te décourage pas ; nous pouvons reprendre calmement.";
  }
  const vraieReussite = q.includes("voici ma réponse") || q.includes("ma réponse") || q.includes("j'ai trouvé") || q.includes("j'ai obtenu") || q.includes("cela donne") || q.includes("ça donne") || q.includes("j'obtiens");
  if (vraieReussite && (corps.includes("bonne réponse") || corps.includes("réponse correcte") || corps.includes("exact") || corps.includes("juste"))) {
    return "🌟 Mot d'encouragement : Bon travail ; continue avec cette rigueur.";
  }
  if (corps.includes("méthode") || corps.includes("explication") || corps.includes("à retenir")) {
    return "🌟 Mot d'encouragement : Relis doucement ; une idée bien comprise reste mieux.";
  }
  return "🌟 Mot d'encouragement : Avance pas à pas ; comprendre calmement vaut mieux que se précipiter.";
}

function dernierMessageEstQuestionBienEtre(historique = []) {
  if (!historique.length) return false;
  const dernierAssistant = [...historique].reverse().find(m => m.role === "assistant");
  if (!dernierAssistant) return false;
  const texte = normaliserTexteRelationnel(dernierAssistant.content || "");
  const motifs = [
    "comment vas-tu",
    "comment te sens-tu",
    "comment se passe ta journee",
    "comment s'est passee ta journee",
    "j'espere que tu as bien dormi",
    "contente de te retrouver",
    "ravie de te parler",
    "est-ce que tout va bien pour toi",
    "prete a te detendre",
    "raconte-moi vite comment s'est passee ta journee"
  ];
  if (motifs.some(motif => texte.includes(motif))) return true;
  if (/comment\b.*\bvas\b.*\btu\b/i.test(texte)) return true;
  if (/comment\b.*\bte\b.*\bsens\b/i.test(texte)) return true;
  if (/comment\b.*\bse\b.*\bpasse\b/i.test(texte)) return true;
  if (/est(\s|-)ce(\s|-)que\b.*\bva\b.*\bbien\b/i.test(texte)) return true;
  return false;
}

function estSecondTourSalutation(historique = [], texteUtilisateur = "") {
  if (!dernierMessageEstQuestionBienEtre(historique)) return false;

  const t = normaliserTexteRelationnel(texteUtilisateur);
  if (!t || t.length > 100) return false;

  const academiqueFort = [
    "explique",
    "calcule",
    "calculer",
    "resous",
    "corrige",
    "definition",
    "definis",
    "math",
    "maths",
    "physique",
    "chimie",
    "geographie",
    "histoire",
    "droit",
    "loi",
    "article",
    "exercice",
    "probleme"
  ];

  if (academiqueFort.some((mot) => t.includes(mot))) {
    return false;
  }

  const reponsesBienEtre = [
    "ca va",
    "ca va bien",
    "ca va merci",
    "je vais bien",
    "je vais bien merci",
    "je vais tres bien",
    "je me porte bien",
    "je me sens bien",
    "bien",
    "bien merci",
    "bien et toi",
    "oui ca va",
    "oui ca va merci",
    "tranquille",
    "super",
    "cool",
    "pas mal",
    "tres bien",
    "nickel",
    "au top",
    "imboko",
    "s est bien passee",
    "elle s est bien passee",
    "ma journee s est bien passee",
    "la journee s est bien passee",
    "c etait bien",
    "c etait tres bien",
    "tout s est bien passe",
    "tout va bien",
    "bonne journee",
    "journee bien passee"
  ];

  if (reponsesBienEtre.includes(t)) return true;

  return (
    /^s est bien passee\b/.test(t) ||
    /^elle s est bien passee\b/.test(t) ||
    /^ma journee s est bien passee\b/.test(t) ||
    /^la journee s est bien passee\b/.test(t) ||
    /^tout s est bien passe\b/.test(t) ||
    /^c etait bien\b/.test(t) ||
    /^c etait tres bien\b/.test(t)
  );
}

function genererRepriseApresBienEtre(user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom ? `**${prenom}**` : "toi";
  const accroches = [
    `Tant mieux ${appel} ! 😊 Qu'est-ce que tu aimerais apprendre maintenant ?`,
    `Je suis content de l'entendre ${appel}. Quelle matière te tente aujourd'hui ?`,
    `Heureux de te voir en forme ${appel}. Dis-moi, que veux-tu réviser ?`
  ];
  return pick(accroches);
}

function dernierMessageEstInvitationChoixMatiere(historique = []) {
  if (!historique.length) return false;

  const dernierAssistant = [...historique].reverse().find(m => m.role === "assistant");
  if (!dernierAssistant) return false;

  const texte = normaliserTexteRelationnel(dernierAssistant.content || "");

  const motifs = [
    "prete a explorer une nouvelle notion",
    "pret a explorer une nouvelle notion",
    "explorer une nouvelle notion",
    "revoir quelque chose",
    "ce que tu aimerais etudier aujourd hui",
    "quelle matiere te tente aujourd hui",
    "que veux tu reviser",
    "quelle matiere veux tu travailler",
    "quelle matiere ou quel chapitre",
    "matiere ou chapitre te pose probleme"
  ];

  return motifs.some(motif => texte.includes(motif));
}

function contientChoixMatiere(texte = "") {
  const t = normaliserTexteRelationnel(texte);

  const matieres = [
    "math",
    "maths",
    "mathematiques",
    "francais",
    "anglais",
    "geographie",
    "histoire",
    "physique",
    "chimie",
    "biologie",
    "svt",
    "sciences",
    "droit",
    "civisme",
    "informatique",
    "economie",
    "comptabilite"
  ];

  return matieres.some(matiere => new RegExp(`\\b${matiere}\\b`).test(t));
}

function estReponseGeneriqueExploration(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  const generiques = [
    "oui",
    "oui oui",
    "ok",
    "okay",
    "d accord",
    "je veux explorer",
    "je veux explorer une nouvelle notion",
    "je veux explorer quelque chose",
    "je veux explorer une notion",
    "je veux revoir quelque chose",
    "je veux revoir",
    "je veux revoir une notion",
    "je veux revoir un cours",
    "revoir quelque chose",
    "explorer",
    "revoir",
    "je veux apprendre",
    "je veux etudier",
    "je veux reviser",
    "je veux reviser quelque chose",
    "je suis pret",
    "je suis prete",
    "allons y",
    "on peut commencer",
    "commencons"
  ];

  return generiques.includes(t);
}

function genererRelanceChoixMatiere(user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom ? `**${prenom}**` : "toi";

  return `D'accord ${appel} 😊 Choisis simplement la matière : français, mathématiques, sciences, histoire, géographie, anglais ou une autre matière.`;
}

function contientQuestionAcademique(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t || t.length < 10) return false;

  if (estRelationnelExactCourt(t)) return false;

  const patterns = [
    /\bexplique\b/,
    /\bexplique moi\b/,
    /\bc est quoi\b/,
    /\bc quoi\b/,
    /\bqu est ce que\b/,
    /\bcomment\b/,
    /\bpourquoi\b/,
    /\bquand\b/,
    /\bqui\b/,
    /\bcombien\b/,
    /\bquel\b/,
    /\bquelle\b/,
    /\bquels\b/,
    /\bquelles\b/,
    /\bmath\b/,
    /\bmaths\b/,
    /\bequation\b/,
    /\bcalcul\b/,
    /\bfraction\b/,
    /\bphysique\b/,
    /\bchimie\b/,
    /\bhistoire\b/,
    /\bgeographie\b/,
    /\bfrancais\b/,
    /\bgrammaire\b/,
    /\bconjugaison\b/,
    /\bdroit\b/,
    /\bloi\b/,
    /\barticle\b/,
    /\bconstitution\b/,
    /\bprovince\b/,
    /\bterritoire\b/,
    /\bcommune\b/,
    /\bville\b/,
    /\bexercice\b/,
    /\bprobleme\b/,
    /\baide\b/,
    /\bcomprendre\b/,
    /\bapprendre\b/,
    /\bcours\b/,
    /\blecon\b/,
    /\bchapitre\b/,
    /\bmatiere\b/,
    /\bexamen\b/,
    /\brevision\b/,
    /\bpeux tu\b/,
    /\bdis moi\b/,
    /\bj aimerais\b/,
    /\bje voudrais\b/,
    /\bdonne moi\b/,
    /\bdonne\b/,
    /\bmontre moi\b/,
    /\bmontre\b/,
    /\bcorrige\b/,
    /\bverifie\b/,
    /\bresous\b/,
    /\bresume\b/,
    /\bdefinition\b/,
    /\bdefinis\b/
  ];

  return patterns.some((regex) => regex.test(t));
}

function estRelationnelExactCourt(texte) {
  const t = normaliserTexteRelationnel(texte);
  return t.length < 20 && estMessagePurementSocial(texte);
}

function estMessageRelationnelSimple(texte = "") {
  return estMessagePurementSocial(texte) && !contientQuestionAcademique(texte);
}

/* =========================================================
   FONCTIONS PRINCIPALES
========================================================= */

async function safeAI(fn, fallback) {
  try {
    return await fn();
  } catch (e) {
    logError("safeAI_error", e);
    return fallback;
  }
}

function construireSystemPrompt(user) {
  return `${SYSTEM_BASE}
${SYSTEM_TUTORAT}
${SYSTEM_JURIDIQUE_WEB}
${SYSTEM_GEO_WEB}

Élève : ${user.nom || 'Inconnu'}
Classe : ${user.classe || 'Inconnue'}
Rêve : ${user.reve || 'Inconnu'}`;
}

function typeMessage(msg) {
  if (msg.type === "text" && msg.text?.body) return "text";
  if (msg.type === "image" && msg.image?.id) return "image";
  if (msg.type === "audio" && msg.audio?.id) return "audio";
  if (msg.type === "document" && msg.document?.id && msg.document?.mime_type === "application/pdf") return "pdf";
  if (msg.type === "document") return "document";
  return "inconnu";
}

function toGeminiContents(messages = []) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }]
    }));
}

async function genererAvecRetry(model, params, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await model.generateContent(params);
    } catch (e) {
      if (i === maxRetries - 1) throw e;
      if (estErreurQuotaGemini(e)) {
        await attendre(2000 * (i + 1));
        continue;
      }
      throw e;
    }
  }
}

async function appelerChatCompletion(messages) {
  const systemMessages = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = toGeminiContents(messages);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemMessages,
    tools: [{ googleSearch: {} }]
  });

  const result = await genererAvecRetry(model, {
    contents,
    generationConfig: { temperature: 0.1 }
  });

  return result.response.text();
}

async function appelerJsonStrict({ systemInstruction, prompt, schema, history }) {
  try {
    const fullPrompt = `${systemInstruction}

Historique récent :
${history.map(m => `${m.role}: ${m.content}`).join('\n')}

${prompt}

RÉPONDS UNIQUEMENT AVEC UN OBJET JSON VALIDE selon ce schéma :
${JSON.stringify(schema)}

IMPORTANT: Ne mets PAS de texte avant ou après le JSON. Juste le JSON.`;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("Pas de JSON trouvé dans la réponse");
  } catch (e) {
    logError("appelerJsonStrict", e);
    throw e;
  }
}

async function consulterBibliotheque(texte, classe) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM bibliotheque WHERE 
       (classe = $1 OR classe = '') AND 
       (contenu ILIKE $2 OR titre ILIKE $2) 
       LIMIT 1`,
      [classe || '', `%${texte.slice(0, 100)}%`]
    );
    return rows[0] || null;
  } catch (e) {
    logError("consulterBibliotheque", e);
    return null;
  }
}

function construireConsignePedagogique(texte, type) {
  let consigne = `Tu es Mwalimu EdTech. Tu réponds à un élève de manière pédagogique et bienveillante.

Message de l'élève : "${texte}"

Type de message : ${type}

Consignes :
- Sois clair et pédagogique
- Adapte-toi au niveau de l'élève
- Ne donne pas la réponse directement si c'est un exercice
- Encourage l'élève à réfléchir
- Utilise des exemples concrets si nécessaire
- Reste dans le contexte scolaire congolais (RDC) quand c'est pertinent`;
  
  return consigne;
}

async function construireConsigneAntiBoucle(user, texte, analyse) {
  try {
    const sujet = analyse.sujet || extraireSujetMemoire(texte) || "general";
    const { rows } = await pool.query(
      `SELECT COUNT(*) as count FROM student_attempts WHERE phone = $1 AND sujet = $2`,
      [user.phone, sujet]
    );
    const attempts = rows[0]?.count || 0;
    
    if (attempts > 3) {
      return {
        consigne: `ATTENTION : L'élève a déjà essayé ${attempts} fois sur ce sujet "${sujet}". Propose-lui de changer de méthode ou de passer à autre chose. Ne répète pas la même explication.`,
        sujet
      };
    }
    
    return { consigne: "", sujet };
  } catch (e) {
    logError("construireConsigneAntiBoucle", e);
    return { consigne: "", sujet: "general" };
  }
}

function ficheEstFaible(fiche = null) {
  if (!fiche) return true;

  const contenu = String(fiche?.contenu || "").trim();
  const commentaire = String(fiche?.commentaire_ai || "").trim();

  if (!contenu && !commentaire) return true;
  if (contenu.length < 80 && commentaire.length < 50) return true;

  return false;
}

function estQuestionGeographieRDC(question = "", fiche = null) {
  const t = `${question} ${fiche?.matiere || ""} ${fiche?.titre || ""}`.toLowerCase();

  return (
    t.includes("rdc") ||
    t.includes("congo") ||
    t.includes("province") ||
    t.includes("territoire") ||
    t.includes("territoires") ||
    t.includes("commune") ||
    t.includes("communes") ||
    t.includes("ville") ||
    t.includes("villes") ||
    t.includes("haut-katanga") ||
    t.includes("haut katanga") ||
    t.includes("géographie") ||
    t.includes("geographie")
  );
}

function fautChercherSurWeb(question = "", fiche = null) {
  const q = String(question || "").toLowerCase().trim();

  if (!q) return false;
  if (estMessageRelationnelSimple(q)) return false;

  if (fiche && !ficheEstFaible(fiche) && !estQuestionGeographieRDC(question, fiche)) {
    return false;
  }

  const casWeb = [
    "loi", "code", "article", "constitution", "juridique", "droit",
    "ohada", "impôt", "impot", "taxe", "tribunal",
    "géographie", "geographie", "rdc", "congo",
    "province", "territoire", "territoires",
    "commune", "communes", "ville", "villes",
    "haut-katanga", "haut katanga",
    "actualité", "actualite", "récent", "recent",
    "aujourd'hui", "actuel",
    "histoire", "date", "indépendance",
    "qui", "quand", "où", "ou", "combien", "pourquoi", "comment"
  ];

  if (casWeb.some((m) => q.includes(m))) return true;
  if (!fiche) return true;
  if (ficheEstFaible(fiche)) return true;
  if (estQuestionGeographieRDC(question, fiche)) return true;

  return false;
}

async function chercherContexteWeb(question = "", user = {}, historique = []) {
  const system = construireSystemPrompt(user);

  const reponse = await safeAI(
    () =>
      appelerChatCompletion([
        { role: "system", content: system },
        {
          role: "system",
          content: `MISSION WEB :
- Utilise Google Search
- Donne un CONTEXTE WEB BRUT, court, clair et factuel
- Pour le droit, les lois, les codes et les articles : n'invente rien
- Pour la géographie RDC : sois précis
- Si la question demande une liste administrative complète, donne la liste complète trouvée
- Si tu n'es pas sûr que la liste soit exhaustive, dis : "Liste à confirmer"
- Pas de structure VÉCU/SAVOIR/INSPIRATION/CONSOLIDATION`
        },
        ...historique.slice(-4),
        {
          role: "user",
          content: `QUESTION :
${question}

Donne un contexte web brut et fiable.`
        }
      ]),
    ""
  );

  return String(reponse || "").trim();
}

// ✅ MÉMOIRE CORRIGÉE - historique complet injecté
async function construireReponseDbWebIa(user, questionEleve, historique = [], fiche = null, consignePedagogique = "") {
  let contexteWeb = "";

  const utiliserWeb = fautChercherSurWeb(questionEleve, fiche);

  if (utiliserWeb) {
    contexteWeb = await chercherContexteWeb(questionEleve, user, historique);
  }

  const blocWeb = contexteWeb
    ? `CONTEXTE WEB — SOURCE PRINCIPALE :
${contexteWeb}`
    : `CONTEXTE WEB :
Aucune information web utile trouvée.`;

  const blocDB = fiche
    ? `CONTEXTE DB — SECONDAIRE :
Titre : ${fiche?.titre || "Sans titre"}
Matière : ${fiche?.matiere || "Non précisée"}
Classe : ${fiche?.classe || "Non précisée"}
Contenu :
${fiche?.contenu || ""}
Commentaire IA :
${fiche?.commentaire_ai || ""}`
    : `CONTEXTE DB :
Aucune fiche locale disponible.`;

  const historiqueContexte = historique.slice(-20);

  return await safeAI(
    () =>
      appelerChatCompletion([
        { role: "system", content: construireSystemPrompt(user) },
        {
          role: "system",
          content: `RÈGLE FONDAMENTALE :
- Utilise d'abord le WEB si disponible
- Utilise la DB comme appui
- Ne réponds jamais comme un moteur de recherche
- Pour le droit congolais, les lois, les codes et les articles : sois prudent et n'invente rien
- Pour la géographie RDC, province, territoire, ville, commune : sois précis
- Si la question demande une liste administrative complète, recopie la liste complète trouvée
- Si tu n'es pas sûr d'une liste complète, dis-le honnêtement
- La consolidation doit rester dans la même matière que la question

⚠️ MÉMOIRE : Tu as accès à l'historique complet de la conversation. Utilise-le pour :
- Te souvenir des matières déjà abordées
- Faire le lien avec les questions précédentes
- Éviter de répéter les mêmes explications
- Adapter tes réponses en fonction du contexte de la conversation`
        },
        { role: "system", content: consignePedagogique || "Sois pédagogique et clair." },
        ...historiqueContexte,
        {
          role: "user",
          content: `QUESTION :
${questionEleve}

${blocWeb}

${blocDB}

Donne maintenant la réponse finale de Mwalimu.`
        }
      ]),
    `🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Je n'ai pas encore pu produire une réponse claire.
🔴 [INSPIRATION] : Ce n'est pas grave ; nous pouvons reprendre plus simplement.
❓ [CONSOLIDATION] : Reformule ta question en une seule phrase.`
  );
}

async function telechargerMedia(mediaId, maxSize) {
  try {
    const url = `https://graph.facebook.com/v21.0/${mediaId}`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 10000
    });

    const mediaUrl = response.data.url;
    const mimeType = response.data.mime_type;

    const mediaResponse = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      responseType: "arraybuffer",
      maxContentLength: maxSize,
      timeout: 15000
    });

    return {
      buffer: Buffer.from(mediaResponse.data),
      mimeType: mimeType
    };
  } catch (e) {
    logError("telechargerMedia", e);
    throw e;
  }
}

function estMimeAudioSupporte(mimeType) {
  return [
    "audio/ogg", 
    "audio/mp3", 
    "audio/mpeg", 
    "audio/wav", 
    "audio/webm",
    "audio/mp4",
    "audio/amr"
  ].includes(mimeType);
}

function estMimeImageSupporte(mimeType) {
  return [
    "image/jpeg", 
    "image/png", 
    "image/webp", 
    "image/gif", 
    "image/bmp", 
    "image/heic", 
    "image/heif"
  ].includes(mimeType);
}

async function analyserAudioCourt(user, buffer, mimeType, historique) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const prompt = `Transcris ce message audio. Ensuite, classe-le dans UNE de ces catégories :
- "question" : l'élève pose une question scolaire
- "reponse" : l'élève donne une réponse à un exercice
- "social" : salutation, remerciement, bavardage
- "incompris" : audio inaudible ou incompréhensible

Réponds UNIQUEMENT avec un JSON valide au format :
{
  "transcription": "texte transcrit",
  "type": "categorie"
}`;

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: mimeType,
          data: buffer.toString("base64")
        }
      }
    ]);
    
    const response = await result.response;
    const text = response.text();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { transcription: "", type: "incompris" };
  } catch (e) {
    logError("analyserAudioCourt", e);
    return { transcription: "", type: "incompris" };
  }
}

async function reponseAudioUneSeulePasse(user, buffer, mimeType, historique, fiche) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const systemPrompt = construireSystemPrompt(user) + `

Tu réponds à un message audio. Sois concis et pédagogique.`;
    
    const prompt = systemPrompt + "\n\nRéponds à ce message audio de manière pédagogique.";

    const result = await model.generateContent([
      { text: prompt },
      {
        inlineData: {
          mimeType: mimeType,
          data: buffer.toString("base64")
        }
      }
    ]);
    
    const response = await result.response;
    return response.text();
  } catch (e) {
    logError("reponseAudioUneSeulePasse", e);
    return "Désolé, je n'ai pas bien compris ton message audio. Peux-tu réessayer ou écrire ta question ?";
  }
}

// ✅ CORRECTION SOCIALE - Plus de réponses simples
function construireReponseHumaineSimple(user, texte) {
  const prenom = premierPrenom(user?.nom || "");
  const genre = genreEleve(user?.nom || "");
  const appel = prenom ? `${genre} **${prenom}**` : "toi";
  const t = normaliserTexteRelationnel(texte);

  if (!t) return null;

  if (/\b(tu m ecoutes|m ecoutes|tu es la|tu es encore la|tu me suis|tu me lis|tu m entends)\b/.test(t)) {
    return `Oui ${appel}, je t’écoute attentivement 😊 Dis-moi ce que tu veux faire maintenant.`;
  }

  if (/\b(ce n est pas ca|ce n est pas la bonne maniere|ce n est pas la bonne facon|tu as mal repondu|mauvaise reponse|tu ne comprends pas|tu n as pas compris|reponds mieux|sois naturel|parle normalement)\b/.test(t)) {
    return `Tu as raison ${appel}. Je reprends plus simplement et plus naturellement.`;
  }

  if (/\b(comment tu vas|comment vas tu|tu vas bien|vous allez bien|comment ca va|et toi|et vous)\b/.test(t)) {
    const reponses = [
      `Je vais bien, merci ${appel} 😊 Et toi, comment vas-tu ?`,
      `Tout va bien de mon côté ${appel}, merci de demander 😊 Et toi ?`,
      `Je vais très bien ${appel} 😊 Dis-moi aussi comment tu vas.`
    ];
    return pick(reponses);
  }

  if (/\b(je vais bien|je vais tres bien|je vais super bien|je me porte bien|je me porte tres bien|je me sens bien|ca va merci|bien merci|tranquille|tranquille merci|pas mal|au top|ca roule|imboko)\b/.test(t)) {
    const accroches = [
      `Tant mieux ${appel} 😊 Qu’est-ce que tu aimerais apprendre maintenant ?`,
      `Je suis content de l’entendre ${appel}. Quelle matière veux-tu revoir ?`,
      `Heureux de te voir en forme ${appel}. Dis-moi ce que tu veux réviser.`
    ];
    return pick(accroches);
  }

  if (estMessageSalutation(texte)) {
    if (/^(bonsoir|bsr)\b/.test(t)) {
      return `Bonsoir ${appel} 😊 Comment puis-je t’aider ce soir ?`;
    }
    if (/^(bonne nuit|dors bien|fais de beaux reves)\b/.test(t)) {
      return `Bonne nuit ${appel} 🌙 Repose-toi bien.`;
    }
    if (/^(bonne soiree)\b/.test(t)) {
      return `Bonne soirée ${appel} 🌙`;
    }
    if (/^(bonne journee|bonne matinee|bon apres midi|bon week end|bon weekend)\b/.test(t)) {
      return `Merci ${appel} 😊 À toi aussi.`;
    }
    if (/^(a demain|a bientot)\b/.test(t)) {
      return `À bientôt ${appel} 👋`;
    }
    return `Bonjour ${appel} 😊 Comment puis-je t’aider aujourd’hui ?`;
  }

  if (estMessageRemerciement(texte)) {
    const formules = [
      `Avec plaisir ${appel} 😊`,
      `Je t’en prie ${appel} 😊`,
      `C’est normal ${appel}, je suis là pour t’aider.`
    ];
    return pick(formules);
  }

  if (/^(ok|okay|d accord|dac|dacc|entendu|compris|parfait|tres bien|ca marche)$/.test(t)) {
    return `D’accord ${appel} 😊`;
  }

  if (t === "oui") {
    return `D’accord ${appel}. Dis-m’en plus.`;
  }

  if (t === "non") {
    return `D’accord ${appel}, pas de souci.`;
  }

  if (/\b(c est bon|c est bien|pas de souci|pas de probleme|on continue|allons y)\b/.test(t)) {
    return `Très bien ${appel} 😊 On continue.`;
  }

  if (estMessagePurementSocial(texte)) {
    return `Je t’écoute ${appel} 😊`;
  }

  return null;
}

/* =========================================================
   AUDIO SOCIAL STRICT - SÉPARÉ DE L'AUDIO ACADÉMIQUE
========================================================= */
function construireReponseHumaineSimpleAudio(user = {}, texte = "") {
  const reponseTexteSociale = construireReponseHumaineSimple(user, texte);

  if (reponseTexteSociale && String(reponseTexteSociale).trim()) {
    return reponseTexteSociale;
  }

  const prenom = premierPrenom(user?.nom || "");
  const genre = genreEleve(user?.nom || "");
  const appel = prenom ? `${genre} **${prenom}**` : "toi";

  return `J’ai bien reçu ton audio ${appel} 😊 Je t’écoute.`;
}

function construireResponseHumaineSimpleAudio(user = {}, texte = "") {
  return construireReponseHumaineSimpleAudio(user, texte);
}

function traiterAudioPurementSocial(user = {}, transcription = "", typeAudio = "", historique = []) {
  const texte = String(transcription || "").trim();
  const type = String(typeAudio || "").toLowerCase().trim();

  if (texte && contientQuestionAcademique(texte)) {
    return null;
  }

  if (estSecondTourSalutation(historique, texte)) {
    return {
      reponse: genererRepriseApresBienEtre(user),
      fiche: null,
      bypassFormat: true
    };
  }

  if (type === "social") {
    return {
      reponse: construireReponseHumaineSimpleAudio(user, texte),
      fiche: null,
      bypassFormat: true
    };
  }

  if (texte && estMessagePurementSocial(texte)) {
    return {
      reponse: construireReponseHumaineSimpleAudio(user, texte),
      fiche: null,
      bypassFormat: true
    };
  }

  return null;
}



async function envoyerIndicateurFrappe(msgId) {
  try {
    if (PHONE_NUMBER_ID && TOKEN) {
      await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          status: "read",
          message_id: msgId
        },
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
    }
  } catch (e) {
    // Ignorer les erreurs de l'indicateur de frappe
  }
}

async function envoyerWhatsAppAvecRetry(to, message, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.post(
        `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: to,
          type: "text",
          text: { 
            preview_url: false,
            body: message 
          }
        },
        {
          headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json"
          },
          timeout: 10000
        }
      );
      return;
    } catch (err) {
      logError("envoyerWhatsApp_retry", err, { attempt: i + 1, to });
      if (i === retries - 1) throw err;
      await attendre(1000 * (i + 1));
    }
  }
}

function verifierSignatureMeta(req) {
  try {
    const signature = req.headers["x-hub-signature-256"];
    if (!signature) {
      logWarn("webhook_signature_missing");
      return false;
    }

    if (!req.rawBody) {
      logWarn("webhook_rawBody_missing");
      return false;
    }

    const expectedSignature = `sha256=${crypto
      .createHmac("sha256", APP_SECRET)
      .update(req.rawBody)
      .digest("hex")}`;

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch (e) {
    logError("verifierSignatureMeta", e);
    return false;
  }
}

function extraireMessageWhatsApp(body) {
  try {
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const messages = value?.messages;
    if (!messages?.length) return null;
    const msg = messages[0];
    return {
      id: msg.id,
      from: msg.from,
      type: msg.type,
      text: msg.text,
      image: msg.image,
      audio: msg.audio,
      document: msg.document,
      timestamp: msg.timestamp
    };
  } catch {
    return null;
  }
}

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        nom VARCHAR(255) DEFAULT '',
        classe VARCHAR(255) DEFAULT '',
        reve VARCHAR(255) DEFAULT '',
        historique JSONB DEFAULT '[]'::jsonb,
        reminders_enabled BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE TABLE IF NOT EXISTS processed_messages (
        msg_id VARCHAR(100) PRIMARY KEY,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS student_attempts (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL,
        sujet VARCHAR(255) NOT NULL,
        attempts INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(phone, sujet)
      );

      CREATE TABLE IF NOT EXISTS bibliotheque (
        id SERIAL PRIMARY KEY,
        titre VARCHAR(500) DEFAULT '',
        matiere VARCHAR(100) DEFAULT '',
        classe VARCHAR(100) DEFAULT '',
        contenu TEXT DEFAULT '',
        commentaire_ai TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    logInfo("db_initialized");
  } catch (e) {
    logError("db_init_error", e);
    throw e;
  }
}

async function getUser(phone) {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM conversations WHERE phone = $1",
      [phone]
    );
    if (!rows.length) return null;
    const user = rows[0];
    user.historique = Array.isArray(user.historique)
      ? user.historique
      : safeJsonParse(user.historique, []);
    return user;
  } catch (e) {
    logError("getUser", e);
    return null;
  }
}

async function createUser(phone) {
  try {
    await pool.query(
      "INSERT INTO conversations (phone, historique) VALUES ($1, '[]'::jsonb) ON CONFLICT DO NOTHING",
      [phone]
    );
  } catch (e) {
    logError("createUser", e);
  }
}

async function updateUserField(phone, field, value) {
  try {
    const validFields = ["nom", "classe", "reve", "reminders_enabled", "historique"];
    if (!validFields.includes(field)) return;
    
    if (field === "historique") {
      value = JSON.stringify(value);
    }
    
    await pool.query(
      `UPDATE conversations SET ${field} = $1, updated_at = NOW() WHERE phone = $2`,
      [value, phone]
    );
  } catch (e) {
    logError("updateUserField", e, { phone, field });
  }
}

async function appendHistorique(phone, role, content) {
  try {
    const user = await getUser(phone);
    if (!user) return;
    
    let historique = Array.isArray(user.historique) ? user.historique : [];
    historique.push({ role, content });
    
    // Garder 50 messages pour une meilleure mémoire
    if (historique.length > 50) {
      historique = historique.slice(-50);
    }
    
    await updateUserField(phone, "historique", historique);
  } catch (e) {
    logError("appendHistorique", e, { phone });
  }
}

async function logUnansweredQuestion(user, texte, type, reason) {
  logWarn("unanswered_question", {
    phone: user?.phone || "",
    type,
    reason,
    preview: String(texte || "").slice(0, 100)
  });
}

async function resetStudentAttempt(phone, sujet = "") {
  try {
    await pool.query(
      `DELETE FROM student_attempts WHERE phone = $1 AND sujet = $2`,
      [phone, sujet]
    );
  } catch (e) {
    logError("resetStudentAttempt", e, { phone, sujet });
  }
}

async function resetAllStudentAttempts(phone) {
  try {
    await pool.query(
      `DELETE FROM student_attempts WHERE phone = $1`,
      [phone]
    );
  } catch (e) {
    logError("resetAllStudentAttempts", e, { phone });
  }
}

function estReponseJourneeBienEtre(texte) {
  const t = normaliserTexteRelationnel(texte);
  return /(s'est|s est|ma journee|la journee|journee).*(bien|tres bien|super|genial)/.test(t) ||
         /(tout|ca|cela).*(s'est|s est|va).*(bien|tres bien|super)/.test(t);
}


/* =========================================================
   IMAGE : ROUTAGE INTELLIGENT
========================================================= */
function parserJsonImageRouting(brut = "") {
  const txt = String(brut || "").trim();
  if (!txt) return null;

  try {
    return JSON.parse(txt);
  } catch {}

  const sansFence = txt
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(sansFence);
  } catch {}

  const match = sansFence.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  return null;
}

function imageQuestionNecessiteWeb(question = "") {
  const q = normaliserTexteRelationnel(question);
  if (!q) return false;

  const indicesWeb = [
    "loi", "code", "article", "constitution", "juridique", "droit",
    "ohada", "impot", "taxe", "tribunal", "ordonnance", "journal officiel",
    "rdc", "congo", "province", "territoire", "territoires",
    "commune", "communes", "ville", "villes", "secteur", "chefferie",
    "haut katanga", "haut-katanga", "actualite", "recent", "actuel",
    "aujourd hui", "aujourd'hui"
  ];

  return indicesWeb.some((m) => q.includes(m));
}

function texteImageAIndiceAcademiqueFort(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  const indicesForts = [
    "exercice", "devoir", "interrogation", "question", "questions", "consigne",
    "resous", "resoudre", "calcule", "calculer", "determine", "determiner",
    "trouve", "trouver", "demontrer", "demontre", "demontration",
    "equation", "inequation", "fraction", "racine", "puissance", "formule",
    "probleme", "solution", "corrige", "correction", "definition", "definis",
    "math", "maths", "physique", "chimie", "biologie", "svt",
    "electricite", "mecanique", "electronique", "resistance des materiaux",
    "comptabilite", "statistique", "algorithme", "algorithmique",
    "grammaire", "conjugaison", "orthographe", "analyse grammaticale",
    "droit", "loi", "article", "code", "ohada", "juridique",
    "geographie", "histoire", "education civique"
  ];

  if (indicesForts.some((m) => t.includes(m))) return true;

  // Signaux typiques d'un calcul ou d'une formule visible.
  if (/\d+\s*[+\-*/×÷=]\s*\d+/.test(t)) return true;
  if (/[a-z]\s*[+\-*/×÷=]\s*\d+/.test(t)) return true;
  if (/\d+\s*[a-z]\s*[+\-=]/.test(t)) return true;

  return false;
}

function texteImageAIndiceSocialOuAffiche(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  const indicesSociaux = [
    "bonjour", "bonsoir", "salut", "merci", "shalom", "bienvenue",
    "invitation", "invite", "programme", "communique", "annonce", "affiche",
    "culte", "eglise", "paroisse", "pasteur", "priere", "jeune et priere",
    "reunion", "conference", "seminaire", "croisade", "cellule", "cellules",
    "radio", "adresse", "avenue", "quartier", "dimanche", "vendredi", "mercredi",
    "theme", "orateur", "heure", "h", "contact", "telephone", "evenement"
  ];

  return indicesSociaux.some((m) => t.includes(m));
}

function classerImageParGardeFou(transcription = "", questionExtraite = "", typeImage = "") {
  const texte = `${transcription || ""} ${questionExtraite || ""}`.trim();
  const type = String(typeImage || "incompris").toLowerCase().trim();

  if (!texte) return type;

  const academiqueFort = texteImageAIndiceAcademiqueFort(texte);
  const socialOuAffiche = texteImageAIndiceSocialOuAffiche(texte);

  // Priorité au social / affiche lorsque l'image ne contient pas un vrai exercice,
  // une consigne scolaire ou une notion académique forte.
  if (socialOuAffiche && !academiqueFort) return "non_academique";

  // Si l'IA a classé académique mais qu'aucun indice académique fort n'existe,
  // on évite le faux positif et on traite naturellement.
  if ((type === "academique_simple" || type === "academique_web") && !academiqueFort) {
    return "non_academique";
  }

  return type;
}


async function analyserImagePourRoutage(user, base64Image, mimeType, historique = []) {
  const fallback = {
    transcription: "",
    type: "incompris",
    questionExtraite: "",
    besoinWeb: false,
    raison: "analyse_image_impossible"
  };

  const systemInstruction = `${construireSystemPrompt(user)}
MODE ANALYSE IMAGE STRICTE :
- Tu lis l'image, mais tu ne réponds pas encore à l'élève.
- Réponds uniquement en JSON valide.
- type possible : social, academique_simple, academique_web, non_academique, incompris.
- social = petit message social visible : bonjour, bonsoir, merci, ok, bonne nuit, etc.
- academique_simple = question, cours, exercice ou leçon traitable sans vérification web.
- academique_web = question exigeant vérification externe : droit, loi, article, OHADA, fiscalité, actualité, géographie administrative RDC, données officielles.
- non_academique = image exploitable mais sans vraie question scolaire ou académique.
- incompris = image trop floue, illisible ou incompréhensible.
- transcription = recopie courte et fidèle de ce qui est visible.
- questionExtraite = question, exercice ou consigne utile à traiter.
- besoinWeb = true seulement si une vérification externe est vraiment nécessaire.
- N'invente jamais un mot, un chiffre, un énoncé, une loi ou une source absente de l'image.

FORMAT EXACT ATTENDU :
{
  "transcription": "texte visible",
  "type": "social|academique_simple|academique_web|non_academique|incompris",
  "questionExtraite": "question utile",
  "besoinWeb": false,
  "raison": "raison courte"
}`;

  const prompt = `Analyse cette image pour Mwalimu.
Renvoie uniquement le JSON demandé.
Ne donne aucune explication hors JSON.`;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction
    });

    const formattedHistory = historique.slice(-2).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }]
    }));

    const result = await genererAvecRetry(model, {
      contents: [
        ...formattedHistory,
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Image } }
          ]
        }
      ],
      generationConfig: { temperature: 0 }
    });

    const response = await result.response;
    const parsed = parserJsonImageRouting(response.text());

    if (!parsed || typeof parsed !== "object") return fallback;

    const transcription = String(parsed.transcription || "").trim();
    const questionExtraite = String(parsed.questionExtraite || transcription || "").trim();
    let type = String(parsed.type || "incompris").trim().toLowerCase();
    let besoinWeb = Boolean(parsed.besoinWeb);

    if (!questionExtraite && !transcription) {
      type = "incompris";
      besoinWeb = false;
    }

    if (questionExtraite && imageQuestionNecessiteWeb(questionExtraite)) {
      besoinWeb = true;
      if (type === "academique_simple") type = "academique_web";
    }

    return {
      transcription,
      type,
      questionExtraite,
      besoinWeb,
      raison: String(parsed.raison || "").trim()
    };
  } catch (e) {
    logError("analyser_image_pour_routage", e, { phone: user?.phone || "", mimeType });
    return fallback;
  }
}

function nettoyerFuitesContexteImage(texte = "") {
  return String(texte || "")
    .replace(/^.*contexte\s+web\s+brut.*$/gim, "")
    .replace(/^.*contexte\s+web.*$/gim, "")
    .replace(/^.*source\s+principale.*$/gim, "")
    .replace(/^.*source\s+secondaire.*$/gim, "")
    .replace(/^.*contexte\s+db.*$/gim, "")
    .replace(/^.*base\s+de\s+données.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ajouterRelanceImageSociale(texte = "") {
  let t = String(texte || "").trim();

  if (!t) {
    return "J'ai bien reçu ton image. Qu'est-ce que tu souhaites que je t'explique ou que je vérifie sur cette image ?";
  }

  const contientQuestionFinale =
    /qu['’]est-ce que tu souhaites/i.test(t) ||
    /que veux-tu que/i.test(t) ||
    /veux-tu que je/i.test(t) ||
    /souhaites-tu que/i.test(t) ||
    /qu['’]est-ce que tu veux/i.test(t) ||
    /que souhaites-tu/i.test(t) ||
    /que dois-je/i.test(t) ||
    /\?\s*$/.test(t);

  if (contientQuestionFinale) return t;

  return `${t}\n\nQu'est-ce que tu souhaites que je t'explique ou que je vérifie sur cette image ?`;
}

async function repondreImageNonAcademique(user, base64Image, mimeType, transcription = "", historique = []) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${construireSystemPrompt(user)}
MODE IMAGE NON ACADÉMIQUE / SOCIALE :
- Réponds naturellement et brièvement.
- Commence par dire que tu as bien reçu l'image.
- Si c'est une affiche, une invitation, un programme, une annonce ou un communiqué, résume clairement les informations visibles : objet, jours, heures, lieu, activité, contacts.
- Si c'est un simple message social, réponds comme dans une conversation humaine.
- Ne transforme jamais une affiche, une invitation, un programme ou un communiqué en cours académique.
- Ne mets jamais la structure VÉCU/SAVOIR/INSPIRATION/CONSOLIDATION pour une image sociale ou une affiche.
- Ne génère jamais le header Mwalimu, citation finale, ouverture finale ou mot d'encouragement final.
- Ne parle jamais de contexte web ou de source.`
  });

  const contents = [
    ...historique.slice(-3).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }]
    })),
    {
      role: "user",
      parts: [
        {
          text: `Image non académique reçue.
Transcription/observation préalable : ${transcription || "Non précisée"}
Réponds naturellement.`
        },
        { inlineData: { mimeType, data: base64Image } }
      ]
    }
  ];

  const reponse = await safeAI(async () => {
    const r = await genererAvecRetry(model, {
      contents,
      generationConfig: { temperature: 0.15 }
    });
    return r.response.text();
  }, "");

  return ajouterRelanceImageSociale(
    nettoyerFuitesContexteImage(reponse)
  );
}

async function repondreImageAcademiqueSansWeb(user, base64Image, mimeType, questionExtraite = "", transcription = "", historique = []) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${construireSystemPrompt(user)}
MODE IMAGE ACADÉMIQUE SANS WEB :
- Lis d'abord l'image.
- Appuie-toi seulement sur ce qui est visible dans l'image.
- Réponds comme un précepteur professionnel, humain et pédagogue.
- Si c'est un exercice, explique la méthode avant la réponse finale.
- N'utilise pas Google Search.
- Ne parle jamais de contexte web, source principale, source secondaire, DB ou contexte brut.
- Ne génère jamais le header Mwalimu.
- Ne génère jamais la citation finale.
- Ne génère jamais l'ouverture finale.
- Ne génère jamais le mot d'encouragement final.
- Structure obligatoire :
🔵 [VÉCU]
🟡 [SAVOIR]
🔴 [INSPIRATION]
❓ [CONSOLIDATION]
- Dans [VÉCU], dis brièvement que tu as bien reçu l'image et rappelle l'énoncé utile.
- Dans [CONSOLIDATION], pose une ou deux petites questions strictement liées à l'image.`
  });

  const contents = [
    ...historique.slice(-4).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }]
    })),
    {
      role: "user",
      parts: [
        {
          text: `Voici une image contenant un contenu académique.
Transcription visible :
${transcription || "Non précisée"}

Question / exercice extrait :
${questionExtraite || "Non précisé"}

Réponds maintenant comme Mwalimu, sans utiliser le web.`
        },
        { inlineData: { mimeType, data: base64Image } }
      ]
    }
  ];

  const reponse = await safeAI(async () => {
    const r = await genererAvecRetry(model, {
      contents,
      generationConfig: { temperature: 0.15 }
    });
    return r.response.text();
  }, "");

  return nettoyerFuitesContexteImage(reponse);
}

async function repondreImageAcademiqueAvecWeb(user, base64Image, mimeType, questionExtraite = "", transcription = "", historique = []) {
  const contexteWeb = await chercherContexteWeb(questionExtraite || transcription, user, historique);
  const fiche = await consulterBibliotheque(questionExtraite || transcription, user?.classe || "");

  const blocDB = fiche
    ? `Titre : ${fiche?.titre || "Sans titre"}
Matière : ${fiche?.matiere || "Non précisée"}
Classe : ${fiche?.classe || "Non précisée"}
Contenu :
${tronquerTexte(fiche?.contenu || "", 2500)}
Commentaire IA :
${tronquerTexte(fiche?.commentaire_ai || "", 1000)}`
    : "Aucune fiche locale disponible.";

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${construireSystemPrompt(user)}
MODE IMAGE ACADÉMIQUE AVEC WEB :
- Lis d'abord l'image.
- Utilise ensuite le contexte web seulement pour vérifier ou sécuriser la réponse.
- Réponds comme un précepteur professionnel, pas comme un moteur de recherche.
- Ne parle jamais de CONTEXTE WEB, SOURCE PRINCIPALE, SOURCE SECONDAIRE, DB ou contexte brut.
- Si un texte juridique exact est fiable, tu peux le mentionner puis l'expliquer brièvement.
- Ne génère jamais le header Mwalimu.
- Ne génère jamais la citation finale.
- Ne génère jamais l'ouverture finale.
- Ne génère jamais le mot d'encouragement final.
- Structure obligatoire :
🔵 [VÉCU]
🟡 [SAVOIR]
🔴 [INSPIRATION]
❓ [CONSOLIDATION]
- Dans [VÉCU], dis brièvement que tu as bien reçu l'image et rappelle l'énoncé utile.
- Dans [CONSOLIDATION], pose une ou deux petites questions strictement liées à l'image.`
  });

  const contents = [
    ...historique.slice(-4).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }]
    })),
    {
      role: "user",
      parts: [
        {
          text: `QUESTION EXTRAITE DE L'IMAGE :
${questionExtraite || transcription || "Non précisé"}

TRANSCRIPTION VISIBLE :
${transcription || "Non précisée"}

INFORMATIONS DE RÉFÉRENCE À UTILISER SANS LES NOMMER :
${contexteWeb || "Aucune information web utile trouvée."}

FICHE LOCALE À UTILISER SANS LA NOMMER :
${blocDB}

Réponds maintenant comme Mwalimu : réponse pédagogique, claire, fiable, sans afficher les étiquettes de contexte.`
        },
        { inlineData: { mimeType, data: base64Image } }
      ]
    }
  ];

  const reponse = await safeAI(async () => {
    const r = await genererAvecRetry(model, {
      contents,
      generationConfig: { temperature: 0.15 }
    });
    return r.response.text();
  }, "");

  return nettoyerFuitesContexteImage(reponse);
}

async function expliquerImageAvecIA(user, base64Image, mimeType, historique = []) {
  const analyse = await analyserImagePourRoutage(user, base64Image, mimeType, historique);

  const transcription = String(analyse?.transcription || "").trim();
  const questionExtraite = String(analyse?.questionExtraite || transcription || "").trim();
  let typeImage = String(analyse?.type || "incompris").trim().toLowerCase();
  const besoinWeb = Boolean(analyse?.besoinWeb) || imageQuestionNecessiteWeb(questionExtraite);

  // GARDE-FOU DÉTERMINISTE : évite qu'une image sociale, une affiche,
  // une invitation, un programme ou un communiqué soit traité comme un exercice.
  typeImage = classerImageParGardeFou(transcription, questionExtraite, typeImage);

  logInfo("image_routing", {
    phone: user?.phone || "",
    typeImage,
    besoinWeb,
    transcriptionPreview: tronquerTexte(transcription, 180),
    questionPreview: tronquerTexte(questionExtraite, 180)
  });

  if (typeImage === "social") {
    const rep = construireReponseHumaineSimple(user, questionExtraite || transcription || "bonjour");
    return {
      reponse: rep || "J'ai bien reçu ton image 😊",
      bypassFormat: true
    };
  }

  if (typeImage === "non_academique") {
    const rep = await repondreImageNonAcademique(user, base64Image, mimeType, transcription, historique);
    return {
      reponse: rep || "J'ai bien reçu ton image. Dis-moi ce que tu veux que j'explique ou vérifie dans cette photo.",
      bypassFormat: true
    };
  }

  if (typeImage === "incompris" || !questionExtraite) {
    return {
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Mais certains éléments sont flous ou difficiles à lire.
🔴 [INSPIRATION] : Ce n'est pas grave ; nous pouvons reprendre calmement.
❓ [CONSOLIDATION] : Envoie-moi une image plus nette, bien cadrée, ou écris la question ici.`,
      bypassFormat: false
    };
  }

  let reponse = "";

  if (typeImage === "academique_web" || besoinWeb) {
    reponse = await repondreImageAcademiqueAvecWeb(
      user,
      base64Image,
      mimeType,
      questionExtraite,
      transcription,
      historique
    );
  } else {
    reponse = await repondreImageAcademiqueSansWeb(
      user,
      base64Image,
      mimeType,
      questionExtraite,
      transcription,
      historique
    );
  }

  if (!reponse || !String(reponse).trim()) {
    reponse = `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Je n'ai pas encore réussi à produire une explication claire.
🔴 [INSPIRATION] : Nous pouvons reprendre cela simplement.
❓ [CONSOLIDATION] : Renvoie l'image plus nette ou écris la question contenue dans la photo.`;
  }

  return {
    reponse: nettoyerFuitesContexteImage(reponse),
    bypassFormat: false
  };
}
function harmoniserEspacesBlocsPedagogiques(texte = "") {
  return String(texte || "")
    .replace(/🔵\s*\[VÉCU\]\s*:?\s*/gi, "🔵 [VÉCU] : ")
    .replace(/🟡\s*\[SAVOIR\]\s*:?\s*/gi, "🟡 [SAVOIR] : ")
    .replace(/🔴\s*\[INSPIRATION\]\s*:?\s*/gi, "🔴 [INSPIRATION] : ")
    .replace(/❓\s*\[CONSOLIDATION\]\s*:?\s*/gi, "❓ [CONSOLIDATION] : ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function construireMessageFinal(user, reponse, historique, question, fiche) {
  let message = reponse;
  
  const resultat = appliquerLes4EtapesScientifiques(reponse, question, fiche);
  message = resultat.texte;
  
  if (!/🔵\s*\[VÉCU\]/.test(message)) {
    message = verifierStructureMwalimu(message, user, historique, question);
  }
  
  message = remplacerBlocConsolidation(message, question, resultat.matiere);
  
  if (!message.includes("👉 ")) {
    const ouverture = choisirOuvertureContextuelle(message, user, question);
    if (ouverture) message += `\n${ouverture}`;
  }
  
  if (!message.includes("🌟")) {
    const encouragement = choisirEncouragementContextuel(message, question);
    if (encouragement) message += `\n${encouragement}`;
  }
  message = retirerCitationsFinales(message);
  const citation = choisirCitationContextuelle(message, question);
  if (citation) message += `\n${citation}`;
  
  message = nettoyerReponseIA(message);
  message = supprimerFormulesLourdesDAppel(message, user);
  message = nettoyerAppelsRepetitifs(message, user.nom);
  message = nettoyerOuverturesDupliquees(message);
  
  if (!message.includes("Mwalimu EdTech")) {
    message = `${HEADER_MWALIMU}\n────────────────\n${message}`;
  }
  
  message = nettoyerDoublonsPedagogiques(message);
  message = nettoyerFuitesContexteAcademique(message);
  message = harmoniserEspacesBlocsPedagogiques(message);

  return message.replace(/\n{3,}/g, "\n\n").trim();
}

function messageSecours(user, msgType) {
  const prenom = premierPrenom(user?.nom || "");
  return `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : Désolé ${prenom}, j'ai rencontré un petit souci technique.\n🟡 [SAVOIR] : Je n'ai pas pu traiter correctement ton message.\n🔴 [INSPIRATION] : Ce n'est pas grave, nous pouvons réessayer.\n❓ [CONSOLIDATION] : Peux-tu reformuler ou renvoyer ton message ?`;
}

/* =========================================================
   FONCTIONS PDF
========================================================= */

async function extraireTextePDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (err) {
    logError("pdf_extraction_error", err);
    throw err;
  }
}

async function traiterDocumentPDF(user, msg, historique) {
  const docId = msg.document?.id;
  if (!docId) {
    return {
      reponse: "Je n'arrive pas à lire ton document. Réessaie ou envoie une photo.",
      fiche: null,
      bypassFormat: true,
    };
  }

  let buffer, mimeType;
  try {
    const media = await telechargerMedia(docId, MAX_PDF_SIZE);
    buffer = media.buffer;
    mimeType = media.mimeType;
  } catch (err) {
    logError("pdf_download_error", err, { phone: user?.phone });
    return {
      reponse: "Je n'ai pas pu télécharger ton PDF. Vérifie que le fichier n'est pas trop volumineux (max 10 Mo).",
      fiche: null,
      bypassFormat: true,
    };
  }

  logInfo("pdf_received", { phone: user?.phone || "", mimeType });

  if (mimeType !== "application/pdf") {
    return {
      reponse: "Le document reçu n'est pas un PDF valide. Envoie un fichier .pdf",
      fiche: null,
      bypassFormat: true,
    };
  }

  let texteExtrait = "";
  try {
    texteExtrait = await extraireTextePDF(buffer);
  } catch (err) {
    logError("pdf_extraction_failed", err, { phone: user?.phone });
    return {
      reponse: "Je n'ai pas pu extraire le texte de ton PDF. Il est peut-être protégé ou scanné. Envoie-moi plutôt une photo claire de l'exercice.",
      fiche: null,
      bypassFormat: true,
    };
  }

  if (!texteExtrait || !texteExtrait.trim()) {
    return {
      reponse: "Ton PDF semble ne contenir aucun texte (peut-être juste des images). Essaie d'envoyer une photo directement.",
      fiche: null,
      bypassFormat: true,
    };
  }

  if (texteExtrait.length > MAX_PDF_TEXT_LENGTH) {
    const originalLength = texteExtrait.length;
    texteExtrait = texteExtrait.slice(0, MAX_PDF_TEXT_LENGTH) + "\n[...texte trop long, j'ai pris le début...]";
    logInfo("pdf_text_truncated", { phone: user?.phone, originalLength });
  }

  const questionPDF = `[Document PDF envoyé par l'élève]\n\n${texteExtrait}\n\n[Fin du PDF]`;

  const resultat = await traiterTexte(user, questionPDF, historique);

  return {
    reponse: resultat.reponse,
    fiche: resultat.fiche,
    bypassFormat: resultat.bypassFormat,
  };
}

/* =========================================================
   CERVEAU DECISION IA
========================================================= */
async function cerveauDecisionIA(user, texte = "", historique = [], msgType = "text") {
  const systemInstruction = `${construireSystemPrompt(user)}

MODE CERVEAU DÉCISIONNEL :
- Tu ne réponds pas encore à l'élève
- Tu dois seulement décider quoi faire
- Analyse le message actuel avec le contexte récent
- Si l'élève répond "oui", "oui oui", "bien", "ça va", "ma journée s'est bien passée" après une question de bien-être, classe cela comme réponse sociale
- Ne transforme jamais une simple réponse sociale en question académique
- Si c'est une vraie question scolaire, juridique, géographique, exercice ou correction, choisis la route pédagogique
- Réponds uniquement en JSON valide

Routes possibles :
- reponse_sociale : pour les salutations, remerciements, bavardages
- reponse_bien_etre : réponse à une question sur l'état de l'élève
- pedagogique : question académique simple
- pedagogique_web : question nécessitant une recherche web
- correction : l'élève soumet une réponse à corriger
- exercice : l'élève demande un exercice
- image : l'élève envoie une image
- audio : l'élève envoie un audio
- incompris : message inintelligible`;

  const fallback = {
    intention: "question_normale",
    route: "pedagogique",
    besoinIA: true,
    besoinWeb: false,
    bypassFormat: false,
    raison: "fallback"
  };

  try {
    const parsed = await appelerJsonStrict({
      systemInstruction,
      prompt: `TYPE DU MESSAGE : ${msgType}

MESSAGE ACTUEL :
${texte}

Décide la route correcte.`,
      schema: JSON_SCHEMA_DECISION,
      history: historique.slice(-6)
    });

    if (!parsed || typeof parsed !== "object") return fallback;

    return {
      intention: String(parsed.intention || "question_normale"),
      route: String(parsed.route || "pedagogique"),
      besoinIA: Boolean(parsed.besoinIA),
      besoinWeb: Boolean(parsed.besoinWeb),
      bypassFormat: Boolean(parsed.bypassFormat),
      raison: String(parsed.raison || "")
    };
  } catch (e) {
    logError("cerveau_decision_ia", e);
    return fallback;
  }
}

function securiserDecisionCasSensibles(decision = {}, texte = "", historique = []) {
  const t = normaliserTexteRelationnel(texte);

  if (!t) return decision;

  if (dernierMessageEstQuestionBienEtre(historique)) {
    const reponsesSociales = [
      "oui",
      "oui oui",
      "oui bien",
      "oui tres bien",
      "oui ca va",
      "oui ca va bien",
      "bien",
      "bien merci",
      "tres bien",
      "ca va",
      "ca va bien",
      "ca va merci",
      "super",
      "cool",
      "pas mal",
      "ma journee s est bien passee",
      "la journee s est bien passee",
      "elle s est bien passee",
      "tout s est bien passe",
      "c etait bien"
    ];

    if (
      reponsesSociales.includes(t) ||
      /^oui\b/.test(t) ||
      estReponseJourneeBienEtre(t)
    ) {
      return {
        intention: "reponse_bien_etre",
        route: "reponse_bien_etre",
        besoinIA: false,
        besoinWeb: false,
        bypassFormat: true,
        raison: "Réponse sociale après une question de bien-être"
      };
    }
  }

  return decision;
}

async function genererReponseSocialeIA(user, texte = "", historique = [], decision = {}) {
  return await safeAI(
    () =>
      appelerChatCompletion([
        {
          role: "system",
          content: `${construireSystemPrompt(user)}
MODE RÉPONSE SOCIALE :
- Réponds naturellement
- Une ou deux phrases maximum
- Pas de structure pédagogique
- Pas de header Mwalimu
- Pas de citation
- Pas de VÉCU/SAVOIR/INSPIRATION/CONSOLIDATION
- Si l'élève répond à une question de bien-être, accuse réception humainement puis invite-le doucement à choisir une matière ou une question`
        },
        ...historique.slice(-6),
        {
          role: "user",
          content: `Message de l'élève : ${texte}

Décision :
${JSON.stringify(decision)}`
        }
      ]),
    "D'accord 😊 Dis-moi maintenant ce que tu aimerais apprendre ou réviser."
  );
}


/* =========================================================
   ROUTAGE ACADÉMIQUE ÉCRIT — PHASE 1 : DÉTECTION SEULEMENT
   IMPORTANT : ce bloc observe et journalise, il ne change aucune réponse.
   Version hybride : dictionnaire central + score + intention.
========================================================= */
function nettoyerPourDetectionAcademique(texte = "") {
  return normaliserTexteRelationnel(texte)
    .replace(/\s+/g, " ")
    .trim();
}

const MATIERES_ACADEMIQUES_ECRITES = {
  mathematiques: {
    famille: "resolution",
    besoinWeb: false,
    mots: ["math", "maths", "mathematique", "mathematiques", "equation", "inequation", "calcul", "fraction", "racine", "puissance", "geometrie", "algebre", "fonction", "derivee", "integrale", "polynome"],
    symboles: [/\d+\s*[+*/=]\s*[a-zA-Z0-9]/, /\b[xXyY]\s*[+*/=]\s*[a-zA-Z0-9]/, /[a-zA-Z0-9]\s*=\s*[a-zA-Z0-9]/, /x²|x\^2|√|\bdelta\b|\bcos\b|\bsin\b|\btan\b/i]
  },
  francais: {
    famille: "cours",
    besoinWeb: false,
    mots: ["francais", "grammaire", "conjugaison", "orthographe", "phrase", "verbe", "nom", "adjectif", "pronom", "adverbe", "complement", "sujet", "accord", "temps", "mode", "participe", "texte"]
  },
  sciences: {
    famille: "resolution",
    besoinWeb: false,
    mots: ["physique", "chimie", "biologie", "science", "photosynthese", "chlorophylle", "plante", "plantes", "cellule", "cellules", "respiration", "ecosysteme", "oxygene", "force", "vitesse", "energie", "mouvement", "pression", "masse", "poids", "newton", "molecule", "atome", "reaction", "solution", "acide", "base", "h2o", "co2", "nacl"]
  },
  technique: {
    famille: "resolution",
    besoinWeb: false,
    mots: ["electricite", "electronique", "mecanique", "rdm", "resistance des materiaux", "tension", "intensite", "courant", "resistance", "ohm", "volt", "ampere", "circuit", "diode", "transistor", "condensateur", "bobine", "poutre", "contrainte", "deformation", "traction", "flexion", "cisaillement"]
  },
  gestion: {
    famille: "resolution",
    besoinWeb: false,
    mots: ["comptabilite", "bilan", "journal", "debit", "credit", "compte", "grand livre", "balance", "actif", "passif", "charge", "produit", "amortissement", "stock", "tva", "economie", "statistique", "moyenne", "mediane", "mode", "variance", "ecart type", "probabilite", "pourcentage"]
  },
  informatique: {
    famille: "resolution",
    besoinWeb: false,
    mots: ["informatique", "algorithme", "algorithmique", "programme", "programmation", "code", "fonction", "variable", "boucle", "condition", "tableau", "javascript", "python", "html", "css"]
  },
  droit: {
    famille: "juridique_web",
    besoinWeb: true,
    mots: ["droit", "loi", "code", "article", "constitution", "ohada", "tribunal", "procedure", "ordonnance", "juridique", "fiscalite", "impot", "taxe", "journal officiel", "arret", "jugement"]
  },
  geographie: {
    famille: "geographie_rdc_web",
    besoinWeb: true,
    mots: ["geographie", "rdc", "congo", "province", "territoire", "territoires", "commune", "communes", "ville", "villes", "secteur", "chefferie", "haut katanga", "haut-katanga", "climat", "relief", "fleuve", "lac"]
  },
  histoire: {
    famille: "cours",
    besoinWeb: false,
    mots: ["histoire", "independance", "colonisation", "royaume", "empire", "revolution", "guerre", "date historique", "evenement historique"]
  },
  general: {
    famille: "cours",
    besoinWeb: false,
    mots: ["cours", "lecon", "chapitre", "notion", "definition", "resume", "explique"]
  }
};

function detecterMatiereAcademiqueEcrite(texte = "") {
  const t = nettoyerPourDetectionAcademique(texte);
  const brut = String(texte || "");
  const scores = {};

  for (const [matiere, config] of Object.entries(MATIERES_ACADEMIQUES_ECRITES)) {
    let score = 0;

    for (const mot of config.mots || []) {
      if (t.includes(mot)) score += mot.includes(" ") ? 4 : 3;
    }

    for (const regex of config.symboles || []) {
      if (regex.test(brut)) score += 6;
    }

    scores[matiere] = score;
  }

  const meilleur = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] || ["general", 0];
  const matiere = meilleur[0];
  const score = meilleur[1];
  const config = MATIERES_ACADEMIQUES_ECRITES[matiere] || MATIERES_ACADEMIQUES_ECRITES.general;

  return {
    matiere: score > 0 ? matiere : "general",
    score,
    famille: score > 0 ? config.famille : "cours",
    besoinWeb: score > 0 ? Boolean(config.besoinWeb) : false,
    confiance: score >= 6 ? "forte" : score >= 3 ? "moyenne" : "faible"
  };
}

function detecterIntentionAcademiqueEcrite(texte = "") {
  const t = nettoyerPourDetectionAcademique(texte);
  const brut = String(texte || "");

  const demandeAide = /\b(aide moi|aide-moi|peux tu m aider|tu peux m aider|aidez moi|aidez-moi|explique|explique moi|resous|résous|resoudre|résoudre|calcule|calculer|comment faire|donne moi|tu peux me donner)\b/i.test(t);
  const demandeDefinition = /\b(qu est ce que|c est quoi|definition|définition|definis|définis|explique|explique moi|resume|résume|difference entre|quelle est la difference)\b/i.test(t);
  const formeQuestion = /\?$/.test(brut.trim()) || /\b(qui|que|quoi|quand|ou|où|pourquoi|comment|combien|quel|quelle|quels|quelles)\b/i.test(t);
  const symbolesResolution = /\d+\s*[+*/=]\s*[a-zA-Z0-9]/.test(brut) || /\b[xXyY]\s*[+*/=]\s*[a-zA-Z0-9]/.test(brut) || /[a-zA-Z0-9]\s*=\s*[a-zA-Z0-9]/.test(brut) || /\d+\s*(v|a|ohm|ω|n|kg|m\/s|m2|m²|cm2|cm²|usd|fc|cdf)\b/i.test(brut);
  const procedureResolution = /\b(exercice|devoir|probleme|problème|resous|résous|resoudre|résoudre|calcule|calculer|trouve|determiner|déterminer|demontrer|démontrer|simplifie|developpe|développe|factorise|corrige|correction)\b/i.test(t);
  const reponseExplicite = /^(ma reponse|voici ma reponse|j ai trouve|je trouve|j obtiens|j ai obtenu|cela donne|ca donne|la reponse est|le resultat est|mon resultat est|reponse)\b/i.test(t);

  return {
    demandeAide,
    demandeDefinition,
    formeQuestion,
    symbolesResolution,
    procedureResolution,
    reponseExplicite
  };
}

function detecterQuestionJuridiqueOuWebEcrite(texte = "", matiereDetectee = null) {
  const t = nettoyerPourDetectionAcademique(texte);
  const matiere = matiereDetectee || detecterMatiereAcademiqueEcrite(texte);

  if (matiere.besoinWeb && matiere.famille) {
    return { besoinWeb: true, famille: matiere.famille };
  }

  const actualite = ["actualite", "recent", "actuel", "aujourd hui", "maintenant", "2025", "2026"];
  if (actualite.some((m) => t.includes(m))) return { besoinWeb: true, famille: "actualite_web" };

  return { besoinWeb: false, famille: "sans_web" };
}

function detecterExerciceAResolutionEcrit(texte = "", matiereDetectee = null) {
  const matiere = matiereDetectee || detecterMatiereAcademiqueEcrite(texte);
  const intention = detecterIntentionAcademiqueEcrite(texte);

  if (intention.symbolesResolution && (intention.demandeAide || intention.procedureResolution || matiere.matiere === "mathematiques")) return true;
  if (intention.procedureResolution && ["resolution", "technique", "gestion"].includes(matiere.famille)) return true;
  if (intention.demandeAide && matiere.famille === "resolution") return true;

  return false;
}

function detecterQuestionDeCoursEcrite(texte = "", matiereDetectee = null) {
  const matiere = matiereDetectee || detecterMatiereAcademiqueEcrite(texte);
  const intention = detecterIntentionAcademiqueEcrite(texte);

  if (intention.demandeDefinition) return true;
  if (intention.formeQuestion && matiere.score > 0 && matiere.famille !== "resolution") return true;
  if (intention.formeQuestion && matiere.matiere === "general") return true;

  return false;
}

function detecterReponseEleveEcrite(texte = "", historique = []) {
  const t = nettoyerPourDetectionAcademique(texte);
  if (!t) return false;

  const intention = detecterIntentionAcademiqueEcrite(texte);

  // Une demande, une question ou un exercice ne doit jamais être pris pour une réponse d'élève.
  if (intention.demandeAide || intention.demandeDefinition || intention.formeQuestion) return false;

  if (intention.reponseExplicite || estSoumissionReponse(texte)) return true;

  const derniersAssistants = [...historique]
    .reverse()
    .filter((m) => m?.role === "assistant")
    .slice(0, 2)
    .map((m) => String(m.content || "").toLowerCase())
    .join("\n");

  const assistantAttendReponse =
    /envoie-moi ta reponse|propose ta reponse|essaie maintenant|a toi|à toi|dis-moi ce que tu retiens|consolidation/i.test(derniersAssistants);

  if (!assistantAttendReponse) return false;

  const court = t.length <= 180;
  const ressembleReponse =
    /^[0-9a-z+\-*/=().,\s]+$/i.test(t) ||
    t.split(" ").length <= 20;

  return court && ressembleReponse;
}

function detecterConsolidationEnSouffrance(historique = []) {
  const dernierAssistant = [...historique].reverse().find((m) => m?.role === "assistant");
  if (!dernierAssistant) return false;

  const contenu = String(dernierAssistant.content || "");
  return /❓\s*\[CONSOLIDATION\]/i.test(contenu) || /dis-moi ce que tu retiens|peux-tu m'expliquer|avec tes mots/i.test(contenu);
}

function detecterRoutageAcademiqueEcrit(user = {}, texte = "", historique = []) {
  const t = nettoyerPourDetectionAcademique(texte);
  const matiereDetectee = detecterMatiereAcademiqueEcrite(texte);
  const web = detecterQuestionJuridiqueOuWebEcrite(texte, matiereDetectee);

  const resultat = {
    mode: "observation_seulement",
    route: "non_academique",
    matiere: matiereDetectee.matiere,
    scoreMatiere: matiereDetectee.score,
    besoinWeb: web.besoinWeb,
    familleWeb: web.famille,
    exerciceAResolution: false,
    reponseEleve: false,
    consolidationEnSouffrance: detecterConsolidationEnSouffrance(historique),
    confiance: matiereDetectee.confiance,
    raison: "Aucune règle académique forte détectée",
    preview: String(texte || "").slice(0, 120)
  };

  if (!t) {
    resultat.route = "vide";
    resultat.raison = "Message vide";
    return resultat;
  }

  if (estMessageRelationnelSimple(texte) || estMessagePurementSocial(texte)) {
    resultat.route = "social";
    resultat.confiance = "forte";
    resultat.raison = "Message social détecté, hors routage académique";
    return resultat;
  }

  // 1) Questions nécessitant une vérification externe : droit, OHADA, RDC, géographie administrative, actualité.
  if (web.besoinWeb) {
    resultat.route = web.famille;
    resultat.confiance = "forte";
    resultat.raison = "Question nécessitant probablement une vérification externe";
    return resultat;
  }

  // 2) Réponse explicite de l'élève : à traiter avant les exercices.
  // Exemple : "Ma réponse est x=2" ne doit pas devenir un nouvel exercice.
  if (detecterReponseEleveEcrite(texte, historique)) {
    resultat.route = "reponse_eleve";
    resultat.reponseEleve = true;
    resultat.exerciceAResolution = false;
    resultat.besoinWeb = false;
    resultat.familleWeb = "sans_web";
    resultat.confiance = "forte";
    resultat.raison = "Réponse proposée par l'élève";
    return resultat;
  }

  // 3) Question de cours / définition : avant les exercices.
  // Cela évite que "qu'est-ce" ou "est-ce" soient pris pour des signes mathématiques.
  if (detecterQuestionDeCoursEcrite(texte, matiereDetectee)) {
    resultat.route = "question_de_cours";
    resultat.exerciceAResolution = false;
    resultat.reponseEleve = false;
    resultat.besoinWeb = false;
    resultat.familleWeb = "sans_web";
    resultat.confiance = matiereDetectee.score > 0 ? "forte" : "moyenne";
    resultat.raison = "Question de cours ou demande d'explication détectée";
    return resultat;
  }

  // 4) Exercice à résolution : calcul, équation, procédure technique, comptabilité, sciences, etc.
  if (detecterExerciceAResolutionEcrit(texte, matiereDetectee)) {
    resultat.route = "exercice_a_resolution";
    resultat.exerciceAResolution = true;
    resultat.reponseEleve = false;
    resultat.besoinWeb = false;
    resultat.familleWeb = "sans_web";
    resultat.confiance = "forte";
    resultat.raison = "Exercice ou procédure de résolution détecté";
    return resultat;
  }

  if (t.length < 8) {
    resultat.route = "question_floue";
    resultat.confiance = "moyenne";
    resultat.raison = "Message trop court pour une classification académique sûre";
    return resultat;
  }

  resultat.route = matiereDetectee.score > 0 ? "academique_general" : "non_academique";
  resultat.confiance = matiereDetectee.confiance;
  resultat.raison = matiereDetectee.score > 0
    ? "Message académique détecté par score, sans action en phase 1"
    : "Aucun indice académique suffisant";
  return resultat;
}

function observerRoutageAcademiqueEcrit(user = {}, texte = "", historique = []) {
  try {
    const detection = detecterRoutageAcademiqueEcrit(user, texte, historique);
    logInfo("routage_academique_ecrit_detection_only", {
      phone: user?.phone || "",
      route: detection.route,
      matiere: detection.matiere,
      besoinWeb: detection.besoinWeb,
      familleWeb: detection.familleWeb,
      exerciceAResolution: detection.exerciceAResolution,
      reponseEleve: detection.reponseEleve,
      consolidationEnSouffrance: detection.consolidationEnSouffrance,
      confiance: detection.confiance,
      raison: detection.raison,
      preview: tronquerTexte(texte, 160)
    });
    return detection;
  } catch (e) {
    logError("routage_academique_ecrit_detection_only_error", e, {
      phone: user?.phone || "",
      preview: tronquerTexte(texte, 160)
    });
    return null;
  }
}


/* =========================================================
   ROUTAGE ACADÉMIQUE ÉCRIT — PHASE 2 : QUESTION DE COURS
   Activation limitée + anti-doublons
========================================================= */
function nettoyerFuitesContexteAcademique(texte = "") {
  let t = String(texte || "");
  t = t.replace(/\*?CONTEXTE\s+WEB\s+BRUT\s+ET\s+FIABLE\s*:?\*?/gi, "");
  t = t.replace(/CONTEXTE\s+WEB\s*[—-]\s*SOURCE\s+PRINCIPALE\s*:?/gi, "");
  t = t.replace(/CONTEXTE\s+WEB\s*:?/gi, "");
  t = t.replace(/CONTEXTE\s+DB\s*[—-]\s*SECONDAIRE\s*:?/gi, "");
  t = t.replace(/SOURCE\s+PRINCIPALE\s*:?/gi, "");
  t = t.replace(/SOURCE\s+SECONDAIRE\s*:?/gi, "");
  t = t.replace(/Aucune information web utile trouvée\.?/gi, "");
  t = t.replace(/^\s*Titre\s*:.*$/gim, "");
  t = t.replace(/^\s*Matière\s*:.*$/gim, "");
  t = t.replace(/^\s*Classe\s*:.*$/gim, "");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function nettoyerDoublonsPedagogiques(texte = "") {
  let t = String(texte || "").trim();
  if (!t) return "";

  const sections = [
    { key: "VECU", rx: /🔵\s*\[VÉCU\]\s*:?/gi, label: "🔵 [VÉCU] :" },
    { key: "SAVOIR", rx: /🟡\s*\[SAVOIR\]\s*:?/gi, label: "🟡 [SAVOIR] :" },
    { key: "INSPIRATION", rx: /🔴\s*\[INSPIRATION\]\s*:?/gi, label: "🔴 [INSPIRATION] :" },
    { key: "CONSOLIDATION", rx: /❓\s*\[CONSOLIDATION\]\s*:?/gi, label: "❓ [CONSOLIDATION] :" }
  ];

  for (const section of sections) {
    let seen = false;
    t = t.replace(section.rx, () => {
      if (!seen) {
        seen = true;
        return section.label;
      }
      return `__MWALIMU_DUP_${section.key}__`;
    });
  }

  t = t.replace(/__MWALIMU_DUP_(VECU|SAVOIR|INSPIRATION|CONSOLIDATION)__[\s\S]*?(?=🔵\s*\[VÉCU\]|🟡\s*\[SAVOIR\]|🔴\s*\[INSPIRATION\]|❓\s*\[CONSOLIDATION\]|👉|🌟|\*\*\*«|$)/gi, "");

  const lignes = t.split("\n");
  const sorties = [];
  let headerDejaVu = false;
  let ouvertureDejaVue = false;
  let encouragementDejaVu = false;
  let citationDejaVue = false;

  for (const ligne of lignes) {
    const l = String(ligne || "").trim();
    const n = l.toLowerCase();
    if (!l) {
      if (sorties[sorties.length - 1] !== "") sorties.push("");
      continue;
    }
    if (/mwalimu edtech\s*:\s*ton mentor/i.test(l)) {
      if (headerDejaVu) continue;
      headerDejaVu = true;
    }
    if (/^👉/.test(l)) {
      if (ouvertureDejaVue) continue;
      ouvertureDejaVue = true;
    }
    if (/^🌟\s*mot d['’]encouragement/i.test(l)) {
      if (encouragementDejaVu) continue;
      encouragementDejaVu = true;
    }
    if (/^\*\*\*«/.test(l)) {
      if (citationDejaVue) continue;
      citationDejaVue = true;
    }
    if (sorties.length && sorties[sorties.length - 1].trim().toLowerCase() === n) continue;
    sorties.push(ligne.trimEnd());
  }

  return sorties.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function traiterQuestionDeCoursActivee(user, texteUtilisateur, historique = [], detection = {}) {
  const matiere = detection?.matiere || "general";
  const systemInstruction = `${construireSystemPrompt(user)}
MODE QUESTION DE COURS — ACTIVATION PRUDENTE :
- Tu réponds uniquement à une question de cours ou de définition.
- N'utilise pas Google Search.
- FIDÉLITÉ ABSOLUE À L'ÉNONCÉ : avant toute explication, recopie l'énoncé reçu exactement.
- Interdiction de modifier un signe, un exposant, une lettre, une inconnue, un coefficient ou une unité.
- Interdiction de transformer par exemple 2x en 2, x² en x, + en -, ou d'oublier un terme.
- Si l'énoncé contient une équation du second degré, ne la traite jamais comme une équation simple du premier degré.
- Si l'énoncé est ambigu, demande une précision au lieu de corriger ou d'inventer.
- Ne parle jamais de CONTEXTE WEB, CONTEXTE DB, SOURCE PRINCIPALE ou SOURCE SECONDAIRE.
- Réponds comme un précepteur professionnel, simple, clair et humain.
- Donne une définition courte, puis une explication, puis un exemple concret.
- Ne sois pas bavard.
- Ne génère jamais le header Mwalimu.
- Ne génère jamais de citation finale.
- Ne génère jamais d'ouverture finale.
- Ne génère jamais de mot d'encouragement final.
- Structure obligatoire, une seule fois chacune :
🔵 [VÉCU]
🟡 [SAVOIR]
🔴 [INSPIRATION]
❓ [CONSOLIDATION]
- La consolidation doit contenir une seule petite question directement liée à la notion.`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction
  });

  const contents = [
    ...toGeminiContents(historique.slice(-6)),
    {
      role: "user",
      parts: [
        {
          text: `Question de cours détectée.
Matière détectée : ${matiere}
Question de l'élève : ${texteUtilisateur}

Réponds avec la structure Mwalimu, sans doublons.`
        }
      ]
    }
  ];

  const reponse = await safeAI(async () => {
    const r = await genererAvecRetry(model, {
      contents,
      generationConfig: { temperature: 0.15 }
    });
    return r.response.text();
  }, `🔵 [VÉCU] : J'ai bien reçu ta question.
🟡 [SAVOIR] : C'est une notion de cours. Reprenons-la simplement.
🔴 [INSPIRATION] : Comprendre les bases aide à progresser avec confiance.
❓ [CONSOLIDATION] : Peux-tu reformuler cette notion avec tes propres mots ?`);

  return nettoyerDoublonsPedagogiques(
    nettoyerFuitesContexteAcademique(reponse)
  );
}



/* =========================================================
   ROUTAGE ACADÉMIQUE ÉCRIT — PHASE 3 : EXERCICE À RÉSOLUTION
   Activation limitée : méthode + démarrage, sans réponse finale directe
========================================================= */

function extraireEquationOuEnonceCourt(texte = "") {
  const brut = String(texte || "").trim();
  if (!brut) return "";

  const stopWords = [
    "aide-moi", "aide moi", "aidez-moi", "aidez moi", "tu peux", "peux-tu", "peux tu",
    "s'il te plait", "s il te plait", "svp", "stp", "explique", "explique-moi", "explique moi",
    "resous", "résous", "resoudre", "résoudre", "calcule", "calcule-moi", "calcule moi",
    "comment", "merci"
  ];

  let segment = brut;
  const normalise = retirerAccents(brut.toLowerCase());
  let cutIndex = -1;

  for (const mot of stopWords) {
    const m = retirerAccents(mot.toLowerCase());
    const idx = normalise.indexOf(m);
    if (idx > 0 && (cutIndex === -1 || idx < cutIndex)) {
      cutIndex = idx;
    }
  }

  if (cutIndex > 0) {
    segment = brut.slice(0, cutIndex).trim();
  }

  const equation = segment.match(/([0-9a-zA-ZÀ-ÿ²³√+\-*/×÷().,\s]+?)\s*=\s*([0-9a-zA-ZÀ-ÿ²³√+\-*/×÷().,\s]+)/);
  if (equation && equation[1] && equation[2]) {
    const gauche = equation[1].replace(/\s+/g, " ").trim();
    const droite = equation[2]
      .replace(/\s+/g, " ")
      .replace(/[,;:.!?]+$/g, "")
      .trim();

    if (gauche && droite) return `${gauche} = ${droite}`;
  }

  return segment
    .replace(/\s+/g, " ")
    .replace(/[,;:.!?]+$/g, "")
    .trim();
}

function imposerEnonceExactExercice(reponse = "", enonceExact = "") {
  let t = String(reponse || "").trim();
  const e = String(enonceExact || "").trim();
  if (!t || !e) return t;

  // On supprime les rappels d’énoncé générés par l’IA pour éviter
  // qu’elle affiche une équation modifiée ou un doublon.
  t = t
    .replace(/^\s*L['’]énoncé\s+de\s+ton\s+exercice\s+est\s*:?\s*`?[^`\n]*`?\s*$/gim, "")
    .replace(/^\s*Énoncé\s+reçu\s+exactement\s*:?\s*`?[^`\n]*`?\s*\.?\s*$/gim, "")
    .replace(/^\s*L['’]énoncé\s+exact\s*:?\s*`?[^`\n]*`?\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const blocEnonce = `L'énoncé de ton exercice est :\n\`${e}\``;
  return `${blocEnonce}\n\n${t}`.replace(/\n{3,}/g, "\n\n").trim();
}

function nettoyerReponseExerciceAResolution(texte = "") {
  let t = nettoyerFuitesContexteAcademique(texte);
  t = nettoyerDoublonsPedagogiques(t);
  t = t.replace(/^\s*Je\s+vois\s+que\s+tu\s+me\s+redonnes\s+la\s+m[êe]me\s+[^\n]*\.?\s*$/gim, "");
  t = t.replace(/^\s*Tu\s+me\s+redonnes\s+la\s+m[êe]me\s+[^\n]*\.?\s*$/gim, "");
  t = t.replace(/\b(?:donc|ainsi),?\s*(?:la\s+)?r[ée]ponse\s+finale\s+est\s*:?\s*.*$/gim, "");
  t = t.replace(/\b(?:solution\s+finale|r[ée]sultat\s+final)\s*:?\s*.*$/gim, "");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

async function traiterExerciceAResolutionActive(user, texteUtilisateur, historique = [], detection = {}) {
  const matiere = detection?.matiere || "general";
  const enonceExact = extraireEquationOuEnonceCourt(texteUtilisateur);

  const systemInstruction = `${construireSystemPrompt(user)}
MODE EXERCICE À RÉSOLUTION — ACTIVATION PRUDENTE :
- Tu traites uniquement un exercice, un devoir, un calcul ou une procédure à résoudre.
- Matières possibles : maths, physique, chimie, électricité, mécanique, résistance des matériaux, électronique, comptabilité, statistique, algorithmique, économie quantitative, sciences techniques.
- N'utilise pas Google Search.
- Ne parle jamais de CONTEXTE WEB, CONTEXTE DB, SOURCE PRINCIPALE ou SOURCE SECONDAIRE.
- Réponds comme un précepteur professionnel, simple, clair et humain.
- Explique la méthode pas à pas.
- Ne recopie pas l'énoncé toi-même : le système l'ajoutera automatiquement avec exactitude.
- Montre seulement le démarrage utile ou la première étape importante.
- Ne donne pas directement toute la réponse finale.
- Termine en demandant à l'élève de continuer ou de proposer sa réponse.
- Si l'exercice est ambigu, demande une précision au lieu d'inventer.
- Ne génère jamais le header Mwalimu.
- Ne génère jamais de citation finale.
- Ne génère jamais d'ouverture finale.
- Ne génère jamais de mot d'encouragement final.
- Structure obligatoire, une seule fois chacune :
🔵 [VÉCU]
🟡 [SAVOIR]
🔴 [INSPIRATION]
❓ [CONSOLIDATION]
- Dans [CONSOLIDATION], demande à l'élève de faire l'étape suivante ou de proposer sa réponse finale.`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction
  });

  const contents = [
    ...toGeminiContents(historique.slice(-6)),
    {
      role: "user",
      parts: [
        {
          text: `Exercice à résolution détecté.
Matière détectée : ${matiere}
ÉNONCÉ EXACT À RESPECTER CARACTÈRE PAR CARACTÈRE :
<<<${enonceExact || texteUtilisateur}>>>

Message complet de l'élève :
${texteUtilisateur}

Réponds comme Mwalimu : explique la méthode, démarre la résolution, mais ne donne pas directement toute la réponse finale. Ne recopie pas l'énoncé toi-même.`
        }
      ]
    }
  ];

  const reponse = await safeAI(async () => {
    const r = await genererAvecRetry(model, {
      contents,
      generationConfig: { temperature: 0.12 }
    });
    return r.response.text();
  }, `🔵 [VÉCU] : J'ai bien reçu ton exercice.
🟡 [SAVOIR] : Nous allons commencer par identifier la méthode, puis avancer étape par étape.
🔴 [INSPIRATION] : Chercher soi-même la suite aide à vraiment comprendre.
❓ [CONSOLIDATION] : Fais la première étape que tu proposes, puis envoie-moi ta réponse pour correction.`);

  return imposerEnonceExactExercice(
    nettoyerReponseExerciceAResolution(reponse),
    enonceExact
  );
}

/* =========================================================
   TRAITEMENT TEXTE
========================================================= */
async function traiterTexte(user, texteUtilisateur, historique) {
  // Phase 2 limitée : question_de_cours active. Le reste reste en observation seulement.
  const detectionAcademiqueEcrite = observerRoutageAcademiqueEcrit(user, texteUtilisateur, historique);

  if (detectionAcademiqueEcrite?.route === "question_de_cours") {
    const cacheKeyCours = makeCacheKey(user, `question_de_cours|${texteUtilisateur}`);
    const cachedCours = getCache(cacheKeyCours);
    if (cachedCours) {
      logInfo("cache_hit_question_de_cours", { phone: user?.phone || "", cacheKey: cacheKeyCours });
      return { reponse: cachedCours, fiche: null, bypassFormat: false };
    }

    const reponseCours = await traiterQuestionDeCoursActivee(
      user,
      texteUtilisateur,
      historique,
      detectionAcademiqueEcrite
    );

    if (reponseCours && String(reponseCours).trim()) {
      setCache(cacheKeyCours, reponseCours);
    }

    logInfo("routage_academique_question_de_cours_active", {
      phone: user?.phone || "",
      matiere: detectionAcademiqueEcrite.matiere,
      preview: tronquerTexte(texteUtilisateur, 160)
    });

    return { reponse: reponseCours, fiche: null, bypassFormat: false };
  }

  if (detectionAcademiqueEcrite?.route === "exercice_a_resolution") {
    const cacheKeyExercice = makeCacheKey(user, `exercice_a_resolution|${texteUtilisateur}`);
    const cachedExercice = getCache(cacheKeyExercice);
    if (cachedExercice) {
      logInfo("cache_hit_exercice_a_resolution", { phone: user?.phone || "", cacheKey: cacheKeyExercice });
      return { reponse: cachedExercice, fiche: null, bypassFormat: false };
    }

    const reponseExercice = await traiterExerciceAResolutionActive(
      user,
      texteUtilisateur,
      historique,
      detectionAcademiqueEcrite
    );

    if (reponseExercice && String(reponseExercice).trim()) {
      setCache(cacheKeyExercice, reponseExercice);
    }

    logInfo("routage_academique_exercice_a_resolution_active", {
      phone: user?.phone || "",
      matiere: detectionAcademiqueEcrite.matiere,
      preview: tronquerTexte(texteUtilisateur, 160)
    });

    return { reponse: reponseExercice, fiche: null, bypassFormat: false };
  }

  if (
    dernierMessageEstInvitationChoixMatiere(historique) &&
    estReponseGeneriqueExploration(texteUtilisateur) &&
    !contientChoixMatiere(texteUtilisateur)
  ) {
    const reponse = genererRelanceChoixMatiere(user);
    return { reponse, fiche: null, bypassFormat: true };
  }

  let decision = await cerveauDecisionIA(user, texteUtilisateur, historique, "text");
  decision = securiserDecisionCasSensibles(decision, texteUtilisateur, historique);

  if (
    decision.route === "reponse_sociale" ||
    decision.route === "reponse_bien_etre"
  ) {
    const reponse = await genererReponseSocialeIA(user, texteUtilisateur, historique, decision);
    return { reponse, fiche: null, bypassFormat: true };
  }

  if (decision.route === "incompris") {
    return {
      reponse: "Je n'ai pas bien compris. Peux-tu reformuler simplement ?",
      fiche: null,
      bypassFormat: true
    };
  }

  const cacheKey = makeCacheKey(user, texteUtilisateur);
  const cached = getCache(cacheKey);
  if (cached) {
    logInfo("cache_hit", { phone: user?.phone || "", cacheKey });
    return { reponse: cached, fiche: null, bypassFormat: false };
  }

  let analyse = {
    intention: decision.intention,
    matiere: detecterMatiereScientifique(texteUtilisateur, "", null),
    besoinCorrectionRenforcee: false,
    sujet: extraireSujetMemoire(texteUtilisateur) || "general"
  };

  const fiche = await consulterBibliotheque(texteUtilisateur, user.classe || "");
  const consigneBase = construireConsignePedagogique(texteUtilisateur, "text");
  const antiBoucle = await construireConsigneAntiBoucle(user, texteUtilisateur, analyse);

  let consigneFinale = consigneBase;
  if (analyse.intention === "juridique") {
    consigneFinale += `\nLe message semble juridique. Si c'est un article, recopie-le exactement seulement s'il est fiable.`;
  }
  if (analyse.intention === "geographie_rdc" || estQuestionGeographieRDC(texteUtilisateur, fiche)) {
    consigneFinale += `\nLe message concerne probablement une subdivision administrative. Si une liste complète est demandée, donne la liste complète trouvée.`;
  }
  consigneFinale += `\nLa consolidation, la citation finale et l'ouverture finale doivent rester dans la matière principale de la question.`;
  if (antiBoucle.consigne) {
    consigneFinale += `\n${antiBoucle.consigne}`;
  }

  const reponse = await construireReponseDbWebIa(user, texteUtilisateur, historique, fiche, consigneFinale);

  if (reponse && String(reponse).trim()) {
    setCache(cacheKey, reponse);
  }
  if (!reponse || !String(reponse).trim()) {
    await logUnansweredQuestion(user, texteUtilisateur, "text", "traiterTexte_empty");
  }
  if (!estSoumissionReponse(texteUtilisateur)) {
    await resetStudentAttempt(user.phone, antiBoucle.sujet || analyse.sujet || "general");
  }

  return { reponse, fiche: fiche || null, bypassFormat: false };
}

/* =========================================================
   TRAITEMENT AUDIO - CORRIGÉ : plus de test de taille
========================================================= */
async function traiterAudio(user, msg, historique) {
  const audioId = msg.audio?.id;
  if (!audioId) {
    return { reponse: "Je n'arrive pas à lire ton audio.", fiche: null, bypassFormat: true };
  }

  // Télécharger l'audio une seule fois
  let buffer, mimeType;
  try {
    const media = await telechargerMedia(audioId, 8 * 1024 * 1024);
    buffer = media.buffer;
    mimeType = media.mimeType;
  } catch (e) {
    logError("audio_download_error", e, { phone: user?.phone });
    return { reponse: "Je n'arrive pas à télécharger ton audio. Réessaie.", fiche: null, bypassFormat: true };
  }

  logInfo("audio_received", { phone: user?.phone || "", mimeType });

  if (!estMimeAudioSupporte(mimeType)) {
    return { reponse: "Format audio non supporté.", fiche: null, bypassFormat: true };
  }

  // Toujours analyser l'audio via l'IA pour déterminer son type
  const analyse = await analyserAudioCourt(user, buffer, mimeType, historique);
  const transcriptionBrute = String(analyse?.transcription || "").trim();
  const transcription = normaliserTexteRelationnel(transcriptionBrute);
  const typeAudio = String(analyse?.type || "incompris").trim().toLowerCase();

  const audioSocial = traiterAudioPurementSocial(
    user,
    transcriptionBrute || transcription,
    typeAudio,
    historique
  );

  if (audioSocial) {
    return audioSocial;
  }

  // Vérifications sociales APRÈS l'analyse IA
  if (
    estReponseJourneeBienEtre(transcriptionBrute) ||
    estReponseJourneeBienEtre(transcription)
  ) {
    const rep = genererRepriseApresBienEtre(user);
    return { reponse: rep, fiche: null, bypassFormat: true };
  }

  if (estSecondTourSalutation(historique, transcription || transcriptionBrute)) {
    const rep = genererRepriseApresBienEtre(user);
    return { reponse: rep, fiche: null, bypassFormat: true };
  }

  if (transcription && estMessagePurementSocial(transcription) && !contientQuestionAcademique(transcription)) {
    const rep = construireReponseHumaineSimple(user, transcription);
    if (rep) return { reponse: rep, fiche: null, bypassFormat: true };
  }
  if (transcriptionBrute && estMessagePurementSocial(transcriptionBrute) && !contientQuestionAcademique(transcriptionBrute)) {
    const rep = construireReponseHumaineSimple(user, transcriptionBrute);
    if (rep) return { reponse: rep, fiche: null, bypassFormat: true };
  }

  const tMini = normaliserTexteRelationnel(transcriptionBrute);
  if (tMini && tMini.split(" ").length <= 5 && estMessagePurementSocial(tMini) && !contientQuestionAcademique(tMini)) {
    return {
      reponse: construireReponseHumaineSimple(user, tMini) || "Je t'en prie 😊",
      fiche: null,
      bypassFormat: true
    };
  }

  // Si l'IA a détecté un audio social ET pas de contenu académique
  if (typeAudio === "social" && !contientQuestionAcademique(transcription || transcriptionBrute)) {
    const rep = construireReponseHumaineSimple(user, transcription || transcriptionBrute);
    return {
      reponse: rep || genererRepriseApresBienEtre(user),
      fiche: null,
      bypassFormat: true
    };
  }

  // Pour les audios académiques ou questions, traitement IA complet
  let reponse = await reponseAudioUneSeulePasse(user, buffer, mimeType, historique, null);
  const texteAudioNormalise = normaliserTexteRelationnel(reponse);

  if (texteAudioNormalise && estMessagePurementSocial(texteAudioNormalise) && !contientQuestionAcademique(texteAudioNormalise)) {
    const repSimple = construireReponseHumaineSimple(user, texteAudioNormalise);
    if (repSimple) return { reponse: repSimple, fiche: null, bypassFormat: true };
  }

  if (!reponse || !reponse.trim()) {
    reponse = "Je n'arrive pas encore à analyser ton audio correctement.";
    return { reponse, fiche: null, bypassFormat: true };
  }

  const bypassFormat = estReponseRelationnelleSimpleIA(reponse);
  return { reponse, fiche: null, bypassFormat };
}

/* =========================================================
   TRAITEMENT IMAGE
========================================================= */
async function traiterImage(user, msg, historique) {
  const imageId = msg.image?.id;

  if (!imageId) {
    return {
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Mais je n'arrive pas à l'ouvrir correctement.
🔴 [INSPIRATION] : Nous allons y arriver.
❓ [CONSOLIDATION] : Réessaie avec une image plus nette.`,
      fiche: null,
      bypassFormat: false
    };
  }

  const { buffer, mimeType } = await telechargerMedia(imageId, 8 * 1024 * 1024);
  logInfo("image_received", { phone: user?.phone || "", mimeType });

  if (!estMimeImageSupporte(mimeType)) {
    return {
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Le format d'image n'est pas encore supporté.
🔴 [INSPIRATION] : Ce n'est pas grave.
❓ [CONSOLIDATION] : Envoie-moi une image en JPG, JPEG, PNG, WEBP, GIF, BMP, HEIC ou HEIF.`,
      fiche: null,
      bypassFormat: false
    };
  }

  const base64Image = buffer.toString("base64");
  const resultat = await expliquerImageAvecIA(user, base64Image, mimeType, historique);

  return {
    reponse: resultat?.reponse || `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Je n'arrive pas encore à l'analyser correctement.
🔴 [INSPIRATION] : Nous pouvons reprendre calmement.
❓ [CONSOLIDATION] : Envoie-moi une image plus nette ou mieux cadrée.`,
    fiche: null,
    bypassFormat: Boolean(resultat?.bypassFormat)
  };
}

/* =========================================================
   COMMANDES
========================================================= */
async function traiterCommandeTexte(from, _user, texteUtilisateur) {
  const cmd = String(texteUtilisateur || "").trim().toLowerCase();

  if (cmd === "/aide") {
    await envoyerWhatsAppAvecRetry(
      from,
      `${HEADER_MWALIMU}\n📘 *Commandes disponibles*\n/aide → voir les commandes\n/profil → refaire ton profil\n/reset → vider l'historique\n/stop → arrêter les rappels du matin\n/start → réactiver les rappels du matin\n\n📎 *Nouveau* : Tu peux m'envoyer des fichiers PDF, je les lirai pour toi !`
    );
    return true;
  }

  if (cmd === "/stop") {
    await updateUserField(from, "reminders_enabled", false);
    await envoyerWhatsAppAvecRetry(
      from,
      `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : J'ai bien reçu ta demande.\n🟡 [SAVOIR] : Les rappels du matin sont maintenant arrêtés.\n🔴 [INSPIRATION] : Tu gardes le contrôle de ton rythme.\n❓ [CONSOLIDATION] : Si tu veux les réactiver, envoie /start.`
    );
    return true;
  }

  if (cmd === "/start") {
    await updateUserField(from, "reminders_enabled", true);
    await envoyerWhatsAppAvecRetry(
      from,
      `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : J'ai bien reçu ta demande.\n🟡 [SAVOIR] : Les rappels du matin sont maintenant réactivés.\n🔴 [INSPIRATION] : Une bonne régularité aide à progresser.\n❓ [CONSOLIDATION] : Nous continuerons ensemble pas à pas.`
    );
    return true;
  }

  if (cmd === "/reset") {
    await updateUserField(from, "historique", []);
    await resetAllStudentAttempts(from);
    await envoyerWhatsAppAvecRetry(
      from,
      `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : J'ai bien reçu ta demande.\n🟡 [SAVOIR] : L'historique a été remis à zéro.\n🔴 [INSPIRATION] : Repartir proprement peut aider.\n❓ [CONSOLIDATION] : Envoie-moi maintenant la question ou l'exercice que tu veux reprendre.`
    );
    return true;
  }

  if (cmd === "/profil") {
    await pool.query(
      "UPDATE conversations SET nom = '', classe = '', reve = '', historique = '[]'::jsonb, updated_at = NOW() WHERE phone = $1",
      [from]
    );
    await resetAllStudentAttempts(from);
    await envoyerWhatsAppAvecRetry(
      from,
      `${HEADER_MWALIMU}\n────────────────\n🔄 *Mise à jour de ton profil*\n🟡 Quel est ton *prénom* ?`
    );
    return true;
  }

  return false;
}

/* =========================================================
   CRON
========================================================= */
cron.schedule(
  "0 7 * * *",
  async () => {
    try {
      logInfo("cron_morning_reminder_start");
      const { rows } = await pool.query(
        `SELECT phone, nom FROM conversations WHERE coalesce(phone, '') <> '' AND coalesce(nom, '') <> '' AND coalesce(reminders_enabled, TRUE) = TRUE`
      );
      for (const eleve of rows) {
        try {
          const appel = `${genreEleve(eleve.nom)} **${premierPrenom(eleve.nom)}**`;
          const citation = pick(CITATIONS.patriotisme);
          const messageRappel = `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : Bonjour ${appel}.\n🟡 [SAVOIR] : Petit rappel du matin : avance aujourd'hui avec calme et sérieux.\n🔴 [INSPIRATION] : Ton objectif n'est pas d'aller vite, mais de bien comprendre.\n❓ [CONSOLIDATION] : Quelle matière veux-tu travailler aujourd'hui ?\n👉 Je reste à tes côtés.\n🌟 Mot d'encouragement : Un élève constant progresse.\n${citation}`.replace(
            /\n{3,}/g,
            "\n\n"
          ).trim();
          await envoyerWhatsAppAvecRetry(eleve.phone, messageRappel);
        } catch (e) {
          logError("cron_morning_reminder_user", e, { phone: eleve?.phone || "" });
        }
      }
      logInfo("cron_morning_reminder_done", { count: rows.length });
    } catch (e) {
      logError("cron_morning_reminder", e);
    }
  },
  { timezone: "Africa/Lubumbashi" }
);

cron.schedule(
  "0 3 * * *",
  async () => {
    try {
      await pool.query("DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '2 days'");
      logInfo("cron_cleanup_processed_messages_done");
    } catch (e) {
      logError("cron_cleanup_processed_messages", e);
    }
  },
  { timezone: "Africa/Lubumbashi" }
);

/* =========================================================
   PIPELINE PRINCIPAL
========================================================= */
async function processIncomingMessage(msg) {
  const from = msg.from;
  const msgId = msg.id;
  const texteUtilisateur = msg.text?.body?.trim() || "";
  const msgType = typeMessage(msg);
  const startedAt = nowMs();

  logInfo("incoming_message", { phone: from, msgId, msgType, preview: texteUtilisateur.slice(0, 80) });

  const check = await pool.query("INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT DO NOTHING", [msgId]);
  if (check.rowCount === 0) {
    logWarn("duplicate_message_ignored", { phone: from, msgId });
    return;
  }

  await envoyerIndicateurFrappe(msgId);

  let user = await getUser(from);

  if (!user) {
    await createUser(from);
    user = await getUser(from);
    await envoyerWhatsAppAvecRetry(
      from,
      `${HEADER_MWALIMU}\n────────────────\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.\n🟡 Quel est ton *prénom* ?`
    );
    return;
  }

  if (msgType === "text") {
    const commandeTraitee = await traiterCommandeTexte(from, user, texteUtilisateur);
    if (commandeTraitee) return;
  }

  if (!user.nom) {
    const nom = normaliserNom(nettoyer(texteUtilisateur));
    if (!nom) {
      await envoyerWhatsAppAvecRetry(
        from,
        `${HEADER_MWALIMU}\n────────────────\n🟡 Donne-moi simplement ton *prénom*, s'il te plaît.`
      );
      return;
    }
    await updateUserField(from, "nom", nom);
    await envoyerWhatsAppAvecRetry(from, `🤝 Enchanté *${nom}* !\n🟡 En quelle *classe* es-tu ?`);
    return;
  }

  if (!user.classe) {
    const cl = normaliserNom(nettoyer(texteUtilisateur));
    if (!cl) {
      await envoyerWhatsAppAvecRetry(
        from,
        `🟡 Écris-moi ta *classe* simplement.\nExemple : 6e, 8e, Terminale, 1ère secondaire.`
      );
      return;
    }
    await updateUserField(from, "classe", cl);
    user = await getUser(from);
    await envoyerWhatsAppAvecRetry(
      from,
      `🟡 C'est bien noté, *${user.nom}*.\n❓ Quel est ton plus grand *rêve* professionnel ?`
    );
    return;
  }

  if (!user.reve) {
    const rv = normaliserNom(nettoyer(texteUtilisateur));
    if (!rv) {
      await envoyerWhatsAppAvecRetry(
        from,
        `❓ Dis-moi simplement ton *rêve* professionnel.\nExemple : avocat, médecin, ingénieur, pilote.`
      );
      return;
    }
    await updateUserField(from, "reve", rv);
    user = await getUser(from);
    await envoyerWhatsAppAvecRetry(
      from,
      `✨ *Quelle ambition magnifique !*\n🔴 Devenir *${rv}* est un rêve noble, et je sais que tu en es capable.\n🔵 *Pour commencer notre parcours ensemble, dis-moi :*\n👉 Quelle matière ou quel chapitre te pose problème en ce moment ?`
    );
    return;
  }

  let historique = Array.isArray(user.historique)
    ? user.historique
    : safeJsonParse(user.historique, []);

  let contenuUtilisateurPourMemoire = texteUtilisateur || `[message ${msgType}]`;

  // ✅ CORRECTION SOCIALE - Vérification rapide avant pipeline complet
  if (msgType === "text" && texteUtilisateur) {
    if (estMessageRelationnelSimple(texteUtilisateur)) {
      const reponseSimple = construireReponseHumaineSimple(user, texteUtilisateur);
      if (reponseSimple) {
        await appendHistorique(from, "user", texteUtilisateur);
        await appendHistorique(from, "assistant", reponseSimple);
        await envoyerWhatsAppAvecRetry(from, reponseSimple);
        logInfo("social_response_sent", { phone: from, preview: texteUtilisateur.slice(0, 40) });
        return;
      }
    }
  }

  if (msgType === "text" && texteUtilisateur) {
    await appendHistorique(from, "user", texteUtilisateur);
    const userFresh = await getUser(from);
    historique = Array.isArray(userFresh?.historique)
      ? userFresh.historique
      : safeJsonParse(userFresh?.historique, []);
  }

  let reponseBrute = "";
  let ficheContexte = null;
  let bypassFormat = false;

  if (msgType === "text") {
    const resultat = await traiterTexte({ ...user, phone: from }, texteUtilisateur, historique);
    reponseBrute = resultat?.reponse || "";
    ficheContexte = resultat?.fiche || null;
    bypassFormat = Boolean(resultat?.bypassFormat);
  } else if (msgType === "audio") {
    const resultat = await traiterAudio({ ...user, phone: from }, msg, historique);
    reponseBrute = resultat?.reponse || "";
    ficheContexte = resultat?.fiche || null;
    bypassFormat = Boolean(resultat?.bypassFormat);
    contenuUtilisateurPourMemoire = "[audio envoyé]";
    await appendHistorique(from, "user", contenuUtilisateurPourMemoire);
  } else if (msgType === "image") {
    const resultat = await traiterImage({ ...user, phone: from }, msg, historique);
    reponseBrute = resultat?.reponse || "";
    ficheContexte = resultat?.fiche || null;
    bypassFormat = Boolean(resultat?.bypassFormat);
    contenuUtilisateurPourMemoire = "[image envoyée]";
    await appendHistorique(from, "user", contenuUtilisateurPourMemoire);
  } else if (msgType === "pdf") {
    const resultat = await traiterDocumentPDF({ ...user, phone: from }, msg, historique);
    reponseBrute = resultat?.reponse || "";
    ficheContexte = resultat?.fiche || null;
    bypassFormat = Boolean(resultat?.bypassFormat);
    contenuUtilisateurPourMemoire = "[PDF envoyé]";
    await appendHistorique(from, "user", contenuUtilisateurPourMemoire);
  } else {
    reponseBrute = `🔵 [VÉCU] : J'ai bien reçu ton fichier.\n🟡 [SAVOIR] : Je ne peux pas encore analyser ce type de format pour le moment.\n🔴 [INSPIRATION] : Ce n'est pas grave, nous pouvons utiliser le texte, les images ou les PDF.\n❓ [CONSOLIDATION] : Envoie-moi plutôt ton exercice par écrit, en photo ou en PDF.`;
    bypassFormat = false;
  }

  let messageFinal = "";

  if (bypassFormat) {
    messageFinal = reponseBrute;
  } else {
    messageFinal = construireMessageFinal(
      { ...user, phone: from },
      reponseBrute,
      historique,
      texteUtilisateur || contenuUtilisateurPourMemoire,
      ficheContexte
    );
  }

  if (!messageFinal || !messageFinal.trim()) {
    messageFinal = messageSecours({ ...user, phone: from }, msgType);
  }

  await appendHistorique(from, "assistant", messageFinal);
  await envoyerWhatsAppAvecRetry(from, messageFinal);

  logInfo("message_processed_success", { phone: from, msgId, durationMs: nowMs() - startedAt });
}

/* =========================================================
   WEBHOOK
========================================================= */
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    logInfo("webhook_verified");
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  if (!verifierSignatureMeta(req)) {
    logWarn("webhook_signature_invalid_or_missing", { ip: req.ip });
    return res.sendStatus(403);
  }

  const msg = extraireMessageWhatsApp(req.body);
  if (!msg) return res.sendStatus(200);

  const from = msg.from;

  runSequentialByKey(from, async () => {
    try {
      await processIncomingMessage(msg);
    } catch (err) {
      logError("pipeline_processing_failure", err, { phone: from, msgId: msg.id });
      try {
        const fallback = messageSecours({ phone: from }, typeMessage(msg));
        await envoyerWhatsAppAvecRetry(from, fallback);
      } catch (sendErr) {
        logError("critical_fallback_send_failure", sendErr);
      }
    }
  });

  return res.sendStatus(200);
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({ status: "healthy", timestamp: horodatage() });
  } catch (e) {
    return res.status(500).json({ status: "unhealthy", error: e.message });
  }
});

/* =========================================================
   INITIALISATION
========================================================= */
(async () => {
  logInfo("api_starting");
  await initDB();
  app.listen(PORT, () => {
    logInfo("server_listening", { port: PORT });
  });
})();
