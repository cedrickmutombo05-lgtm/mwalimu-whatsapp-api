

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
    "***« Aimer sa patrie, c’est la servir avec intelligence, honnêteté et discipline. »***",
    "***« Un bon élève d’aujourd’hui peut devenir un grand bâtisseur du Congo de demain. »***"
  ],
  geographie: [
    "***« Connaître son pays, c’est déjà commencer à mieux l’aimer. »***",
    "***« La géographie aide à mieux comprendre le monde et à mieux servir sa patrie. »***"
  ],
  mathematiques: [
    "***« La rigueur dans le calcul forme aussi la rigueur dans la vie. »***",
    "***« Un esprit qui raisonne bien peut mieux construire l’avenir. »***"
  ],
  histoire: [
    "***« Comprendre l’histoire aide à aimer sa patrie avec plus de conscience. »***",
    "***« Un peuple qui connaît son histoire prépare mieux son avenir. »***"
  ],
  francais: [
    "***« Bien parler et bien écrire donnent de la force à la pensée. »***",
    "***« La maîtrise des mots fortifie l’intelligence et la dignité. »***"
  ],
  sciences: [
    "***« La science bien apprise peut aider à résoudre les vrais problèmes du pays. »***",
    "***« Étudier les sciences, c’est se préparer à être utile à sa nation. »***"
  ],
  civisme: [
    "***« Le civisme commence par de petits actes honnêtes. »***",
    "***« Respecter la loi, c’est aussi participer à la vie de la nation. »***"
  ],
  relationnel: [
    "***« La politesse et le respect élèvent aussi la personne. »***",
    "***« Un cœur discipliné honore sa famille et sa patrie. »***"
  ],
  general: [
    "***« Apprendre avec sérieux aujourd’hui, c’est mieux servir le Congo demain. »***",
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
- N’invente jamais un chiffre, une unité ou une formule`;

const SYSTEM_BASE = `Tu es Mwalimu EdTech, un précepteur numérique congolais, humain, chaleureux, rigoureux, pédagogue et bienveillant.

MISSION :
- Aider l'élève à comprendre
- Guider sans faire le travail à sa place
- Expliquer comme un vrai précepteur
- Utiliser un ton humain, simple, motivant et respectueux
- Adapter le niveau à la classe de l'élève
- Te référer au contexte scolaire de la RDC lorsque c'est pertinent

MODE HUMAIN NATUREL :
- Avant de répondre, distingue toujours :
  1) échange humain simple
  2) réaction humaine ou doute
  3) vraie demande pédagogique
