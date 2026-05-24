


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

/* =========================================================
   4) CACHE TTL PROPRE
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
  const q = String(texte || "").toLowerCase().trim();
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
   DÉTECTION SOCIALE AMÉLIORÉE (avec réponses de bien-être)
========================================================= */
function estMessagePurementSocial(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  if (/^(bonjour|bonsoir|salut|hello|coucou|bjr|bsr|mbote|yo|cc|slt)\b/i.test(t)) return true;

  if (/^(merci|merci beaucoup|grand merci|mille mercis|merci infiniment|merci encore|merci bien|merci à toi|merci mwalimu|merci mon cher|je te remercie|je vous remercie|cimer|thanks|thx)\b/i.test(t)) return true;

  if (/^(ok|okay|d accord|dac|dacc|oui|non|ca va|bien|super|cool|entendu|compris|parfait|tres bien|nickel|ca marche|ca va merci|pas de souci|pas de problème|a plus|a tantot|a toute|bye|tchao)\b/i.test(t)) return true;

  if (/^(bonne nuit|fais de beaux reves|dors bien|bonne soiree|bonne journee|bonne matinee|bon apres midi|bon week end|bon weekend|a demain|a bientot)\b/i.test(t)) return true;

  if (/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\s]+$/u.test(t)) return true;

  if (/^(tu vas bien\??|comment vas-tu\??|comment tu vas\??|et toi\??|et vous\??|vous allez bien\??|comment ca va\??|ca va\??)$/i.test(t)) return true;

  if (/^(je vais bien|je vais très bien|je vais tres bien|je vais super bien|je vais bien merci|je vais très bien merci|je vais tres bien merci|je vais super bien merci|je me porte bien|je me porte très bien|je me porte tres bien|je me porte super bien|je me porte bien merci|je me porte très bien merci|je me porte tres bien merci|je me sens bien|je me sens très bien|je me sens tres bien|je me sens super bien|je me sens bien merci|tranquille|tranquille merci|pas mal|pas mal merci|au top|au top merci|ça roule|ca roule|ça roule merci|ca roule merci|imboko|imboko merci|bien merci|bien et toi|bien et toi\?|je vais bien et toi|je vais bien et toi\?|je me porte bien et toi|je me porte bien et toi\?|je vais super bien et toi|je vais super bien et toi\?|oui je vais bien|oui je vais très bien|oui je vais tres bien|oui je me porte bien|oui ça va|oui ca va|oui ca va merci|oui ça va merci)$/i.test(t)) return true;

  return false;
}