- Pour un échange humain simple, réponds comme une vraie personne : court, naturel, sans structure
- Pour une réaction comme "c'est faux", "je ne crois pas", "justifie", "explique mieux", réponds humainement d'abord, puis justifie ou corrige clairement
- N'utilise la structure 🔵🟡🔴❓ que si l'élève demande réellement une leçon, une explication scolaire ou un exercice
- Si l'élève exprime un doute, ne sois pas défensif : vérifie, explique et reconnais si une correction est possible

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
- N’invente jamais un article ou une source
- Si un article exact est trouvé de manière fiable, recopie-le d’abord puis commente brièvement
- Si le texte exact n’est pas certain, dis-le honnêtement`;

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
      if (entry.expiresAt <= now) this.store.delete(key);
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
    if (oldestKey) this.store.delete(oldestKey);
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
  const execution = previous.catch(() => {}).then(() => task());
  const tracked = execution.finally(() => {
    if (processingQueues.get(key) === tracked) processingQueues.delete(key);
  });
  processingQueues.set(key, tracked);
  return tracked;
}

/* =========================================================
   6) OUTILS SIMPLES + MODE HUMAIN
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
  return pick([prenom, `**${prenom}**`, ""]);
}

function construireAppel(user = {}) {
  return construireAppelNaturel(user);
}

function normaliserMessageCourt(texte = "") {
  return String(texte || "")
    .toLowerCase()
    .replace(/[.,!?;:()"'`´’]/g, " ")
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
    .replace(/[.,!?;:()"`'’´]/g, " ")
    .replace(/\bmwalimu\b/g, " ")
    .replace(/\bmon\s+cher\b/g, " ")
    .replace(/\bma\s+chere\b/g, " ")
    .replace(/\bcher\b/g, " ")
    .replace(/\bchere\b/g, " ")
    .replace(/\bs il te plait\b/g, " ")
    .replace(/\bsvp\b/g, " ")
    .replace(/\bstp\b/g, " ")
    .replace(/\beuh\b/g, " ")
    .replace(/\boh\b/g, "oh")
    .replace(/\bhum\b/g, "hum")
    .replace(/\bhein\b/g, "hein")
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

function estMessageSalutation(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  return (
    /^(bonjour|bonsoir|salut|hello|coucou|bjr|mbote|yo|cc|allô|allo)$/.test(t) ||
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

  return (
    t === "merci" ||
    t.includes("merci beaucoup") ||
    t.includes("grand merci") ||
    t.includes("merci infiniment") ||
    t.includes("merci encore") ||
    t.includes("merci bien") ||
    t.includes("merci pour tout") ||
    t.includes("merci pour ton aide") ||
    t.includes("merci pour votre aide") ||
    t.includes("merci pour l encouragement") ||
    t.includes("merci pour encouragement") ||
    t.includes("merci pour le conseil") ||
    t.includes("merci pour les conseils") ||
    t.includes("merci pour la correction") ||
    t.includes("merci pour l explication") ||
    t.includes("je te remercie") ||
    t.includes("je vous remercie") ||
    t.includes("c est gentil") ||
    t.includes("c est encourageant")
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
    "ca va merci",
    "bon",
    "hmm",
    "hum",
    "hein",
    "ah",
    "oh",
    "vraiment",
    "serieux",
    "serieusement"
  ].includes(t);
}

function estMessageConversationSimple(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  const expressions = [
    "ah", "oh", "hein", "hum", "hmm", "euh",
    "ok", "okay", "d accord", "oui", "non",
    "vraiment", "serieux", "serieusement",
    "c est faux", "ce est faux", "faux",
    "je ne crois pas", "je ne te crois pas",
    "tu es sur", "es tu sur", "tu es sure", "es tu sure",
    "peux tu justifier", "peux tu justifier ta reponse",
    "justifie ta reponse", "justifie", "justification",
    "pourquoi", "comment ca", "explique mieux",
    "je n ai pas compris", "pas compris",
    "c est bizarre", "ce n est pas clair",
    "reprends", "reexplique", "tu t es trompe", "tu as tort",
    "corrige", "verifie", "verifie encore"
  ];

  return expressions.some((e) => t === e || t.includes(e));
}

function estDemandeJustificationOuDoute(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  return (
    t.includes("c est faux") ||
    t === "faux" ||
    t.includes("je ne crois pas") ||
    t.includes("je ne te crois pas") ||
    t.includes("tu es sur") ||
    t.includes("es tu sur") ||
    t.includes("justifie") ||
    t.includes("justification") ||
    t.includes("peux tu justifier") ||
    t.includes("tu as tort") ||
    t.includes("tu t es trompe") ||
    t.includes("verifie") ||
    t.includes("corrige") ||
    t.includes("ce n est pas clair") ||
    t.includes("explique mieux") ||
    t.includes("pas compris") ||
    t.includes("reprends")
  );
}

function estMessageRelationnelSimple(texte = "") {
  return (
    estMessageSalutation(texte) ||
    estMessageRemerciement(texte) ||
    estMessageCourtHumain(texte) ||
    estMessageConversationSimple(texte)
  );
}

function estDemandePedagogiqueReelle(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  if (estMessageSalutation(texte)) return false;
  if (estMessageRemerciement(texte)) return false;
  if (estMessageCourtHumain(texte) && !estDemandeJustificationOuDoute(texte)) return false;

  if (estDemandeJustificationOuDoute(texte)) return false;

  const motsPedagogiques = [
    "explique", "definition", "définition", "c est quoi", "qu est ce que",
    "calcule", "calculer", "resous", "résous", "exercice", "corrige cet exercice",
    "droit", "histoire", "geographie", "géographie", "math", "maths",
    "physique", "chimie", "francais", "français", "grammaire", "conjugaison",
    "loi", "code", "article", "ohada", "territoire", "province", "commune",
    "ville", "fraction", "equation", "équation", "racine", "vitesse", "force"
  ];

  return motsPedagogiques.some((m) => t.includes(normaliserTexteRelationnel(m)));
}

function estReponseRelationnelleSimpleIA(texte = "") {
  const t = String(texte || "").trim();
  const n = normaliserMessageCourt(t);
  if (!t) return false;
  if (/🔵\s*\[VÉCU\]|🟡\s*\[SAVOIR\]|🔴\s*\[INSPIRATION\]|❓\s*\[CONSOLIDATION\]/i.test(t)) return false;
  if (t.length > 350) return false;
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
    n.startsWith("bon week end") ||
    n.startsWith("tu fais bien") ||
    n.startsWith("bonne reaction") ||
    n.startsWith("reprenons")
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
    for (const mot of motsQuestion) if (q.includes(mot)) scores[theme] += poidsQuestion;
    for (const mot of motsCorps) if (c.includes(mot)) scores[theme] += poidsCorps;
  };

  ajouter("droit",
    ["droit", "droit positif", "loi", "code", "article", "juridique", "tribunal", "ohada", "constitution"],
    ["droit", "loi", "code", "article", "juridique", "tribunal", "ohada", "constitution"]
  );

  ajouter("geographie",
    ["géographie", "geographie", "province", "territoire", "commune", "ville", "secteur", "chefferie", "subdivision administrative"],
    ["géographie", "geographie", "province", "territoire", "commune", "ville", "secteur", "chefferie"]
  );

  ajouter("histoire",
    ["histoire", "passé", "passe", "événement passé", "evenement passe", "colonisation", "indépendance", "independance", "royaume", "date historique"],
    ["histoire", "passé", "passe", "colonisation", "indépendance", "independance", "royaume", "date"]
  );

  ajouter("math",
    ["math", "maths", "équation", "equation", "fraction", "calcul", "racine", "puissance", "géométrie", "geometrie"],
    ["math", "maths", "équation", "equation", "fraction", "calcul", "racine", "puissance"]
  );

  ajouter("physique",
    ["physique", "force", "vitesse", "énergie", "energie", "masse", "pression", "mouvement"],
    ["physique", "force", "vitesse", "énergie", "energie", "masse", "pression", "mouvement"]
  );

  ajouter("chimie",
    ["chimie", "molécule", "molecule", "atome", "acide", "base", "solution", "réaction", "reaction"],
    ["chimie", "molécule", "molecule", "atome", "acide", "base", "solution", "réaction", "reaction"]
  );

  ajouter("francais",
    ["français", "francais", "grammaire", "orthographe", "conjugaison", "verbe", "phrase"],
    ["français", "francais", "grammaire", "orthographe", "conjugaison", "verbe", "phrase"]
  );

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

  if (estMessageRelationnelSimple(question) && !estDemandePedagogiqueReelle(question)) {
    return `🔵 [VÉCU] : Je te lis, ${prenom}.`;
  }

  if (sujetMemoire) {
    return pick([
      `🔵 [VÉCU] : D’accord ${prenom}, reprenons cela calmement.`,
      `🔵 [VÉCU] : Très bien ${prenom}, nous revenons sur ce point.`,
      `🔵 [VÉCU] : Allons-y doucement ${prenom}, reprenons ensemble.`
    ]);
  }

  if (matiere === "droit") {
    return pick([
      `🔵 [VÉCU] : D’accord ${prenom}, regardons cette notion de droit simplement.`,
      `🔵 [VÉCU] : Très bien ${prenom}, prenons cette question juridique pas à pas.`,
      `🔵 [VÉCU] : Voyons cela clairement ${prenom}.`
    ]);
  }

  if (matiere === "geographie") {
    return pick([
      `🔵 [VÉCU] : D’accord ${prenom}, regardons ce point de géographie calmement.`,
      `🔵 [VÉCU] : Très bien ${prenom}, prenons cela pas à pas.`,
      `🔵 [VÉCU] : Voyons cela simplement ${prenom}.`
    ]);
  }

  if (matiere === "histoire") {
    return pick([
      `🔵 [VÉCU] : D’accord ${prenom}, regardons cela comme un point d’histoire.`,
      `🔵 [VÉCU] : Très bien ${prenom}, prenons ce sujet d’histoire simplement.`,
      `🔵 [VÉCU] : Voyons cela calmement ${prenom}.`
    ]);
  }

  return pick([
    `🔵 [VÉCU] : D’accord ${prenom}, voyons cela simplement.`,
    `🔵 [VÉCU] : Très bien ${prenom}, prenons cette question pas à pas.`,
    `🔵 [VÉCU] : Je t’accompagne ${prenom}. Regardons l’idée essentielle.`,
    `🔵 [VÉCU] : Bien ${prenom}, allons à l’essentiel.`
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
  t = t.replace(/^\s*🌟\s*Mot d['’]encouragement\s*:\s*.*$/gim, "");
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

function choisirCitationContextuelle(reponse = "", question = "") {
  const matiere = detecterMatierePrincipale(question, reponse);

  if (estMessageRelationnelSimple(question) && !estDemandePedagogiqueReelle(question)) return "";

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
  const savoir = aSavoir ? "" : "🟡 [SAVOIR] : Voici l’idée essentielle à retenir.";
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

function construireQuestionsConsolidationCiblee(question = "", corps = "") {
  const q = String(question || "").trim().toLowerCase();
  const matiere = detecterMatierePrincipale(question, corps);

  if (q.includes("droit positif")) {
    return `1) Question de réflexion : pourquoi dit-on que le droit positif regroupe les règles effectivement en vigueur ?
2) Petite vérification rapide :
A. Le droit positif correspond aux règles applicables actuellement
B. Le droit positif correspond seulement à des règles idéales
👉 Choisis la bonne réponse.`;
  }

  if (matiere === "droit") {
    return `1) Question de réflexion : quelle idée principale retiens-tu sur cette notion juridique ?
2) Petite vérification rapide :
A. Une règle de droit doit être applicable
B. Une règle de droit peut rester floue sans importance
👉 Choisis la bonne réponse.`;
  }

  if (matiere === "geographie") {
    return `1) Question de réflexion : quel élément de géographie retiens-tu dans cette réponse ?
2) Petite vérification rapide :
A. Une subdivision administrative doit être exacte
B. Une subdivision administrative peut être approximative
👉 Choisis la bonne réponse.`;
  }

  if (matiere === "histoire") {
    return `1) Question de réflexion : pourquoi l’étude du passé aide-t-elle à mieux comprendre le présent ?
2) Petite vérification rapide :
A. L’histoire aide à comprendre l’évolution des sociétés
B. L’histoire ne sert qu’à mémoriser des dates
👉 Choisis la bonne réponse.`;
  }

  if (matiere === "math") {
    return `1) Question de réflexion : pourquoi faut-il suivre une méthode avant de donner le résultat ?
2) Petite vérification rapide :
A. La méthode aide à vérifier la réponse
B. Seule la réponse finale compte
👉 Choisis la bonne réponse.`;
  }

  if (matiere === "physique") {
    return `1) Question de réflexion : pourquoi les unités sont-elles importantes en physique ?
2) Petite vérification rapide :
A. Les unités aident à vérifier le raisonnement
B. Les unités ne sont pas importantes
👉 Choisis la bonne réponse.`;
  }

  if (matiere === "chimie") {
    return `1) Question de réflexion : pourquoi faut-il écrire correctement les symboles et formules en chimie ?
2) Petite vérification rapide :
A. Une formule chimique doit être exacte
B. Une formule chimique peut être approximative
👉 Choisis la bonne réponse.`;
  }

  if (matiere === "francais") {
    return `1) Question de réflexion : quelle règle de langue retiens-tu ici ?
2) Petite vérification rapide :
A. Il faut observer la règle avant d’écrire
B. La règle n’est pas importante
👉 Choisis la bonne réponse.`;
  }

  return `1) Question de réflexion : quelle idée principale retiens-tu ?
2) Petite vérification rapide :
A. Comprendre aide à mieux retenir
B. Répéter sans comprendre suffit toujours
👉 Choisis la bonne réponse.`;
}

function remplacerBlocConsolidation(corps = "", question = "") {
  let t = String(corps || "").trim();
  if (!t) return t;

  const bloc = `❓ [CONSOLIDATION]
${construireQuestionsConsolidationCiblee(question, t)}`;

  if (/❓\s*\[CONSOLIDATION\]/i.test(t)) {
    t = t.replace(
      /❓\s*\[CONSOLIDATION\][\s\S]*?(?=\n👉|\n🌟|\n\*\*\*«|$)/i,
      bloc
    );
  } else {
    t = `${t}\n\n${bloc}`;
  }

  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function choisirOuvertureContextuelle(reponse = "", _user = {}, question = "") {
  const matiere = detecterMatierePrincipale(question, reponse);
  const q = String(question || "").toLowerCase();

  if (estMessageRelationnelSimple(q) && !estDemandePedagogiqueReelle(q)) return "";

  if (matiere === "droit") return "👉 Si tu veux, nous pouvons revoir un autre terme juridique ensuite.";
  if (matiere === "geographie") return "👉 Si tu veux, nous pouvons continuer avec une autre petite question de géographie.";
  if (matiere === "histoire") return "👉 Si tu veux, nous pouvons prendre un autre point d’histoire ensuite.";

  if (matiere === "math" || matiere === "physique" || matiere === "chimie") {
    return "👉 Essaie maintenant de reformuler l’idée ou de faire une étape, puis envoie-moi ta réponse.";
  }

  return "👉 Dis-moi maintenant ce que tu retiens en une phrase simple.";
}

function choisirEncouragementContextuel(reponse = "", question = "") {
  const corps = String(reponse || "").toLowerCase();
  const q = String(question || "").toLowerCase();

  if (estMessageRelationnelSimple(question) && !estDemandePedagogiqueReelle(question)) return "";

  if (
    corps.includes("je n'arrive pas encore") ||
    corps.includes("petit souci technique") ||
    corps.includes("réessaie") ||
    corps.includes("image plus nette") ||
    corps.includes("message vocal plus clair")
  ) {
    return "🌟 Mot d'encouragement : Ne te décourage pas ; nous pouvons reprendre calmement.";
  }

  const vraieReussite =
    q.includes("voici ma réponse") ||
    q.includes("ma réponse") ||
    q.includes("j'ai trouvé") ||
    q.includes("j'ai obtenu") ||
    q.includes("cela donne") ||
    q.includes("ça donne") ||
    q.includes("j'obtiens");

  if (
    vraieReussite &&
    (corps.includes("bonne réponse") || corps.includes("réponse correcte") || corps.includes("exact") || corps.includes("juste"))
  ) {
    return "🌟 Mot d'encouragement : Bon travail ; continue avec cette rigueur.";
  }

  if (corps.includes("méthode") || corps.includes("explication") || corps.includes("à retenir")) {
    return "🌟 Mot d'encouragement : Relis doucement ; une idée bien comprise reste mieux.";
  }

  return "🌟 Mot d'encouragement : Avance pas à pas ; comprendre calmement vaut mieux que se précipiter.";
}

function construireReponseHumaineSimple(user = {}, texte = "") {
  const prenom = premierPrenom(user?.nom || "élève");
  const appel = pick([prenom, `**${prenom}**`, ""]);
  const t = normaliserTexteRelationnel(texte);

  if (estMessageRemerciement(t)) {
    return pick([
      `Je t’en prie ${appel} 😊`.trim(),
      `Avec plaisir ${appel} 😊`.trim(),
      `C’est normal ${appel}. Continue doucement, tu progresses.`.trim(),
      `Toujours là pour t’accompagner ${appel} 💪`.trim(),
      `Avec joie ${appel}. Garde ce bon état d’esprit.`.trim(),
      `C’est gentil ${appel}. On avance ensemble.`.trim()
    ]);
  }

  if (estMessageSalutation(t)) {
    if (t.includes("bonsoir")) return `Bonne soirée ${appel} 🌙`.trim();
    if (t.includes("bonne nuit")) return `Bonne nuit ${appel} 🌙`.trim();
    if (t.includes("journee")) return `Bonne journée ${appel} 😊`.trim();
    if (t.includes("matinee")) return `Bonne matinée ${appel} 😊`.trim();
    if (t.includes("apres midi")) return `Bon après-midi ${appel} 😊`.trim();
    if (t.includes("week end") || t.includes("weekend")) return `Bon week-end ${appel} 😄`.trim();
    if (t.includes("a demain")) return `À demain ${appel} 👋`.trim();
    return pick([
      `Oui, je suis là ${appel} 😊`.trim(),
      `Bonjour ${appel} 😊`.trim(),
      `Salut ${appel} 👋`.trim(),
      `Mbote ${appel} 😊`.trim(),
      `Heureux de te lire ${appel}.`.trim()
    ]);
  }

  if (estDemandeJustificationOuDoute(t)) {
    if (t.includes("faux") || t.includes("tu as tort") || t.includes("tu t es trompe")) {
      return pick([
        `Tu as peut-être raison ${appel}. Vérifions ensemble calmement.`.trim(),
        `D’accord ${appel}, reprenons étape par étape.`.trim(),
        `Bien vu ${appel}. Vérifions le raisonnement.`.trim()
      ]);
    }

    if (t.includes("je ne crois pas") || t.includes("tu es sur") || t.includes("es tu sur")) {
      return pick([
        `Bonne réaction ${appel}. Une réponse doit pouvoir être justifiée.`.trim(),
        `Tu fais bien de douter ${appel}. Reprenons calmement.`.trim(),
        `D’accord ${appel}, vérifions cela avec plus de précision.`.trim()
      ]);
    }

    if (t.includes("justifie") || t.includes("justification")) {
      return pick([
        `Très bien ${appel}, je vais expliquer pourquoi.`.trim(),
        `Bonne demande ${appel}, une réponse doit être justifiée.`.trim(),
        `Exact ${appel}, reprenons la logique clairement.`.trim()
      ]);
    }

    if (t.includes("pas compris") || t.includes("explique") || t.includes("reprends") || t.includes("ce n est pas clair")) {
      return pick([
        `Pas de souci ${appel}, je simplifie.`.trim(),
        `D’accord ${appel}, reprenons doucement.`.trim(),
        `Très bien ${appel}, on va clarifier.`.trim()
      ]);
    }
  }

  if (estMessageCourtHumain(t) || estMessageConversationSimple(t)) {
    return pick([
      `D’accord ${appel} 👍`.trim(),
      `Très bien ${appel}.`.trim(),
      `Je comprends ${appel}.`.trim(),
      `Oui, je vois ${appel}.`.trim(),
      `Prenons cela calmement ${appel}.`.trim()
    ]);
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
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "image/gif", "image/bmp", "image/heic", "image/heif"
  ];
  return allowed.includes(String(mimeType || "").toLowerCase());
}

function estMimeAudioSupporte(mimeType = "") {
  const allowed = [
    "audio/ogg", "audio/opus", "audio/mpeg", "audio/mp3",
    "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm",
    "audio/aac", "audio/amr"
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
  if (estMessageRelationnelSimple(q) && !estDemandePedagogiqueReelle(q)) return false;

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
      if (resultat[resultat.length - 1] !== "") resultat.push("");
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
  await pool.query(`
    ALTER TABLE bibliotheque
    ADD COLUMN IF NOT EXISTS search_vector tsvector;
  `);

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

  await pool.query(`
    DROP TRIGGER IF EXISTS trg_bibliotheque_search_vector_update ON bibliotheque;
  `);

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

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bibliotheque_search_vector
    ON bibliotheque
    USING GIN (search_vector);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_bibliotheque_updated_at
    ON bibliotheque (updated_at DESC);
  `);
}

async function initDB() {
  try {
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
        source_type TEXT DEFAULT 'db',
        source_url TEXT DEFAULT '',
        provenance TEXT DEFAULT '',
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

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_processed_messages_created_at
      ON processed_messages (created_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_unanswered_questions_created_at
      ON unanswered_questions (created_at DESC);
    `);

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_student_attempts_phone_sujet_updated
      ON student_attempts (phone, sujet, updated_at DESC);
    `);

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
  await pool.query(
    `INSERT INTO conversations (phone, nom, classe, reve, historique, reminders_enabled)
     VALUES ($1, '', '', '', '[]'::jsonb, TRUE)
     ON CONFLICT (phone) DO NOTHING`,
    [phone]
  );
  return getUser(phone);
}

async function updateUserField(phone, field, value) {
  const fieldMap = {
    nom: "nom",
    classe: "classe",
    reve: "reve",
    historique: "historique",
    reminders_enabled: "reminders_enabled"
  };

  const safeField = fieldMap[field];
  if (!safeField) throw new Error("Champ non autorisé");

  const query = `UPDATE conversations SET ${safeField} = $1, updated_at = NOW() WHERE phone = $2`;
  await pool.query(query, [value, phone]);
}

async function appendHistorique(phone, role, content) {
  const nouvelElement = {
    role,
    content: tronquerTexte(content, 2500),
    ts: new Date().toISOString()
  };

  await pool.query(
    `
    UPDATE conversations
    SET historique = (
      SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb)
      FROM (
        SELECT value, ord
        FROM jsonb_array_elements(
          COALESCE(historique, '[]'::jsonb) || $1::jsonb
        ) WITH ORDINALITY AS arr(value, ord)
        ORDER BY ord DESC
        LIMIT 12
      ) t
    ),
    updated_at = NOW()
    WHERE phone = $2
    `,
    [JSON.stringify([nouvelElement]), phone]
  );

  const user = await getUser(phone);
  return Array.isArray(user?.historique) ? user.historique : safeJsonParse(user?.historique, []);
}

async function logUnansweredQuestion(user = {}, question = "", msgType = "text", reason = "") {
  try {
    if (!String(question || "").trim()) return;
    await pool.query(
      `INSERT INTO unanswered_questions (phone, question, msg_type, classe, nom, reason)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user?.phone || "",
        tronquerTexte(question, 2000),
        msgType,
        user?.classe || "",
        user?.nom || "",
        reason || ""
      ]
    );
  } catch (e) {
    logError("log_unanswered_question", e);
  }
}

async function getStudentAttempt(phone, sujet = "") {
  const { rows } = await pool.query(
    `SELECT * FROM student_attempts
     WHERE phone = $1 AND sujet = $2
     ORDER BY updated_at DESC
     LIMIT 1`,
    [phone, sujet]
  );
  return rows[0] || null;
}

async function saveStudentAttempt(phone, sujet = "", question = "", lastUserAnswer = "") {
  const existing = await getStudentAttempt(phone, sujet);

  if (!existing) {
    await pool.query(
      `INSERT INTO student_attempts (phone, sujet, question, attempts_count, last_user_answer, updated_at)
       VALUES ($1, $2, $3, 1, $4, NOW())`,
      [phone, sujet, question, lastUserAnswer]
    );
    return 1;
  }

  const nextCount = Number(existing.attempts_count || 0) + 1;

  await pool.query(
    `UPDATE student_attempts
     SET attempts_count = $1,
         question = $2,
         last_user_answer = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [nextCount, question, lastUserAnswer, existing.id]
  );

  return nextCount;
}

async function resetStudentAttempt(phone, sujet = "") {
  await pool.query(
    `DELETE FROM student_attempts WHERE phone = $1 AND sujet = $2`,
    [phone, sujet]
  );
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

    const expectedSignature =
      "sha256=" +
      crypto.createHmac("sha256", APP_SECRET).update(req.rawBody).digest("hex");

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
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: tronquerTexte(texte, 3900) }
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );
  } catch (e) {
    logError("whatsapp_send", e, { to });
  }
}

async function envoyerIndicateurFrappe(messageId) {
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
        },
        timeout: 15000
      }
    );
  } catch (e) {
    logWarn("typing_indicator_error", {
      message: e?.message || "",
      data: e?.response?.data || null
    });
  }
}

async function recupererMetaMediaInfo(mediaId) {
  const r = await axios.get(
    `https://graph.facebook.com/v18.0/${mediaId}`,
    {
      headers: { Authorization: `Bearer ${TOKEN}` },
      timeout: 15000
    }
  );
  return r.data || {};
}

async function telechargerMedia(mediaId, maxBytes = 8 * 1024 * 1024) {
  const mediaInfo = await recupererMetaMediaInfo(mediaId);
  const mediaUrl = mediaInfo?.url || null;
  if (!mediaUrl) throw new Error("URL média introuvable");

  const response = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 30000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    validateStatus: (s) => s >= 200 && s < 300
  });

  const contentType = String(
    response.headers["content-type"] || mediaInfo?.mime_type || "application/octet-stream"
  ).toLowerCase();

  const contentLength = Number(response.headers["content-length"] || response.data?.byteLength || 0);
  if (contentLength > maxBytes) throw new Error("Fichier trop volumineux");

  return {
    buffer: Buffer.from(response.data),
    mimeType: contentType
  };
}

/* =========================================================
   11) IA
========================================================= */
async function consulterBibliotheque(question = "", classe = "") {
  try {
    const termes = String(question || "").trim();
    if (!termes) return null;

    const q = `
      SELECT
        id, titre, matiere, classe, mots_cles, contenu, commentaire_ai,
        source_type, source_url, provenance, created_at, updated_at,
        ts_rank(search_vector, plainto_tsquery('simple', unaccent($1))) AS score
      FROM bibliotheque
      WHERE
        search_vector @@ plainto_tsquery('simple', unaccent($1))
        AND ($2 = '' OR unaccent(lower(coalesce(classe, ''))) LIKE unaccent(lower($3)))
      ORDER BY score DESC, updated_at DESC, id DESC
      LIMIT 1
    `;

    const motifClasse = `%${classe}%`;
    const { rows } = await pool.query(q, [termes, classe || "", motifClasse]);
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
- Si la question porte sur l’histoire, la consolidation doit rester en histoire
- La citation finale doit rester dans la même matière que la question
- L’ouverture finale doit rester dans la même matière que la question
- Ne bascule jamais du droit vers la géographie, de l’histoire vers la géographie, ou d’une matière vers une autre, sauf si l’élève le demande

INTERDICTION :
- Ne dis pas "mon élève"
- Ne donne pas une réponse froide de moteur de recherche
- Ne répète jamais le header Mwalimu
- Ne génère jamais une citation finale
- Ne génère jamais une deuxième ouverture finale
- Ne génère jamais un mot d'encouragement final`;
}

function toGeminiContents(messages = []) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content) }]
    }));
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

async function appelerJsonStrict({
  systemInstruction = "",
  prompt = "",
  schema = null,
  history = [],
  inlineParts = []
}) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction
  });

  const result = await genererAvecRetry(model, {
    contents: [
      ...toGeminiContents(history),
      {
        role: "user",
        parts: [
          { text: prompt },
          ...inlineParts
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      ...(schema ? { responseSchema: schema } : {})
    }
  });

  return extraireJsonGemini(result.response.text());
}

async function chercherContexteWeb(question = "", user = {}, historique = []) {
  const system = construireSystemPrompt(user);

  const reponse = await safeAI(
    () => appelerChatCompletion([
      { role: "system", content: system },
      {
        role: "system",
        content: `MISSION WEB :
- Utilise Google Search
- Donne un CONTEXTE WEB BRUT, court, clair et factuel
- Si la question concerne une province, une commune, une ville, un territoire ou une subdivision administrative, donne la liste complète trouvée
- Pour une liste administrative, n'omets aucun élément trouvé
- Si tu n'es pas sûr que la liste soit exhaustive, dis exactement : "Liste à confirmer"
- Pas de structure VÉCU/SAVOIR/INSPIRATION/CONSOLIDATION
- Pas de citation finale
- Pas d'encouragement`
      },
      ...historique.slice(-4),
      {
        role: "user",
        content: `QUESTION :
${question}
Donne un contexte web brut, précis et exhaustif si la question demande une liste.`
      }
    ]),
    ""
  );

  return String(reponse || "").trim();
}

async function detecterIntentionIA(user, texte = "", historique = []) {
  const system = `${construireSystemPrompt(user)}
MODE CLASSIFICATION STRICTE :
- Réponds uniquement en JSON valide
- intention possible : salutation, remerciement, conversation_simple, doute_justification, question_normale, exercice, soumission_reponse, audio, image, juridique, geographie_rdc
- matiere possible : math, physique, chimie, general
- besoinCorrectionRenforcee doit être true ou false
- sujet doit être court`;

  const fallback = {
    intention: estDemandeJustificationOuDoute(texte) ? "doute_justification" : "question_normale",
    matiere: detecterMatiereScientifique(texte, "", null),
    besoinCorrectionRenforcee: false,
    sujet: extraireSujetMemoire(texte) || "general"
  };

  try {
    const parsed = await appelerJsonStrict({
      systemInstruction: system,
      prompt: `Analyse ce message et classe-le.\n\nMESSAGE :\n${texte}`,
      schema: JSON_SCHEMA_INTENTION,
      history: historique.slice(-3)
    });

    if (!parsed || typeof parsed !== "object") return fallback;

    return {
      intention: String(parsed.intention || fallback.intention),
      matiere: String(parsed.matiere || fallback.matiere),
      besoinCorrectionRenforcee: Boolean(parsed.besoinCorrectionRenforcee),
      sujet: String(parsed.sujet || fallback.sujet)
    };
  } catch (e) {
    logError("detecter_intention_ia", e);
    return fallback;
  }
}

async function construireReponseConversationnelleIA(user, texteUtilisateur = "", historique = []) {
  const intro = construireReponseHumaineSimple(user, texteUtilisateur);
  const system = `${construireSystemPrompt(user)}
MODE CONVERSATION HUMAINE :
- Réponds sans header Mwalimu
- N'utilise pas la structure 🔵🟡🔴❓
- Réponds comme une personne calme, claire et honnête
- Si l'élève dit que c'est faux, vérifie et explique sans te défendre
- Si l'élève demande une justification, justifie brièvement avec logique
- Si le contexte précédent manque, demande la précision avec naturel
- Ne génère pas de citation finale
- Ne génère pas de mot d'encouragement final
- Maximum 8 lignes`;

  const reponse = await safeAI(
    () => appelerChatCompletion([
      { role: "system", content: system },
      ...historique.slice(-6),
      {
        role: "user",
        content: `Message de l'élève :
${texteUtilisateur}

Réponds humainement. Commence naturellement, puis justifie ou clarifie si nécessaire.
${intro ? `Idée de ton d'ouverture : ${intro}` : ""}`
      }
    ]),
    intro || "D’accord, reprenons calmement."
  );

  return nettoyerReponseIA(reponse);
}

async function construireConsigneAntiBoucle(user, texteUtilisateur = "", historique = []) {
  const analyse = await detecterIntentionIA(user, texteUtilisateur, historique);
  const sujet = analyse.sujet || extraireSujetMemoire(texteUtilisateur) || "general";

  if (analyse.intention !== "soumission_reponse" && !estSoumissionReponse(texteUtilisateur)) {
    return { sujet, tentative: 0, consigne: "" };
  }

  const tentative = await saveStudentAttempt(user.phone, sujet, texteUtilisateur, texteUtilisateur);

  if (tentative < 3) {
    return {
      sujet,
      tentative,
      consigne: "L'élève a proposé une réponse. Corrige avec douceur sans donner tout de suite la solution complète."
    };
  }

  return {
    sujet,
    tentative,
    consigne: "L'élève s'est probablement trompé plusieurs fois. Simplifie davantage, découpe en très petites étapes et donne un indice plus fort."
  };
}

async function construireReponseDbWebIa(user, questionEleve, historique = [], fiche = null, consignePedagogique = "") {
  let contexteWeb = "";
  const utiliserWeb = fautChercherSurWeb(questionEleve, fiche);

  if (utiliserWeb) {
    contexteWeb = await chercherContexteWeb(questionEleve, user, historique);
  }

  const blocWeb = contexteWeb
    ? `CONTEXTE WEB (SOURCE PRINCIPALE) :
${contexteWeb}`
    : `CONTEXTE WEB :
Aucune information web utile trouvée.`;

  const blocDB = fiche
    ? `CONTEXTE DB (SECONDAIRE) :
Titre : ${fiche?.titre || "Sans titre"}
Matière : ${fiche?.matiere || "Non précisée"}
Classe : ${fiche?.classe || "Non précisée"}
Contenu :
${fiche?.contenu || ""}
Commentaire IA :
${fiche?.commentaire_ai || ""}`
    : `CONTEXTE DB :
Aucune fiche locale disponible.`;

  return await safeAI(
    () => appelerChatCompletion([
      { role: "system", content: construireSystemPrompt(user) },
      {
        role: "system",
        content: `RÈGLE FONDAMENTALE :
- Utilise d'abord le WEB si disponible
- Utilise la DB comme appui
- Ne réponds jamais comme un moteur de recherche
- Si la question demande une liste administrative complète, recopie la liste complète trouvée
- Si tu n'es pas sûr d'une liste complète, dis-le honnêtement
- N'invente jamais un territoire, une commune, une ville ou un article
- La matière de la CONSOLIDATION doit être strictement la même que celle de la question principale
- La citation finale doit être strictement liée à la même matière
- L’ouverture finale doit être strictement liée à la même matière
- Interdiction de mélanger histoire, géographie, droit, sciences, mathématiques ou français dans la même consolidation`
      },
      { role: "system", content: consignePedagogique || "Sois pédagogique et clair." },
      ...historique.slice(-5),
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
🔴 [INSPIRATION] : Ce n’est pas un problème ; nous pouvons reprendre plus simplement.
❓ [CONSOLIDATION] : Reformule ta question en une seule phrase.`
  );
}

async function analyserAudioCourt(user, audioBuffer, mimeType, historique = []) {
  const systemInstruction = `${construireSystemPrompt(user)}
MODE ANALYSE AUDIO COURT :
- Ta mission est d'écouter l'audio et de répondre UNIQUEMENT en JSON valide
- Détecte si l'audio est un simple message social, une réaction humaine, un doute ou une vraie demande pédagogique
- "social" = merci, merci mwalimu, bonjour, bonsoir, salut, bonne nuit, bon après-midi, bonne journée, bon week-end, ok, d'accord, compris, oui, non, super, cool, ça va
- "conversation" = allô, ah, oh, hein, c'est faux, je ne crois pas, justifie, explique mieux, je n'ai pas compris, tu es sûr, vérifie
- "pedagogique" = vraie question, exercice, demande d'explication scolaire, correction, droit, géographie, histoire, maths, physique, chimie, etc.
- Si l'audio est trop flou, mets "type":"incompris"
- Réponds strictement en JSON`;

  try {
    const parsed = await appelerJsonStrict({
      systemInstruction,
      prompt: "Analyse cet audio et renvoie uniquement le JSON demandé.",
      schema: JSON_SCHEMA_AUDIO,
      history: historique.slice(-2),
      inlineParts: [
        { inlineData: { mimeType, data: audioBuffer.toString("base64") } }
      ]
    });

    if (!parsed || typeof parsed !== "object") return { transcription: "", type: "incompris" };

    return {
      transcription: String(parsed.transcription || "").trim(),
      type: String(parsed.type || "incompris").trim().toLowerCase()
    };
  } catch (e) {
    logError("analyser_audio_court", e);
    return { transcription: "", type: "incompris" };
  }
}

async function reponseAudioUneSeulePasse(user, audioBuffer, mimeType, historique = [], fiche = null) {
  const blocDB = fiche
    ? `CONTEXTE DB :
Titre : ${fiche?.titre || "Sans titre"}
Matière : ${fiche?.matiere || "Non précisée"}
Classe : ${fiche?.classe || "Non précisée"}
Contenu DB :
${tronquerTexte(fiche?.contenu || "", 3000)}
Commentaire IA :
${tronquerTexte(fiche?.commentaire_ai || "Aucun commentaire IA.", 1200)}`
    : `CONTEXTE DB :
Aucune fiche locale fiable trouvée.`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${construireSystemPrompt(user)}
MODE AUDIO :
- Commence toujours par dire : "J'ai bien reçu ton audio." seulement si le message audio n'est pas juste un simple salut ou un simple remerciement
- Si l'audio est seulement un message social ou conversationnel très court, réponds avec UNE seule phrase naturelle et courte
- Sans structure pédagogique pour les messages sociaux
- Si le sujet demande une liste complète, sois exhaustif
- Sois succinct quand c'est possible
- Ne génère jamais la citation finale
- Ne génère jamais l’ouverture finale
- Ne génère jamais le mot d’encouragement final`,
    tools: [{ googleSearch: {} }]
  });

  const formattedHistory = historique.slice(-4).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content) }]
  }));

  return await safeAI(
    async () => {
      const r = await genererAvecRetry(model, {
        contents: [
          ...formattedHistory,
          {
            role: "user",
            parts: [
              { text: `${blocDB}\nConsigne pédagogique :\n${construireConsignePedagogique("", "audio")}` },
              { inlineData: { mimeType, data: audioBuffer.toString("base64") } }
            ]
          }
        ],
        generationConfig: { temperature: 0.2 }
      });
      return r.response.text();
    },
    ""
  );
}