function estMessageRelationnelSimple(texte = "") {
  return estMessagePurementSocial(texte);
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

  const scores = {
    droit: 0,
    geographie: 0,
    histoire: 0,
    math: 0,
    physique: 0,
    chimie: 0,
    francais: 0,
    general: 0
  };

  const ajouter = (theme, motsQuestion = [], motsCorps = [], poidsQuestion = 6, poidsCorps = 1) => {
    for (const mot of motsQuestion) {
      if (q.includes(mot)) scores[theme] += poidsQuestion;
    }
    for (const mot of motsCorps) {
      if (c.includes(mot)) scores[theme] += poidsCorps;
    }
  };

  ajouter("droit",["droit", "droit positif", "loi", "code", "article", "juridique", "tribunal", "ohada", "constitution"],["droit", "loi", "code", "article", "juridique", "tribunal", "ohada", "constitution"]);
  ajouter("geographie",["géographie", "geographie", "province", "territoire", "commune", "ville", "secteur", "chefferie", "subdivision administrative"],["géographie", "geographie", "province", "territoire", "commune", "ville", "secteur", "chefferie"]);
  ajouter("histoire",["histoire", "passé", "passe", "événement passé", "evenement passe", "colonisation", "indépendance", "independance", "royaume", "date historique"],["histoire", "passé", "passe", "colonisation", "indépendance", "independance", "royaume", "date"]);
  ajouter("math",["math", "maths", "équation", "equation", "fraction", "calcul", "racine", "puissance", "géométrie", "geometrie"],["math", "maths", "équation", "equation", "fraction", "calcul", "racine", "puissance"]);
  ajouter("physique",["physique", "force", "vitesse", "énergie", "energie", "masse", "pression", "mouvement"],["physique", "force", "vitesse", "énergie", "energie", "masse", "pression", "mouvement"]);
  ajouter("chimie",["chimie", "molécule", "molecule", "atome", "acide", "base", "solution", "réaction", "reaction"],["chimie", "molécule", "molecule", "atome", "acide", "base", "solution", "réaction", "reaction"]);
  ajouter("francais",["français", "francais", "grammaire", "orthographe", "conjugaison", "verbe", "phrase"],["français", "francais", "grammaire", "orthographe", "conjugaison", "verbe", "phrase"]);

  let meilleur = "general";
  let meilleurScore = 0;

  for (const [theme, score] of Object.entries(scores)) {
    if (score > meilleurScore) {
      meilleur = theme;
      meilleurScore = score;
    }
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

/* =========================================================
   FONCTIONS DE CONSOLIDATION (AMÉLIORÉES)
========================================================= */
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

  const questionReflexion = modeles[matiere] || modeles.general;

  return `❓ [CONSOLIDATION]
${questionReflexion}`;
}

/* =========================================================
   FONCTIONS DE CONCLUSION PROFESSIONNELLE
========================================================= */
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

/* =========================================================
   AUTRES OUTILS DE FORMATAGE
========================================================= */
function choisirCitationContextuelle(reponse = "", question = "") {
  const matiere = detecterMatierePrincipale(question, reponse);
  if (estMessageRelationnelSimple(question)) return "";
  if (matiere === "droit") return pick(CITATIONS.civisme);
  if (matiere === "geographie") return pick(CITATIONS.geographie);
  if (matiere === "histoire") return pick(CITATIONS.histoire);
  if (matiere === "math") return pick(CITATIONS.mathematiques);
  if (matiere === "physique" || matiere === "chimie") return pick(CITATIONS.sciences);
  if (matiere === "francais") return pick(CITATIONS.francais);
  return pick(CITATIONS.general);
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
  const matiere = detecterMatierePrincipale(question, reponse);
  const q = String(question || "").toLowerCase();
  if (estMessageRelationnelSimple(q)) return "";
  if (matiere === "droit") return "👉 Si tu veux, nous pouvons revoir un autre terme juridique ensuite.";
  if (matiere === "geographie") return "👉 Si tu veux, nous pouvons continuer avec une autre petite question de géographie.";
  if (matiere === "histoire") return "👉 Si tu veux, nous pouvons prendre un autre point d'histoire ensuite.";
  if (matiere === "math" || matiere === "physique" || matiere === "chimie") return "👉 Essaie maintenant de reformuler l'idée ou de faire une étape, puis envoie-moi ta réponse.";
  return "👉 Dis-moi maintenant ce que tu retiens en une phrase simple.";
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

/* =========================================================
   6b) LOGIQUE CONVERSATIONNELLE À DEUX TEMPS
========================================================= */
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
  
  // Détection flexible avec regex
  if (/comment\b.*\bvas\b.*\btu\b/i.test(texte)) return true;
  if (/comment\b.*\bte\b.*\bsens\b/i.test(texte)) return true;
  if (/comment\b.*\bse\b.*\bpasse\b/i.test(texte)) return true;
  if (/est(\s|-)ce(\s|-)que\b.*\bva\b.*\bbien\b/i.test(texte)) return true;
  
  return false;
}

function estSecondTourSalutation(historique = [], texteUtilisateur = "") {
  if (!dernierMessageEstQuestionBienEtre(historique)) return false;
  const t = normaliserTexteRelationnel(texteUtilisateur);

  const reponsesCourtes = [
    "ca va", "ca va bien", "je vais bien", "bien et toi", "oui je vais bien",
    "ca va merci", "je vais bien merci", "tranquille", "cool", "super",
    "pas mal", "tres bien", "nickel", "je vais super bien", "au top",
    "tu vas bien", "tu vas bien?", "comment vas-tu", "comment vas-tu?",
    "et toi", "et toi?", "et vous", "comment ca va", "comment ca va?",
    "vous allez bien", "vous allez bien?",
    "je vais bien", "je vais tres bien", "je vais bien merci", "je vais tres bien merci",
    "je me sens bien", "je me sens tres bien", "je me sens super bien",
    "je me porte bien", "je me porte tres bien", "je me porte super bien",
    "je me porte bien merci", "je me porte tres bien merci",
    "tranquille", "ca roule", "imboko", "bien merci",
    "je vais bien et toi", "je vais bien et toi?", "je vais super bien et toi",
    "je me porte bien et toi", "je me porte bien et toi?",
    "oui je vais bien", "oui je vais tres bien", "oui je me porte bien",
    "oui ca va", "oui ca va merci", "oui ça va", "oui ça va merci"
  ];

  return t.length < 80 && reponsesCourtes.includes(t);
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

function construireReponseHumaineSimple(user = {}, texte = "") {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom ? `**${prenom}**` : "toi";
  const t = normaliserTexteRelationnel(texte);
  const heure = new Date().getHours();

  if (estMessageRemerciement(t)) {
    const formules = [
      `Avec plaisir ${appel} 😊 Si tu as une question, je suis là.`,
      `Je t'en prie ${appel} 🤗 Dis-moi si tu veux revoir quelque chose.`,
      `C'est normal ${appel}, je suis là pour ça 💪 Une petite question à me poser ?`,
      `Heureux de t'aider ${appel} ✨ N'hésite pas si tu as besoin d'explications.`
    ];
    return pick(formules);
  }

  if (estMessageSalutation(t)) {
    if (/(bonjour|salut|bjr|mbote|yo|cc|slt)/i.test(t)) {
      const questionsMatin = [
        `Bonjour ${appel} ☀️ Comment vas-tu aujourd'hui ?`,
        `Salut ${appel} 😊 J'espère que tu as bien dormi.`,
        `Coucou ${appel} 👋 Contente de te retrouver. Comment te sens-tu ?`
      ];
      const questionsAprem = [
        `Bon après-midi ${appel} 🌤 Comment se passe ta journée ?`,
        `Salut ${appel} ☀️ Est-ce que tout va bien pour toi ?`
      ];
      const questionsSoir = [
        `Bonsoir ${appel} 🌙 Comment s'est passée ta journée ?`,
        `Salut ${appel} 🌆 Prêt·e à te détendre ? Raconte-moi vite comment s'est passée ta journée.`
      ];

      let question = "";
      if (heure < 12) question = pick(questionsMatin);
      else if (heure < 18) question = pick(questionsAprem);
      else question = pick(questionsSoir);
      return question;
    }

    if (t.includes("bonsoir")) {
      const formules = [
        `Bonsoir ${appel} 🌙 J'espère que ta journée s'est bien passée. As-tu une question ou une matière à revoir ?`,
        `Bonsoir ${appel} 😊 Contente de te retrouver en cette fin de journée. Qu'est-ce que tu aimerais apprendre maintenant ?`
      ];
      return pick(formules);
    }

    if (t.includes("bonne nuit")) return `Bonne nuit ${appel} 🌜 Fais de beaux rêves. Si tu veux réviser quelque chose demain, n'hésite pas.`;
    if (t.includes("bonne journee")) return `Bonne journée à toi aussi ${appel} ☀️ Qu'as-tu envie de découvrir aujourd'hui ?`;
    if (t.includes("bon apres midi")) return `Merci ${appel} ! Passe un bon après-midi 🌤 Et si tu veux, on peut revoir quelque chose ensemble.`;
    if (t.includes("bonne soiree")) return `Bonne soirée ${appel} 🌙 Si tu veux revoir un point avant de dormir, je suis là.`;
    if (t.includes("bon week end") || t.includes("bon weekend")) return `Bon week-end ${appel} 😄 Profite bien ! Si tu as un moment, on pourrait réviser une notion.`;
    if (t.includes("a demain")) return `À demain ${appel} 👋 J'ai hâte de continuer avec toi.`;
    return `Salut ${appel} 👋`;
  }

  if (estMessageCourtHumain(t)) {
    if (t === "ca va" || t === "ca va merci") {
      return `Oui, ça va très bien ${appel}, merci ! Et toi ? 😊 Si tu veux, on peut revoir une notion.`;
    }
    const simples = [
      `D'accord ${appel} 👍 Tu as quelque chose à revoir ?`,
      `Parfait ${appel} ✅ Dis-moi si tu veux travailler une matière.`,
      `Entendu ${appel} 😉 Je suis prêt à t'aider si tu as une question.`
    ];
    return pick(simples);
  }

  if (/^(tu vas bien\??|comment vas-tu\??|comment tu vas\??|et toi\??|et vous\??|vous allez bien\??|comment ca va\??|ca va\??)$/i.test(t)) {
    const reponses = [
      `Je vais très bien, merci ${appel} ! Et toi, comment vas-tu ? 😊`,
      `Tout va bien de mon côté, ${appel}. Merci de demander ! Et toi, qu'as-tu envie d'apprendre aujourd'hui ?`,
      `Je me sens en pleine forme, ${appel} ! Dis-moi, quelle matière veux-tu explorer ?`
    ];
    return pick(reponses);
  }

  return "";
}

function typeMessage(msg) {
  if (!msg) return "unknown";
  if (msg.text?.body) return "text";
  if (msg.audio) return "audio";
  if (msg.image) return "image";
  if (msg.document) return "document";
  if (msg.interactive) return "interactive";
  return msg.type || "unknown";
}

function messageTypeLisible(msgType = "message") {
  if (msgType === "audio") return "ton audio";
  if (msgType === "image") return "ton image";
  if (msgType === "text") return "ton message écrit";
  return "ton message";
}

/* =========================================================
   7) FONCTIONS CRITIQUES
========================================================= */
function estMimeImageSupporte(mimeType = "") {
  const allowed = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/heic",
    "image/heif"
  ];
  return allowed.includes(String(mimeType || "").toLowerCase());
}

function estMimeAudioSupporte(mimeType = "") {
  const allowed = [
    "audio/ogg",
    "audio/opus",
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/aac",
    "audio/amr"
  ];
  return allowed.includes(String(mimeType || "").toLowerCase());
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

function dedupeBlocFinal(texte = "") {
  const lignes = String(texte || "").split("\n");
  const resultat = [];
  const uniques = new Set();

  for (const ligneBrute of lignes) {
    const ligne = ligneBrute.trimRight();
    const normalisee = ligne.trim().toLowerCase();

    if (!normalisee) {
      if (resultat[resultat.length - 1] !== "") {
        resultat.push("");
      }
      continue;
    }

    const estUnique =
      normalisee.startsWith("👉 ") ||
      normalisee.startsWith("🌟 mot d'encouragement") ||
      normalisee.startsWith("***«") ||
      normalisee === "────────────────";

    if (estUnique) {
      if (uniques.has(normalisee)) continue;
      uniques.add(normalisee);
    }

    resultat.push(ligne);
  }

  return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function attendreAvecBackoff(tentative = 0) {
  const base = 1800;
  const extra = tentative * 1400;
  await attendre(base + extra);
}

async function genererAvecRetry(model, payload, maxRetries = 2) {
  let lastError = null;

  for (let tentative = 0; tentative <= maxRetries; tentative++) {
    try {
      await attendreAvecBackoff(tentative);
      return await model.generateContent(payload);
    } catch (e) {
      lastError = e;
      logError("gemini_retry", e, { tentative: tentative + 1 });

      if (estErreurQuotaGemini(e) && tentative < maxRetries) {
        await attendre(4000 + tentative * 3000);
        continue;
      }

      throw e;
    }
  }

  throw lastError;
}

async function safeAI(generateFn, fallbackMessage) {
  try {
    const res = await generateFn();
    if (!res || !String(res).trim()) throw new Error("Réponse vide");
    return res;
  } catch (e) {
    logError("safe_ai", e);
    return fallbackMessage;
  }
}

function extraireJsonGemini(brut = "") {
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

/* =========================================================
   8) DB
========================================================= */
async function ensureBibliothequeSearchInfra() {
  await pool.query(`ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS search_vector tsvector;`);

  await pool.query(`
    CREATE OR REPLACE FUNCTION bibliotheque_search_vector_update()
    RETURNS trigger AS $$
    BEGIN
      NEW.search_vector :=
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.titre, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.matiere, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.classe, ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.mots_cles, ''))), 'A') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.contenu, ''))), 'B') ||
        setweight(to_tsvector('simple', unaccent(coalesce(NEW.commentaire_ai, ''))), 'C');
      RETURN NEW;
    END
    $$ LANGUAGE plpgsql;
  `);

  await pool.query(`DROP TRIGGER IF EXISTS trg_bibliotheque_search_vector_update ON bibliotheque;`);

  await pool.query(`
    CREATE TRIGGER trg_bibliotheque_search_vector_update
    BEFORE INSERT OR UPDATE OF titre, matiere, classe, mots_cles, contenu, commentaire_ai
    ON bibliotheque
    FOR EACH ROW
    EXECUTE FUNCTION bibliotheque_search_vector_update();
  `);

  await pool.query(`
    UPDATE bibliotheque
    SET search_vector =
      setweight(to_tsvector('simple', unaccent(coalesce(titre, ''))), 'A') ||
      setweight(to_tsvector('simple', unaccent(coalesce(matiere, ''))), 'A') ||
      setweight(to_tsvector('simple', unaccent(coalesce(classe, ''))), 'B') ||
      setweight(to_tsvector('simple', unaccent(coalesce(mots_cles, ''))), 'A') ||
      setweight(to_tsvector('simple', unaccent(coalesce(contenu, ''))), 'B') ||
      setweight(to_tsvector('simple', unaccent(coalesce(commentaire_ai, ''))), 'C')
    WHERE search_vector IS NULL;
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bibliotheque_search_vector ON bibliotheque USING GIN (search_vector);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_bibliotheque_updated_at ON bibliotheque (updated_at DESC);`);
}

async function initDB() {
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS unaccent;");

    await pool.query(`CREATE TABLE IF NOT EXISTS processed_messages (msg_id TEXT PRIMARY KEY, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS conversations (phone TEXT PRIMARY KEY, nom TEXT DEFAULT '', classe TEXT DEFAULT '', reve TEXT DEFAULT '', historique JSONB DEFAULT '[]'::jsonb, reminders_enabled BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS bibliotheque (id SERIAL PRIMARY KEY, titre TEXT, matiere TEXT, classe TEXT, mots_cles TEXT, contenu TEXT, commentaire_ai TEXT DEFAULT '', source_type TEXT DEFAULT 'db', source_url TEXT DEFAULT '', provenance TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS unanswered_questions (id SERIAL PRIMARY KEY, phone TEXT DEFAULT '', question TEXT NOT NULL, msg_type TEXT DEFAULT 'text', classe TEXT DEFAULT '', nom TEXT DEFAULT '', reason TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS student_attempts (id SERIAL PRIMARY KEY, phone TEXT NOT NULL, sujet TEXT DEFAULT '', question TEXT DEFAULT '', attempts_count INT DEFAULT 0, last_user_answer TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_processed_messages_created_at ON processed_messages (created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_unanswered_questions_created_at ON unanswered_questions (created_at DESC);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_student_attempts_phone_sujet_updated ON student_attempts (phone, sujet, updated_at DESC);`);

    await ensureBibliothequeSearchInfra();
    logInfo("db_ready");
  } catch (e) {
    logError("init_db", e);
    process.exit(1);
  }
}

async function getUser(phone) {
  const { rows } = await pool.query("SELECT * FROM conversations WHERE phone = $1", [phone]);
  return rows[0] || null;
}

async function createUser(phone) {
  await pool.query(`INSERT INTO conversations (phone, nom, classe, reve, historique, reminders_enabled) VALUES ($1, '', '', '', '[]'::jsonb, TRUE) ON CONFLICT (phone) DO NOTHING`, [phone]);
  return getUser(phone);
}

async function updateUserField(phone, field, value) {
  const fieldMap = { nom: "nom", classe: "classe", reve: "reve", historique: "historique", reminders_enabled: "reminders_enabled" };
  const safeField = fieldMap[field];
  if (!safeField) throw new Error("Champ non autorisé");
  const query = `UPDATE conversations SET ${safeField} = $1, updated_at = NOW() WHERE phone = $2`;
  await pool.query(query, [value, phone]);
}

async function appendHistorique(phone, role, content) {
  const nouvelElement = { role, content: tronquerTexte(content, 2500), ts: new Date().toISOString() };
  await pool.query(`UPDATE conversations SET historique = (SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb) FROM (SELECT value, ord FROM jsonb_array_elements(COALESCE(historique, '[]'::jsonb) || $1::jsonb) WITH ORDINALITY AS arr(value, ord) ORDER BY ord DESC LIMIT 12) t), updated_at = NOW() WHERE phone = $2`, [JSON.stringify([nouvelElement]), phone]);
  const user = await getUser(phone);
  return Array.isArray(user?.historique) ? user.historique : safeJsonParse(user?.historique, []);
}

async function logUnansweredQuestion(user = {}, question = "", msgType = "text", reason = "") {
  try {
    if (!String(question || "").trim()) return;
    await pool.query(`INSERT INTO unanswered_questions (phone, question, msg_type, classe, nom, reason) VALUES ($1, $2, $3, $4, $5, $6)`, [user?.phone || "", tronquerTexte(question, 2000), msgType, user?.classe || "", user?.nom || "", reason || ""]);
  } catch (e) {
    logError("log_unanswered_question", e);
  }
}

async function getStudentAttempt(phone, sujet = "") {
  const { rows } = await pool.query(`SELECT * FROM student_attempts WHERE phone = $1 AND sujet = $2 ORDER BY updated_at DESC LIMIT 1`, [phone, sujet]);
  return rows[0] || null;
}

async function saveStudentAttempt(phone, sujet = "", question = "", lastUserAnswer = "") {
  const existing = await getStudentAttempt(phone, sujet);
  if (!existing) {
    await pool.query(`INSERT INTO student_attempts (phone, sujet, question, attempts_count, last_user_answer, updated_at) VALUES ($1, $2, $3, 1, $4, NOW())`, [phone, sujet, question, lastUserAnswer]);
    return 1;
  }
  const nextCount = Number(existing.attempts_count || 0) + 1;
  await pool.query(`UPDATE student_attempts SET attempts_count = $1, question = $2, last_user_answer = $3, updated_at = NOW() WHERE id = $4`, [nextCount, question, lastUserAnswer, existing.id]);
  return nextCount;
}

async function resetStudentAttempt(phone, sujet = "") {
  await pool.query(`DELETE FROM student_attempts WHERE phone = $1 AND sujet = $2`, [phone, sujet]);
}

async function resetAllStudentAttempts(phone) {
  await pool.query(`DELETE FROM student_attempts WHERE phone = $1`, [phone]);
}

/* =========================================================
   9) SÉCURITÉ WEBHOOK
========================================================= */
function verifierSignatureMeta(req) {
  try {
    const signature = req.get("x-hub-signature-256");
    if (!APP_SECRET || !signature || !req.rawBody) return false;
    const expectedSignature = "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  } catch {
    return false;
  }
}

function extraireMessageWhatsApp(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  if (!value || value.statuses?.length || !value.messages?.length) return null;
  return value.messages[0];
}

/* =========================================================
   10) WHATSAPP
========================================================= */
async function envoyerWhatsApp(to, texte) {
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", to, type: "text", text: { body: tronquerTexte(texte, 3900) } }, { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, timeout: 15000 });
  } catch (e) {
    logError("whatsapp_send", e, { to });
  }
}

async function envoyerIndicateurFrappe(messageId) {
  try {
    if (!messageId) return;
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, { messaging_product: "whatsapp", status: "read", message_id: messageId, typing_indicator: { type: "text" } }, { headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, timeout: 15000 });
  } catch (e) {
    logWarn("typing_indicator_error", { message: e?.message || "", data: e?.response?.data || null });
  }
}

async function recupererMetaMediaInfo(mediaId) {
  const r = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 15000 });
  return r.data || {};
}

async function telechargerMedia(mediaId, maxBytes = 8 * 1024 * 1024) {
  const mediaInfo = await recupererMetaMediaInfo(mediaId);
  const mediaUrl = mediaInfo?.url || null;
  if (!mediaUrl) throw new Error("URL média introuvable");
  const response = await axios.get(mediaUrl, { responseType: "arraybuffer", headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 30000, maxContentLength: maxBytes, maxBodyLength: maxBytes, validateStatus: (s) => s >= 200 && s < 300 });
  const contentType = String(response.headers["content-type"] || mediaInfo?.mime_type || "application/octet-stream").toLowerCase();
  const contentLength = Number(response.headers["content-length"] || response.data?.byteLength || 0);
  if (contentLength > maxBytes) throw new Error("Fichier trop volumineux");
  return { buffer: Buffer.from(response.data), mimeType: contentType };
}

/* =========================================================
   11) IA
========================================================= */
async function consulterBibliotheque(question = "", classe = "") {
  try {
    const termes = String(question || "").trim();
    if (!termes) return null;
    const motifClasse = `%${classe}%`;
    const { rows } = await pool.query(`SELECT id, titre, matiere, classe, mots_cles, contenu, commentaire_ai, source_type, source_url, provenance, created_at, updated_at, ts_rank(search_vector, plainto_tsquery('simple', unaccent($1))) AS score FROM bibliotheque WHERE search_vector @@ plainto_tsquery('simple', unaccent($1)) AND ($2 = '' OR unaccent(lower(coalesce(classe, ''))) LIKE unaccent(lower($3))) ORDER BY score DESC, updated_at DESC, id DESC LIMIT 1`, [termes, classe || "", motifClasse]);
    return rows[0] || null;
  } catch (e) {
    logError("consulter_bibliotheque", e);
    return null;
  }
}