async function expliquerImageAvecIA(user, base64Image, mimeType, historique = []) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${construireSystemPrompt(user)}
MODE IMAGE :
- Commence toujours par dire : "J'ai bien reçu ton image."
- Recopie ce qui est visible
- Si une partie est floue, dis-le honnêtement
- Sois succinct
- Ne génère jamais la citation finale
- Ne génère jamais l’ouverture finale
- Ne génère jamais le mot d’encouragement final`,
    tools: [{ googleSearch: {} }]
  });

  const contents = [
    ...historique.slice(-4).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content) }]
    })),
    {
      role: "user",
      parts: [
        { text: "Analyse cette image. Commence par : J'ai bien reçu ton image. Puis recopie ce qui est visible et explique." },
        { inlineData: { mimeType, data: base64Image } }
      ]
    }
  ];

  return await safeAI(
    async () => {
      const r = await genererAvecRetry(model, {
        contents,
        generationConfig: { temperature: 0.2 }
      });
      return r.response.text();
    },
    ""
  );
}

function construireMessageFinal(user, reponseBrute, historique = [], question = "", fiche = null) {
  const reponseNettoyee = nettoyerReponseIA(reponseBrute);
  const reponseSansAppelsLourds = supprimerFormulesLourdesDAppel(reponseNettoyee, user);

  const sortieScientifique = appliquerLes4EtapesScientifiques(
    reponseSansAppelsLourds,
    question,
    fiche
  );

  const corpsAvecStructure = verifierStructureMwalimu(
    sortieScientifique.texte,
    user,
    historique,
    question
  );

  const corpsConsolide = remplacerBlocConsolidation(corpsAvecStructure, question);

  let corps = adapterTexteGenre(corpsConsolide, user.nom);
  corps = nettoyerAppelsRepetitifs(corps, user.nom);
  corps = nettoyerOuverturesDupliquees(corps);
  corps = supprimerDoublonsLignes(corps);

  const ouverture = adapterTexteGenre(
    choisirOuvertureContextuelle(corps, user, question),
    user.nom
  );

  const encouragement = choisirEncouragementContextuel(corps, question);
  const citation = choisirCitationContextuelle(corps, question);

  const parties = [
    HEADER_MWALIMU,
    "────────────────",
    corps,
    ouverture,
    encouragement,
    citation
  ].filter((v) => String(v || "").trim() !== "");

  return dedupeBlocFinal(parties.join("\n"));
}

function messageSecours(user, msgType = "message") {
  const appel = construireAppel({ nom: user?.nom || "élève" });
  return `${HEADER_MWALIMU}