function construireSystemPrompt(user) {
  const appelEleve = construireAppelNaturel(user);
  const classe = user?.classe ? `Classe de l'élève : ${user.classe}` : "Classe non précisée";
  const reve = user?.reve ? `Rêve de l'élève : ${user.reve}` : "Rêve non précisé";

  return `${SYSTEM_BASE}
${SYSTEM_TUTORAT}
${SYSTEM_JURIDIQUE_WEB}
${SYSTEM_GEO_WEB}
PERSONNALISATION :
- Adresse l'élève naturellement ainsi : ${appelEleve}
- N'utilise pas systématiquement "Ah, Prénom"
- N'utilise pas systématiquement "mon cher" ou "ma chère"
- Tu peux parfois ne pas mettre le prénom dans la première phrase
- ${classe}
- ${reve}

RÈGLE DE COHÉRENCE THÉMATIQUE :
- La CONSOLIDATION doit porter uniquement sur la question principale
- Interdiction totale de mélanger deux matières différentes dans une même consolidation
- Si la question porte sur le droit, la consolidation doit rester en droit
- Si la question porte sur la géographie, la consolidation doit rester en géographie
- Si la question porte sur l'histoire, la consolidation doit rester en histoire
- La citation finale doit rester dans la même matière que la question
- L'ouverture finale doit rester dans la même matière que la question
- Ne bascule jamais du droit vers la géographie, de l'histoire vers la géographie, ou d'une matière vers une autre, sauf si l'élève le demande

RÈGLE POUR LA CONSOLIDATION :
- Rédige EXACTEMENT une ou deux questions brèves qui testent la compréhension de la notion principale.
- Les questions doivent être directement liées à la question de l'élève, pas à la matière en général.
- Exemples acceptables : "Peux-tu m'expliquer avec tes mots pourquoi … ?", "Qu'arriverait-il si on changeait … ?", "Donne-moi un autre exemple qui illustre cette règle."
- Pas de QCM automatique, sauf si la question s'y prête naturellement (par exemple pour un choix entre deux concepts).
- Sois concis : maximum deux phrases pour l'ensemble du bloc.

INTERDICTION :
- Ne dis pas "mon élève"
- Ne donne pas une réponse froide de moteur de recherche
- Ne répète jamais le header Mwalimu
- Ne génère jamais une citation finale
- Ne génère jamais une deuxième ouverture finale
- Ne génère jamais un mot d'encouragement final`;
}

function toGeminiContents(messages = []) {
  return messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content) }] }));
}

async function appelerChatCompletion(messages) {
  const systemMessages = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const contents = toGeminiContents(messages);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: systemMessages, tools: [{ googleSearch: {} }] });
  const result = await genererAvecRetry(model, { contents, generationConfig: { temperature: 0.1 } });
  return result.response.text();
}

async function appelerJsonStrict({ systemInstruction = "", prompt = "", schema = null, history = [], inlineParts = [] }) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction });
  const result = await genererAvecRetry(model, { contents: [...toGeminiContents(history), { role: "user", parts: [{ text: prompt }, ...inlineParts] }], generationConfig: { temperature: 0, responseMimeType: "application/json", ...(schema ? { responseSchema: schema } : {}) } });
  return extraireJsonGemini(result.response.text());
}

async function chercherContexteWeb(question = "", user = {}, historique = []) {
  const system = construireSystemPrompt(user);
  const reponse = await safeAI(() => appelerChatCompletion([{ role: "system", content: system }, { role: "system", content: `MISSION WEB :\n- Utilise Google Search\n- Donne un CONTEXTE WEB BRUT, court, clair et factuel\n- Si la question concerne une province, une commune, une ville, un territoire ou une subdivision administrative, donne la liste complète trouvée\n- Pour une liste administrative, n'omets aucun élément trouvé\n- Si tu n'es pas sûr que la liste soit exhaustive, dis exactement : "Liste à confirmer"\n- Pas de structure VÉCU/SAVOIR/INSPIRATION/CONSOLIDATION\n- Pas de citation finale\n- Pas d'encouragement` }, ...historique.slice(-4), { role: "user", content: `QUESTION :\n${question}\nDonne un contexte web brut, précis et exhaustif si la question demande une liste.` }]), "");
  return String(reponse || "").trim();
}

async function detecterIntentionIA(user, texte = "", historique = []) {
  const system = `${construireSystemPrompt(user)}\nMODE CLASSIFICATION STRICTE :\n- Réponds uniquement en JSON valide\n- intention possible : salutation, remerciement, question_normale, exercice, soumission_reponse, audio, image, juridique, geographie_rdc\n- matiere possible : math, physique, chimie, general\n- besoinCorrectionRenforcee doit être true ou false\n- sujet doit être court`;
  const fallback = { intention: "question_normale", matiere: detecterMatiereScientifique(texte, "", null), besoinCorrectionRenforcee: false, sujet: extraireSujetMemoire(texte) || "general" };
  try {
    const parsed = await appelerJsonStrict({ systemInstruction: system, prompt: `Analyse ce message et classe-le.\n\nMESSAGE :\n${texte}`, schema: JSON_SCHEMA_INTENTION, history: historique.slice(-3) });
    if (!parsed || typeof parsed !== "object") return fallback;
    return { intention: String(parsed.intention || fallback.intention), matiere: String(parsed.matiere || fallback.matiere), besoinCorrectionRenforcee: Boolean(parsed.besoinCorrectionRenforcee), sujet: String(parsed.sujet || fallback.sujet) };
  } catch (e) {
    logError("detecter_intention_ia", e);
    return fallback;
  }
}

async function construireConsigneAntiBoucle(user, texteUtilisateur = "", historique = []) {
  const analyse = await detecterIntentionIA(user, texteUtilisateur, historique);
  const sujet = analyse.sujet || extraireSujetMemoire(texteUtilisateur) || "general";
  if (analyse.intention !== "soumission_reponse" && !estSoumissionReponse(texteUtilisateur)) {
    return { sujet, tentative: 0, consigne: "" };
  }
  const tentative = await saveStudentAttempt(user.phone, sujet, texteUtilisateur, texteUtilisateur);
  if (tentative < 3) return { sujet, tentative, consigne: "L'élève a proposé une réponse. Corrige avec douceur sans donner tout de suite la solution complète." };
  return { sujet, tentative, consigne: "L'élève s'est probablement trompé plusieurs fois. Simplifie davantage, découpe en très petites étapes et donne un indice plus fort." };
}

async function construireReponseDbWebIa(user, questionEleve, historique = [], fiche = null, consignePedagogique = "") {
  let contexteWeb = "";
  const utiliserWeb = fautChercherSurWeb(questionEleve, fiche);
  if (utiliserWeb) contexteWeb = await chercherContexteWeb(questionEleve, user, historique);
  const blocWeb = contexteWeb ? `CONTEXTE WEB (SOURCE PRINCIPALE) :\n${contexteWeb}` : `CONTEXTE WEB :\nAucune information web utile trouvée.`;
  const blocDB = fiche ? `CONTEXTE DB (SECONDAIRE) :\nTitre : ${fiche?.titre || "Sans titre"}\nMatière : ${fiche?.matiere || "Non précisée"}\nClasse : ${fiche?.classe || "Non précisée"}\nContenu :\n${fiche?.contenu || ""}\nCommentaire IA :\n${fiche?.commentaire_ai || ""}` : `CONTEXTE DB :\nAucune fiche locale disponible.`;

  return await safeAI(() => appelerChatCompletion([
    { role: "system", content: construireSystemPrompt(user) },
    { role: "system", content: `RÈGLE FONDAMENTALE :\n- Utilise d'abord le WEB si disponible\n- Utilise la DB comme appui\n- Ne réponds jamais comme un moteur de recherche\n- Si la question demande une liste administrative complète, recopie la liste complète trouvée\n- Si tu n'es pas sûr d'une liste complète, dis-le honnêtement\n- N'invente jamais un territoire, une commune, une ville ou un article\n- La matière de la CONSOLIDATION doit être strictement la même que celle de la question principale\n- La citation finale doit être strictement liée à la même matière\n- L'ouverture finale doit être strictement liée à la même matière\n- Interdiction de mélanger histoire, géographie, droit, sciences, mathématiques ou français dans la même consolidation` },
    { role: "system", content: consignePedagogique || "Sois pédagogique et clair." },
    ...historique.slice(-5),
    { role: "user", content: `QUESTION :\n${questionEleve}\n${blocWeb}\n${blocDB}\nDonne maintenant la réponse finale de Mwalimu.` }
  ]), `🔵 [VÉCU] : J'ai bien reçu ta demande.\n🟡 [SAVOIR] : Je n'ai pas encore pu produire une réponse claire.\n🔴 [INSPIRATION] : Ce n'est pas un problème ; nous pouvons reprendre plus simplement.\n❓ [CONSOLIDATION] : Reformule ta question en une seule phrase.`);
}

async function analyserAudioCourt(user, audioBuffer, mimeType, historique = []) {
  const systemInstruction = `${construireSystemPrompt(user)}\nMODE ANALYSE AUDIO COURT :\n- Ta mission est d'écouter l'audio et de répondre UNIQUEMENT en JSON valide\n- Détecte si l'audio est un simple message social ou non\n- "social" = merci, merci mwalimu, bonjour, bonsoir, salut, bonne nuit, bon apres-midi, bon après-midi, bonne journée, bon week-end, bon weekend, ok, okay, d'accord, dac, compris, oui, non, super, cool, ça va\n- "pedagogique" = vraie question, exercice, demande d'explication, correction, droit, géographie, maths, physique, chimie, etc.\n- Si l'audio est trop flou, mets "type":"incompris"\n- Réponds strictement en JSON`;
  try {
    const parsed = await appelerJsonStrict({ systemInstruction, prompt: "Analyse cet audio et renvoie uniquement le JSON demandé.", schema: JSON_SCHEMA_AUDIO, history: historique.slice(-2), inlineParts: [{ inlineData: { mimeType, data: audioBuffer.toString("base64") } }] });
    if (!parsed || typeof parsed !== "object") return { transcription: "", type: "incompris" };
    return { transcription: String(parsed.transcription || "").trim(), type: String(parsed.type || "incompris").trim().toLowerCase() };
  } catch (e) {
    logError("analyser_audio_court", e);
    return { transcription: "", type: "incompris" };
  }
}