────────────────
🔵 [VÉCU] : J'ai bien reçu ${messageTypeLisible(msgType)}, ${appel}.
🟡 [SAVOIR] : Je rencontre un petit souci technique pour traiter ta demande correctement maintenant.
🔴 [INSPIRATION] : Même quand cela bloque un peu, on peut reprendre avec calme et méthode.
❓ [CONSOLIDATION] : Réessaie dans un instant, ou reformule ta question plus simplement.
👉 Je reste à tes côtés.
🌟 Mot d'encouragement : Nous pouvons reprendre calmement.
${pick(CITATIONS.general)}`.replace(/\n{3,}/g, "\n\n").trim();
}

/* =========================================================
   12) CONSIGNES PÉDAGOGIQUES
========================================================= */
function construireConsignePedagogique(texte = "", type = "text") {
  const t = String(texte || "");

  if (type === "image") {
    return `MODE IMAGE :
- Commence par dire que tu as bien reçu l'image
- Recopie d'abord ce qui est visible
- Si une partie est floue, dis-le honnêtement
- Explique la démarche
- Ne résous pas tout à la place de l'élève
- Sois bref et clair`;
  }

  if (type === "audio") {
    return `MODE AUDIO :
- Si c'est un simple remerciement, une simple salutation ou un court message social, réponds en une phrase courte naturelle sans structure
- Si c'est une réaction humaine courte, réponds naturellement sans structure
- Sinon, commence par dire que tu as bien reçu l'audio
- Réponds avec chaleur et pédagogie
- Sois bref et clair`;
  }

  if (estDemandeJustificationOuDoute(t)) {
    return `MODE CONVERSATION :