async function reponseAudioUneSeulePasse(user, audioBuffer, mimeType, historique = [], fiche = null) {
  const blocDB = fiche ? `CONTEXTE DB :\nTitre : ${fiche?.titre || "Sans titre"}\nMatière : ${fiche?.matiere || "Non précisée"}\nClasse : ${fiche?.classe || "Non précisée"}\nContenu DB :\n${tronquerTexte(fiche?.contenu || "", 3000)}\nCommentaire IA :\n${tronquerTexte(fiche?.commentaire_ai || "Aucun commentaire IA.", 1200)}` : `CONTEXTE DB :\nAucune fiche locale fiable trouvée.`;

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: `${construireSystemPrompt(user)}\nMODE AUDIO :\n- Commence toujours par dire : "J'ai bien reçu ton audio." seulement si le message audio n'est pas juste un simple salut ou un simple remerciement\n- Si l'audio est seulement un bonjour, merci, bonne nuit, salut, ok, okay, d'accord, dac, compris, oui, non, super, cool, ça va, bonne journée, bon après-midi, bon week-end ou autre message social très court :\n  - réponds avec UNE seule phrase naturelle et courte\n  - sans structure pédagogique\n  - sans header\n  - sans citation\n  - sans encouragement\n  - sans VÉCU/SAVOIR/INSPIRATION/CONSOLIDATION\n- Si le sujet demande une liste complète, sois exhaustif\n- Sois succinct quand c'est possible\n- Ne génère jamais la citation finale\n- Ne génère jamais l'ouverture finale\n- Ne génère jamais le mot d'encouragement final`, tools: [{ googleSearch: {} }] });

  const formattedHistory = historique.slice(-4).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content) }] }));

  return await safeAI(async () => { const r = await genererAvecRetry(model, { contents: [...formattedHistory, { role: "user", parts: [{ text: `${blocDB}\nConsigne pédagogique :\n${construireConsignePedagogique("", "audio")}` }, { inlineData: { mimeType, data: audioBuffer.toString("base64") } }] }], generationConfig: { temperature: 0.2 } }); return r.response.text(); }, "");
}

async function expliquerImageAvecIA(user, base64Image, mimeType, historique = []) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", systemInstruction: `${construireSystemPrompt(user)}\nMODE IMAGE :\n- Commence toujours par dire : "J'ai bien reçu ton image."\n- Recopie ce qui est visible\n- Si une partie est floue, dis-le honnêtement\n- Sois succinct\n- Ne génère jamais la citation finale\n- Ne génère jamais l'ouverture finale\n- Ne génère jamais le mot d'encouragement final`, tools: [{ googleSearch: {} }] });

  const contents = [...historique.slice(-4).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content) }] })), { role: "user", parts: [{ text: "Analyse cette image. Commence par : J'ai bien reçu ton image. Puis recopie ce qui est visible et explique." }, { inlineData: { mimeType, data: base64Image } }] }];

  return await safeAI(async () => { const r = await genererAvecRetry(model, { contents, generationConfig: { temperature: 0.2 } }); return r.response.text(); }, "");
}

/* =========================================================
   CONSTRUCTION FINALE DU MESSAGE (AVEC CONCLUSION PROFESSIONNELLE)
========================================================= */
function construireMessageFinal(user, reponseBrute, historique = [], question = "", fiche = null) {
  const reponseNettoyee = nettoyerReponseIA(reponseBrute);
  const reponseSansAppelsLourds = supprimerFormulesLourdesDAppel(reponseNettoyee, user);

  const sortieScientifique = appliquerLes4EtapesScientifiques(reponseSansAppelsLourds, question, fiche);

  let corps = verifierStructureMwalimu(sortieScientifique.texte, user, historique, question);

  const sujetQuestion = extraireSujetMemoire(question);
  corps = remplacerBlocConsolidation(corps, question, sujetQuestion);

  corps = corps.replace(/^\s*\*\*\*«[^»]+»\*\*\*\s*$/gm, "");
  corps = corps.replace(/^🌟\s*Mot d['']encouragement\s*:.*$/gim, "");
  corps = corps.replace(/^👉\s*Je reste disponible.*$/gim, "");
  corps = corps.replace(/^👉\s*Continue à me parler.*$/gim, "");
  corps = corps.replace(/\n{3,}/g, "\n\n").trim();

  const citationUnique = choisirCitationFinale(question, corps);
  const ouverture = choisirOuvertureContextuelle(corps, user, question);
  const encouragement = !/🌟/.test(corps) ? choisirEncouragementContextuel(corps, question) : "";

  const parties = [HEADER_MWALIMU, "────────────────", corps, citationUnique, ouverture, encouragement].filter(part => part && part.trim() !== "");

  return dedupeBlocFinal(parties.join("\n"));
}

function messageSecours(user, msgType = "message") {
  const appel = construireAppel({ nom: user?.nom || "élève" });
  return `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : J'ai bien reçu ${messageTypeLisible(msgType)}, ${appel}.\n🟡 [SAVOIR] : Je rencontre un petit souci technique pour traiter ta demande correctement maintenant.\n🔴 [INSPIRATION] : Même quand cela bloque un peu, on peut reprendre avec calme et méthode.\n❓ [CONSOLIDATION] : Réessaie dans un instant, ou reformule ta question plus simplement.\n👉 Je reste à tes côtés.\n🌟 Mot d'encouragement : Nous pouvons reprendre calmement.\n${pick(CITATIONS.general)}`.replace(/\n{3,}/g, "\n\n").trim();
}

/* =========================================================
   12) CONSIGNES PÉDAGOGIQUES
========================================================= */
function construireConsignePedagogique(texte = "", type = "text") {
  const t = String(texte || "");
  if (type === "image") return `MODE IMAGE :\n- Commence par dire que tu as bien reçu l'image\n- Recopie d'abord ce qui est visible\n- Si une partie est floue, dis-le honnêtement\n- Explique la démarche\n- Ne résous pas tout à la place de l'élève\n- Sois bref et clair`;
  if (type === "audio") return `MODE AUDIO :\n- Si c'est un simple remerciement, une simple salutation ou un court message social, réponds en une phrase courte naturelle sans structure\n- Sinon, commence par dire que tu as bien reçu l'audio\n- Réponds avec chaleur et pédagogie\n- Sois bref et clair`;
  if (estSoumissionReponse(t)) return `MODE CORRECTION :\n- L'élève soumet probablement sa réponse\n- Corrige avec douceur\n- N'écris pas "bravo" sauf si la réponse est réellement correcte\n- Sois bref et clair`;
  if (estQuestionTechnique(t)) return `MODE EXERCICE :\n- Explique la méthode\n- Montre le démarrage utile\n- Ne donne pas toute la réponse finale d'un coup\n- Sois bref et clair`;
  return `MODE NORMAL :\n- Réponds naturellement\n- Sois humain, utile et succinct`;
}

/* =========================================================
   13) TRAITEMENT
========================================================= */

/**
 * ✅ NOUVEAU : Détecte si le message est une vraie question académique
 */
function estQuestionAcademique(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t || t.length < 10) return false;
  if (estMessagePurementSocial(texte)) return false;
  
  const motsAcademiques = [
    "explique", "c'est quoi", "qu'est-ce que", "comment", "pourquoi",
    "quand", "ou", "qui", "combien", "quelle", "quel", "quels", "quelles",
    "math", "maths", "equation", "calcul", "physique", "chimie",
    "histoire", "geographie", "francais", "grammaire", "conjugaison",
    "droit", "loi", "article", "constitution", "province", "territoire",
    "exercice", "probleme", "aide", "comprendre", "apprendre",
    "cours", "lecon", "chapitre", "matiere", "examen", "revision",
    "peux-tu", "peux tu", "dis-moi", "dis moi", "j'aimerais", "je voudrais",
    "explique-moi", "explique moi", "c'est quoi", "c quoi"
  ];
  
  return motsAcademiques.some(mot => t.includes(mot));
}