- L'élève doute, conteste ou demande une justification
- Réponds humainement d'abord
- Puis justifie clairement
- N'utilise pas la structure pédagogique complète
- Sois calme, honnête et précis`;
  }

  if (estSoumissionReponse(t)) {
    return `MODE CORRECTION :
- L'élève soumet probablement sa réponse
- Corrige avec douceur
- N'écris pas "bravo" sauf si la réponse est réellement correcte
- Sois bref et clair`;
  }

  if (estQuestionTechnique(t)) {
    return `MODE EXERCICE :
- Explique la méthode
- Montre le démarrage utile
- Ne donne pas toute la réponse finale d'un coup
- Sois bref et clair`;
  }

  return `MODE NORMAL :
- Réponds naturellement
- Sois humain, utile et succinct`;
}

/* =========================================================
   13) TRAITEMENT
========================================================= */
async function traiterTexte(user, texteUtilisateur, historique) {
  const cacheKey = makeCacheKey(user, texteUtilisateur);
  const cached = getCache(cacheKey);

  if (cached) {
    logInfo("cache_hit", { phone: user?.phone || "", cacheKey });
    return { reponse: cached, fiche: null, bypassFormat: false };
  }

  if (estDemandeJustificationOuDoute(texteUtilisateur)) {
    const rep = await construireReponseConversationnelleIA(user, texteUtilisateur, historique);
    return { reponse: rep, fiche: null, bypassFormat: true };
  }

  if (!estDemandePedagogiqueReelle(texteUtilisateur)) {
    const rep = construireReponseHumaineSimple(user, texteUtilisateur);
    if (rep) {
      return { reponse: rep, fiche: null, bypassFormat: true };
    }
  }

  if (estMessageRelationnelSimple(texteUtilisateur) && !estDemandePedagogiqueReelle(texteUtilisateur)) {
    const rep = construireReponseHumaineSimple(user, texteUtilisateur);
    if (rep) {
      return { reponse: rep, fiche: null, bypassFormat: true };
    }
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

  consigneFinale += `\nLa consolidation, la citation finale et l’ouverture finale doivent rester dans la matière principale de la question.`;

  if (antiBoucle.consigne) {
    consigneFinale += `\n${antiBoucle.consigne}`;
  }

  const reponse = await construireReponseDbWebIa(
    user,
    texteUtilisateur,
    historique,
    fiche,
    consigneFinale
  );

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

  if (transcriptionBrute && estDemandeJustificationOuDoute(transcriptionBrute)) {
    const rep = await construireReponseConversationnelleIA(user, transcriptionBrute, historique);
    return { reponse: rep, fiche: null, bypassFormat: true };
  }

  if (transcription && estMessageRelationnelSimple(transcription) && !estDemandePedagogiqueReelle(transcription)) {
    const rep = construireReponseHumaineSimple(user, transcription);
    if (rep) return { reponse: rep, fiche: null, bypassFormat: true };
  }

  if (transcriptionBrute && estMessageRelationnelSimple(transcriptionBrute) && !estDemandePedagogiqueReelle(transcriptionBrute)) {
    const rep = construireReponseHumaineSimple(user, transcriptionBrute);
    if (rep) return { reponse: rep, fiche: null, bypassFormat: true };
  }

  const tMini = normaliserTexteRelationnel(transcriptionBrute);
  if (tMini && tMini.split(" ").length <= 7 && !estDemandePedagogiqueReelle(tMini)) {
    const rep = construireReponseHumaineSimple(user, tMini);
    if (rep) return { reponse: rep, fiche: null, bypassFormat: true };
  }

  if (typeAudio === "social" || typeAudio === "conversation") {
    const rep = construireReponseHumaineSimple(user, transcription || transcriptionBrute || "ok");
    return { reponse: rep || "D’accord 😊", fiche: null, bypassFormat: true };
  }

  let reponse = await reponseAudioUneSeulePasse(user, buffer, mimeType, historique, null);
  const texteAudioNormalise = normaliserTexteRelationnel(reponse);

  if (
    texteAudioNormalise.includes("merci") ||
    (estMessageRelationnelSimple(texteAudioNormalise) && !estDemandePedagogiqueReelle(texteAudioNormalise))
  ) {
    return {
      reponse: construireReponseHumaineSimple(user, texteAudioNormalise) || "Je t’en prie 😊",
      fiche: null,
      bypassFormat: true
    };
  }

  if (!reponse || !reponse.trim()) {
    return {
      reponse: "Je n'arrive pas encore à analyser ton audio correctement.",
      fiche: null,
      bypassFormat: true
    };
  }

  const bypassFormat = estReponseRelationnelleSimpleIA(reponse);

  return { reponse, fiche: null, bypassFormat };
}

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
🟡 [SAVOIR] : Le format d’image n'est pas encore supporté.
🔴 [INSPIRATION] : Ce n’est pas grave.
❓ [CONSOLIDATION] : Envoie-moi une image en JPG, JPEG, PNG, WEBP, GIF, BMP, HEIC ou HEIF.`,
      fiche: null,
      bypassFormat: false
    };
  }

  const base64Image = buffer.toString("base64");
  let reponse = await expliquerImageAvecIA(user, base64Image, mimeType, historique);

  if (!reponse || !String(reponse).trim()) {
    reponse = `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Je n'arrive pas encore à l'analyser correctement.
🔴 [INSPIRATION] : Nous pouvons reprendre calmement.
❓ [CONSOLIDATION] : Envoie-moi une image plus nette ou mieux cadrée.`;
  }

  return { reponse, fiche: null, bypassFormat: false };
}