async function traiterTexte(user, texteUtilisateur, historique) {
  // 1. Deuxième tour de salutation
  if (estSecondTourSalutation(historique, texteUtilisateur)) {
    const reponse = genererRepriseApresBienEtre(user);
    return { reponse, fiche: null, bypassFormat: true };
  }

  // 2. Message social
  if (estMessagePurementSocial(texteUtilisateur)) {
    const reponseSimple = construireReponseHumaineSimple(user, texteUtilisateur);
    if (reponseSimple) {
      return { reponse: reponseSimple, fiche: null, bypassFormat: true };
    }
  }

  // ✅ 3. Si la conversation n'a pas encore démarré académiquement
  const conversationDemarree = historique.some(m => 
    m.role === "user" && estQuestionAcademique(m.content || "")
  );
  
  if (!conversationDemarree && !estQuestionAcademique(texteUtilisateur)) {
    const prenom = premierPrenom(user?.nom || "");
    const relances = [
      `Je suis là pour t'aider **${prenom}** 😊 Dis-moi, quelle matière ou quel exercice veux-tu travailler ?`,
      `N'hésite pas **${prenom}** ! Tu peux me parler de maths, physique, histoire, géographie, droit... Qu'est-ce qui t'intéresse ?`,
      `**${prenom}**, je suis prêt à t'expliquer ce que tu veux. Quelle notion veux-tu comprendre aujourd'hui ?`,
      `Alors **${prenom}**, par quoi veux-tu commencer ? Un exercice ? Une leçon ? Dis-moi ce qui te tient à cœur.`
    ];
    return { reponse: pick(relances), fiche: null, bypassFormat: true };
  }

  // 4. Suite normale
  const cacheKey = makeCacheKey(user, texteUtilisateur);
  const cached = getCache(cacheKey);
  if (cached) {
    logInfo("cache_hit", { phone: user?.phone || "", cacheKey });
    return { reponse: cached, fiche: null, bypassFormat: false };
  }

  let analyse = {
    intention: "question_normale",
    matiere: detecterMatiereScientifique(texteUtilisateur, "", null),
    besoinCorrectionRenforcee: false,
    sujet: extraireSujetMemoire(texteUtilisateur) || "general"
  };

  const texteMin = String(texteUtilisateur || "").toLowerCase();
  const besoinAnalyseIA =
    estSoumissionReponse(texteUtilisateur) ||
    estQuestionTechnique(texteUtilisateur) ||
    texteMin.includes("droit") ||
    texteMin.includes("loi") ||
    texteMin.includes("ohada") ||
    texteMin.includes("rdc") ||
    texteMin.includes("congo") ||
    texteMin.includes("géographie") ||
    texteMin.includes("geographie") ||
    texteMin.includes("territoire") ||
    texteMin.includes("territoires") ||
    texteMin.includes("commune") ||
    texteMin.includes("communes") ||
    texteMin.includes("ville") ||
    texteMin.includes("villes") ||
    texteMin.includes("province") ||
    texteMin.includes("histoire") ||
    texteMin.includes("indépendance") ||
    texteMin.includes("colonisation");

  if (besoinAnalyseIA) {
    analyse = await detecterIntentionIA(user, texteUtilisateur, historique);
  }

  const fiche = await consulterBibliotheque(texteUtilisateur, user.classe || "");
  const consigneBase = construireConsignePedagogique(texteUtilisateur, "text");
  const antiBoucle = await construireConsigneAntiBoucle(user, texteUtilisateur, historique);

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

async function traiterAudio(user, msg, historique) {
  const audioId = msg.audio?.id;
  if (!audioId) {
    return { reponse: "Je n'arrive pas à lire ton audio.", fiche: null, bypassFormat: true };
  }

  const { buffer, mimeType } = await telechargerMedia(audioId, 8 * 1024 * 1024);
  logInfo("audio_received", { phone: user?.phone || "", mimeType });

  if (!estMimeAudioSupporte(mimeType)) {
    return { reponse: "Format audio non supporté.", fiche: null, bypassFormat: true };
  }

  const analyse = await analyserAudioCourt(user, buffer, mimeType, historique);
  const transcriptionBrute = String(analyse?.transcription || "").trim();
  const transcription = normaliserTexteRelationnel(transcriptionBrute);
  const typeAudio = String(analyse?.type || "incompris").trim().toLowerCase();

  if (estSecondTourSalutation(historique, transcription || transcriptionBrute)) {
    const rep = genererRepriseApresBienEtre(user);
    return { reponse: rep, fiche: null, bypassFormat: true };
  }

  if (transcription && estMessagePurementSocial(transcription)) {
    const rep = construireReponseHumaineSimple(user, transcription);
    if (rep) return { reponse: rep, fiche: null, bypassFormat: true };
  }
  if (transcriptionBrute && estMessagePurementSocial(transcriptionBrute)) {
    const rep = construireReponseHumaineSimple(user, transcriptionBrute);
    if (rep) return { reponse: rep, fiche: null, bypassFormat: true };
  }

  const tMini = normaliserTexteRelationnel(transcriptionBrute);
  if (tMini && tMini.split(" ").length <= 5 && estMessagePurementSocial(tMini)) {
    return { reponse: construireReponseHumaineSimple(user, tMini) || "Je t'en prie 😊", fiche: null, bypassFormat: true };
  }

  if (typeAudio === "social") {
    return { reponse: construireReponseHumaineSimple(user, transcription || transcriptionBrute || "merci") || "Je t'en prie 😊", fiche: null, bypassFormat: true };
  }

  let reponse = await reponseAudioUneSeulePasse(user, buffer, mimeType, historique, null);
  const texteAudioNormalise = normaliserTexteRelationnel(reponse);

  if (texteAudioNormalise && estMessagePurementSocial(texteAudioNormalise)) {
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

async function traiterImage(user, msg, historique) {
  const imageId = msg.image?.id;
  if (!imageId) {
    return { reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.\n🟡 [SAVOIR] : Mais je n'arrive pas à l'ouvrir correctement.\n🔴 [INSPIRATION] : Nous allons y arriver.\n❓ [CONSOLIDATION] : Réessaie avec une image plus nette.`, fiche: null, bypassFormat: false };
  }

  const { buffer, mimeType } = await telechargerMedia(imageId, 8 * 1024 * 1024);
  logInfo("image_received", { phone: user?.phone || "", mimeType });

  if (!estMimeImageSupporte(mimeType)) {
    return { reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.\n🟡 [SAVOIR] : Le format d'image n'est pas encore supporté.\n🔴 [INSPIRATION] : Ce n'est pas grave.\n❓ [CONSOLIDATION] : Envoie-moi une image en JPG, JPEG, PNG, WEBP, GIF, BMP, HEIC ou HEIF.`, fiche: null, bypassFormat: false };
  }

  const base64Image = buffer.toString("base64");
  let reponse = await expliquerImageAvecIA(user, base64Image, mimeType, historique);

  if (!reponse || !String(reponse).trim()) {
    reponse = `🔵 [VÉCU] : J'ai bien reçu ton image.\n🟡 [SAVOIR] : Je n'arrive pas encore à l'analyser correctement.\n🔴 [INSPIRATION] : Nous pouvons reprendre calmement.\n❓ [CONSOLIDATION] : Envoie-moi une image plus nette ou mieux cadrée.`;
  }

  return { reponse, fiche: null, bypassFormat: false };
}

/* =========================================================
   14) COMMANDES
========================================================= */
async function traiterCommandeTexte(from, _user, texteUtilisateur) {
  const cmd = String(texteUtilisateur || "").trim().toLowerCase();

  if (cmd === "/aide") {
    await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n📘 *Commandes disponibles*\n/aide → voir les commandes\n/profil → refaire ton profil\n/reset → vider l'historique de l'échange\n/stop → arrêter les rappels du matin\n/start → réactiver les rappels du matin`);
    return true;
  }

  if (cmd === "/stop") {
    await updateUserField(from, "reminders_enabled", false);
    await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : J'ai bien reçu ta demande.\n🟡 [SAVOIR] : Les rappels du matin sont maintenant arrêtés.\n🔴 [INSPIRATION] : Tu gardes le contrôle de ton rythme.\n❓ [CONSOLIDATION] : Si tu veux les réactiver, envoie /start.`);
    return true;
  }

  if (cmd === "/start") {
    await updateUserField(from, "reminders_enabled", true);
    await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : J'ai bien reçu ta demande.\n🟡 [SAVOIR] : Les rappels du matin sont maintenant réactivés.\n🔴 [INSPIRATION] : Une bonne régularité aide à progresser.\n❓ [CONSOLIDATION] : Nous continuerons ensemble pas à pas.`);
    return true;
  }

  if (cmd === "/reset") {
    await updateUserField(from, "historique", JSON.stringify([]));
    await resetAllStudentAttempts(from);
    await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : J'ai bien reçu ta demande.\n🟡 [SAVOIR] : L'historique a été remis à zéro.\n🔴 [INSPIRATION] : Repartir proprement peut aider.\n❓ [CONSOLIDATION] : Envoie-moi maintenant la question ou l'exercice que tu veux reprendre.`);
    return true;
  }

  if (cmd === "/profil") {
    await pool.query("UPDATE conversations SET nom = '', classe = '', reve = '', historique = '[]'::jsonb, updated_at = NOW() WHERE phone = $1", [from]);
    await resetAllStudentAttempts(from);
    await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n────────────────\n🔄 *Mise à jour de ton profil*\n🟡 Quel est ton *prénom* ?`);
    return true;
  }

  return false;
}

/* =========================================================
   15) CRON
========================================================= */
cron.schedule("0 7 * * *", async () => {
  try {
    logInfo("cron_morning_reminder_start");
    const { rows } = await pool.query(`SELECT phone, nom FROM conversations WHERE coalesce(phone, '') <> '' AND coalesce(nom, '') <> '' AND coalesce(reminders_enabled, TRUE) = TRUE`);
    for (const eleve of rows) {
      try {
        const appel = `${genreEleve(eleve.nom)} **${premierPrenom(eleve.nom)}**`;
        const citation = pick(CITATIONS.patriotisme);
        const messageRappel = `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : Bonjour ${appel}.\n🟡 [SAVOIR] : Petit rappel du matin : avance aujourd'hui avec calme et sérieux.\n🔴 [INSPIRATION] : Ton objectif n'est pas d'aller vite, mais de bien comprendre.\n❓ [CONSOLIDATION] : Quelle matière veux-tu travailler aujourd'hui ?\n👉 Je reste à tes côtés.\n🌟 Mot d'encouragement : Un élève constant progresse.\n${citation}`.replace(/\n{3,}/g, "\n\n").trim();
        await envoyerWhatsApp(eleve.phone, messageRappel);
      } catch (e) {
        logError("cron_morning_reminder_user", e, { phone: eleve?.phone || "" });
      }
    }
    logInfo("cron_morning_reminder_done", { count: rows.length });
  } catch (e) {
    logError("cron_morning_reminder", e);
  }
}, { timezone: "Africa/Lubumbashi" });

cron.schedule("0 3 * * *", async () => {
  try {
    await pool.query("DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '2 days'");
    logInfo("cron_cleanup_processed_messages_done");
  } catch (e) {
    logError("cron_cleanup_processed_messages", e);
  }
}, { timezone: "Africa/Lubumbashi" });

/* =========================================================
   16) PIPELINE D'UN MESSAGE (HARMONISÉ)
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
    await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n────────────────\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.\n🟡 Quel est ton *prénom* ?`);
    return;
  }

  if (msgType === "text") {
    const commandeTraitee = await traiterCommandeTexte(from, user, texteUtilisateur);
    if (commandeTraitee) return;
  }

  if (!user.nom) {
    const nom = normaliserNom(nettoyer(texteUtilisateur));
    if (!nom) {
      await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n────────────────\n🟡 Donne-moi simplement ton *prénom*, s'il te plaît.`);
      return;
    }
    await updateUserField(from, "nom", nom);
    await envoyerWhatsApp(from, `🤝 Enchanté *${nom}* !\n🟡 En quelle *classe* es-tu ?`);
    return;
  }

  if (!user.classe) {
    const cl = normaliserNom(nettoyer(texteUtilisateur));
    if (!cl) {
      await envoyerWhatsApp(from, `🟡 Écris-moi ta *classe* simplement.\nExemple : 6e, 8e, Terminale, 1ère secondaire.`);
      return;
    }
    await updateUserField(from, "classe", cl);
    user = await getUser(from);
    await envoyerWhatsApp(from, `🟡 C'est bien noté, *${user.nom}*.\n❓ Quel est ton plus grand *rêve* professionnel ?`);
    return;
  }

  if (!user.reve) {
    const rv = normaliserNom(nettoyer(texteUtilisateur));
    if (!rv) {
      await envoyerWhatsApp(from, `❓ Dis-moi simplement ton *rêve* professionnel.\nExemple : avocat, médecin, ingénieur, pilote.`);
      return;
    }
    await updateUserField(from, "reve", rv);
    user = await getUser(from);
    await envoyerWhatsApp(from, `✨ *Quelle ambition magnifique !*\n🔴 Devenir *${rv}* est un rêve noble, et je sais que tu en es capable.\n🔵 *Pour commencer notre parcours ensemble, dis-moi :*\n👉 Quelle matière ou quel chapitre te pose problème en ce moment ?`);
    return;
  }

  let historique = Array.isArray(user.historique) ? user.historique : safeJsonParse(user.historique, []);

  let contenuUtilisateurPourMemoire = texteUtilisateur || `[message ${msgType}]`;

  if (msgType === "text" && texteUtilisateur) {
    await appendHistorique(from, "user", texteUtilisateur);
    const userFresh = await getUser(from);
    historique = Array.isArray(userFresh?.historique) ? userFresh.historique : safeJsonParse(userFresh?.historique, []);
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
  } else {
    reponseBrute = `🔵 [VÉCU] : J'ai bien reçu ton fichier.\n🟡 [SAVOIR] : Je ne peux pas encore analyser ce type de format pour le moment.\n🔴 [INSPIRATION] : Ce n'est pas grave, nous pouvons utiliser le texte ou les images.\n❓ [CONSOLIDATION] : Envoie-moi plutôt ton exercice par écrit ou sous forme de photo bien lisible.`;
    bypassFormat = false;
  }

  let messageFinal = "";

  if (bypassFormat) {
    messageFinal = reponseBrute;
  } else {
    messageFinal = construireMessageFinal({ ...user, phone: from }, reponseBrute, historique, texteUtilisateur || contenuUtilisateurPourMemoire, ficheContexte);
  }

  if (!messageFinal || !messageFinal.trim()) {
    messageFinal = messageSecours({ ...user, phone: from }, msgType);
  }

  await appendHistorique(from, "assistant", messageFinal);
  await envoyerWhatsApp(from, messageFinal);

  logInfo("message_processed_success", { phone: from, msgId, durationMs: nowMs() - startedAt });
}

/* =========================================================
   17) ENDPOINTS & WEBHOOKS
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
        await envoyerWhatsApp(from, fallback);
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
   18) INITIALISATION
========================================================= */
(async () => {
  logInfo("api_starting");
  await initDB();
  app.listen(PORT, () => {
    logInfo("server_listening", { port: PORT });
  });
})();