/* =========================================================
   14) COMMANDES
========================================================= */
async function traiterCommandeTexte(from, _user, texteUtilisateur) {
  const cmd = String(texteUtilisateur || "").trim().toLowerCase();

  if (cmd === "/aide") {
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}
📘 *Commandes disponibles*
/aide → voir les commandes
/profil → refaire ton profil
/reset → vider l’historique de l’échange
/stop → arrêter les rappels du matin
/start → réactiver les rappels du matin`
    );
    return true;
  }

  if (cmd === "/stop") {
    await updateUserField(from, "reminders_enabled", false);
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}
────────────────
🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Les rappels du matin sont maintenant arrêtés.
🔴 [INSPIRATION] : Tu gardes le contrôle de ton rythme.
❓ [CONSOLIDATION] : Si tu veux les réactiver, envoie /start.`
    );
    return true;
  }

  if (cmd === "/start") {
    await updateUserField(from, "reminders_enabled", true);
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}
────────────────
🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Les rappels du matin sont maintenant réactivés.
🔴 [INSPIRATION] : Une bonne régularité aide à progresser.
❓ [CONSOLIDATION] : Nous continuerons ensemble pas à pas.`
    );
    return true;
  }

  if (cmd === "/reset") {
    await updateUserField(from, "historique", JSON.stringify([]));
    await resetAllStudentAttempts(from);
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}
────────────────
🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : L'historique a été remis à zéro.
🔴 [INSPIRATION] : Repartir proprement peut aider.
❓ [CONSOLIDATION] : Envoie-moi maintenant la question ou l’exercice que tu veux reprendre.`
    );
    return true;
  }

  if (cmd === "/profil") {
    await pool.query(
      "UPDATE conversations SET nom = '', classe = '', reve = '', historique = '[]'::jsonb, updated_at = NOW() WHERE phone = $1",
      [from]
    );
    await resetAllStudentAttempts(from);
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}
────────────────
🔄 *Mise à jour de ton profil*
🟡 Quel est ton *prénom* ?`
    );
    return true;
  }

  return false;
}

/* =========================================================
   15) RAPPELS VARIABLES
========================================================= */
function construireRappelMatin(eleve = {}) {
  const prenom = premierPrenom(eleve.nom || "élève");

  const vecus = [
    `Bonjour **${prenom}** 😊`,
    `Mbote **${prenom}** 👋`,
    `Bonjour **${prenom}**, nouvelle journée, nouveau pas.`,
    `Courage **${prenom}**, on avance encore aujourd’hui.`,
    `Bonjour **${prenom}**, j’espère que tu vas bien ce matin.`,
    `Salut **${prenom}**, prêt pour une petite victoire aujourd’hui ?`
  ];

  const savoirs = [
    "Aujourd’hui, choisis une petite chose à comprendre vraiment.",
    "Même 20 minutes de concentration peuvent faire une différence.",
    "Le progrès vient souvent des petits efforts répétés.",
    "Avance calmement : comprendre vaut mieux que se presser.",
    "Une leçon bien comprise aujourd’hui peut t’aider demain.",
    "Commence petit, mais commence avec sérieux."
  ];

  const inspirations = [
    "Chaque jour sérieux construit quelque chose en toi.",
    "La régularité finit toujours par produire des résultats.",
    "Tu n’as pas besoin d’être parfait, seulement constant.",
    "Un petit effort bien fait vaut mieux qu’un grand effort abandonné.",
    "Ce que tu apprends avec patience reste plus longtemps.",
    "Les grandes réussites commencent souvent par une petite discipline."
  ];

  const consolidations = [
    "Quelle matière veux-tu travailler aujourd’hui ?",
    "Quel chapitre veux-tu mieux comprendre aujourd’hui ?",
    "Quelle difficulté veux-tu régler aujourd’hui ?",
    "Quelle petite victoire scolaire veux-tu viser aujourd’hui ?",
    "Sur quoi veux-tu qu’on avance ensemble aujourd’hui ?",
    "Quelle question veux-tu éclaircir aujourd’hui ?"
  ];

  const encouragements = [
    "🌟 Mot d'encouragement : Avance doucement, mais avance.",
    "🌟 Mot d'encouragement : Chaque effort compte.",
    "🌟 Mot d'encouragement : Tu peux progresser pas à pas.",
    "🌟 Mot d'encouragement : Reste constant, même quand c’est difficile.",
    "🌟 Mot d'encouragement : Une journée bien utilisée peut changer beaucoup.",
    "🌟 Mot d'encouragement : Garde confiance, le sérieux finit par payer."
  ];

  return `${HEADER_MWALIMU}
────────────────
🔵 [VÉCU] : ${pick(vecus)}
🟡 [SAVOIR] : ${pick(savoirs)}
🔴 [INSPIRATION] : ${pick(inspirations)}
❓ [CONSOLIDATION] : ${pick(consolidations)}
${pick(encouragements)}
${pick(CITATIONS.patriotisme)}`.replace(/\n{3,}/g, "\n\n").trim();
}

cron.schedule("0 7 * * *", async () => {
  try {
    logInfo("cron_morning_reminder_start");

    const { rows } = await pool.query(`
      SELECT phone, nom
      FROM conversations
      WHERE coalesce(phone, '') <> ''
        AND coalesce(nom, '') <> ''
        AND coalesce(reminders_enabled, TRUE) = TRUE
    `);

    for (const eleve of rows) {
      try {
        await envoyerWhatsApp(eleve.phone, construireRappelMatin(eleve));
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
   16) PIPELINE D'UN MESSAGE
========================================================= */
async function processIncomingMessage(msg) {
  const from = msg.from;
  const msgId = msg.id;
  const texteUtilisateur = msg.text?.body?.trim() || "";
  const msgType = typeMessage(msg);
  const startedAt = nowMs();

  logInfo("incoming_message", {
    phone: from,
    msgId,
    msgType,
    preview: texteUtilisateur.slice(0, 80)
  });

  const check = await pool.query(
    "INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT DO NOTHING",
    [msgId]
  );

  if (check.rowCount === 0) {
    logWarn("duplicate_message_ignored", { phone: from, msgId });
    return;
  }

  await envoyerIndicateurFrappe(msgId);

  let user = await getUser(from);

  if (!user) {
    await createUser(from);
    user = await getUser(from);
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}
────────────────
🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.
🟡 Quel est ton *prénom* ?`
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
      await envoyerWhatsApp(
        from,
        `${HEADER_MWALIMU}
────────────────
🟡 Donne-moi simplement ton *prénom*, s'il te plaît.`
      );
      return;
    }

    await updateUserField(from, "nom", nom);
    await envoyerWhatsApp(
      from,
      `🤝 Enchanté *${nom}* !
🟡 En quelle *classe* es-tu ?`
    );
    return;
  }

  if (!user.classe) {
    const cl = normaliserNom(nettoyer(texteUtilisateur));
    if (!cl) {
      await envoyerWhatsApp(
        from,
        `🟡 Écris-moi ta *classe* simplement.
Exemple : 6e, 8e, Terminale, 1ère secondaire.`
      );
      return;
    }

    await updateUserField(from, "classe", cl);
    user = await getUser(from);

    await envoyerWhatsApp(
      from,
      `🟡 C'est bien noté, *${user.nom}*.
❓ Quel est ton plus grand *rêve* professionnel ?`
    );
    return;
  }

  if (!user.reve) {
    const rv = normaliserNom(nettoyer(texteUtilisateur));
    if (!rv) {
      await envoyerWhatsApp(
        from,
        `❓ Dis-moi simplement ton *rêve* professionnel.
Exemple : avocat, médecin, ingénieur, pilote.`
      );
      return;
    }

    await updateUserField(from, "reve", rv);
    user = await getUser(from);

    await envoyerWhatsApp(
      from,
      `✨ *Quelle ambition magnifique !*
🔴 Devenir *${rv}* est un rêve noble, et je sais que tu en es capable.
🔵 *Pour commencer notre parcours ensemble, dis-moi :*
👉 Quelle matière ou quel chapitre te pose problème en ce moment ?`
    );
    return;
  }

  let historique = Array.isArray(user.historique)
    ? user.historique
    : safeJsonParse(user.historique, []);

  let contenuUtilisateurPourMemoire = texteUtilisateur || `[message ${msgType}]`;

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
  } else {
    reponseBrute = `🔵 [VÉCU] : J'ai bien reçu ton message.
🟡 [SAVOIR] : Pour l'instant, je traite surtout les textes, les audios et les images.
🔴 [INSPIRATION] : Nous pouvons déjà avancer correctement avec ces formats.
❓ [CONSOLIDATION] : Envoie-moi ta question par écrit, par audio ou avec une image nette.`;
  }

  if (!reponseBrute || !String(reponseBrute).trim()) {
    await logUnansweredQuestion(
      { ...user, phone: from },
      texteUtilisateur || contenuUtilisateurPourMemoire,
      msgType,
      "final_empty"
    );

    reponseBrute = `🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Je n'ai pas encore pu produire une réponse claire.
🔴 [INSPIRATION] : Ce n’est pas un problème ; nous pouvons reprendre plus simplement.
❓ [CONSOLIDATION] : Reformule ta question en une seule phrase.`;
  }

  const messageFinal = bypassFormat
    ? reponseBrute
    : construireMessageFinal(
        user,
        reponseBrute,
        historique,
        texteUtilisateur || contenuUtilisateurPourMemoire,
        ficheContexte
      );

  await envoyerWhatsApp(from, messageFinal);
  await appendHistorique(from, "assistant", tronquerTexte(messageFinal, 2500));

  logInfo("message_processed", {
    phone: from,
    msgId,
    msgType,
    durationMs: nowMs() - startedAt
  });
}

/* =========================================================
   17) WEBHOOK
========================================================= */
app.post("/webhook", async (req, res) => {
  if (!verifierSignatureMeta(req)) {
    logWarn("invalid_meta_signature");
    return res.sendStatus(403);
  }

  const msg = extraireMessageWhatsApp(req.body);
  if (!msg) return res.sendStatus(200);

  res.sendStatus(200);

  const from = msg.from || "unknown";

  runSequentialByKey(from, async () => {
    try {
      await processIncomingMessage(msg);
    } catch (e) {
      logError("process_incoming_message", e, { phone: from });

      try {
        let user = await getUser(from);
        if (!user) user = { nom: "élève" };

        if (estErreurQuotaGemini(e)) {
          await envoyerWhatsApp(
            from,
            `${HEADER_MWALIMU}
────────────────
🔵 [VÉCU] : J'ai bien reçu ${messageTypeLisible(typeMessag…
