
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

// VERSION : Mwalimu Social Final - social séparé de la pédagogie
app.set("trust proxy", 1);

/* ========================================================= 1) CONFIG ========================================================= */
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
  max: 20,
});

pool.on("error", (err) => {
  logError("postgres_idle", err);
});

app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests",
});
app.use(webhookLimiter);

/* ========================================================= 2) LOGS ========================================================= */
function horodatage() {
  return new Date().toISOString();
}

function logInfo(event, meta = {}) {
  console.log(
    JSON.stringify({ level: "info", event, ts: horodatage(), ...meta })
  );
}

function logWarn(event, meta = {}) {
  console.warn(
    JSON.stringify({ level: "warn", event, ts: horodatage(), ...meta })
  );
}

function logError(event, error, meta = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      event,
      ts: horodatage(),
      message: error?.message || String(error || ""),
      stack: error?.stack || null,
      data: error?.response?.data || null,
      ...meta,
    })
  );
}

function nowMs() {
  return Date.now();
}

/* ========================================================= 3) CONSTANTES ========================================================= */
const HEADER_MWALIMU =
  "🔴🟡🔵 *Mwalimu EdTech : Ton Mentor pour l'Excellence* 🇨🇩";

const CITATIONS = {
  patriotisme: [
    "***« Aimer sa patrie, c'est la servir avec intelligence, honnêteté et discipline. »***",
    "***« Un bon élève d'aujourd'hui peut devenir un grand bâtisseur du Congo de demain. »***",
  ],
  geographie: [
    "***« Connaître son pays, c'est déjà commencer à mieux l'aimer. »***",
    "***« La géographie aide à mieux comprendre le monde et à mieux servir sa patrie. »***",
  ],
  mathematiques: [
    "***« La rigueur dans le calcul forme aussi la rigueur dans la vie. »***",
    "***« Un esprit qui raisonne bien peut mieux construire l'avenir. »***",
  ],
  histoire: [
    "***« Comprendre l'histoire aide à aimer sa patrie avec plus de conscience. »***",
    "***« Un peuple qui connaît son histoire prépare mieux son avenir. »***",
  ],
  francais: [
    "***« Bien parler et bien écrire donnent de la force à la pensée. »***",
    "***« La maîtrise des mots fortifie l'intelligence et la dignité. »***",
  ],
  sciences: [
    "***« La science bien apprise peut aider à résoudre les vrais problèmes du pays. »***",
    "***« Étudier les sciences, c'est se préparer à être utile à sa nation. »***",
  ],
  civisme: [
    "***« Le civisme commence par de petits actes honnêtes. »***",
    "***« Respecter la loi, c'est aussi participer à la vie de la nation. »***",
  ],
  general: [
    "***« Apprendre avec sérieux aujourd'hui, c'est mieux servir le Congo demain. »***",
    "***« Le savoir et la discipline font grandir la nation. »***",
  ],
};

const MATIERE_MATH = "math";
const MATIERE_PHYSIQUE = "physique";
const MATIERE_CHIMIE = "chimie";
const MATIERE_GENERAL = "general";

const REGLE_FORMAT_MATH = `FORMAT OBLIGATOIRE D'ÉCRITURE SCIENTIFIQUE (WhatsApp) : - Écris les calculs, formules et expressions de manière simple, scolaire et lisible - Interdiction totale de LaTeX et pseudo-LaTeX - N'utilise jamais : \\( \\) \\[ \\] \\frac \\sqrt ^{} \\left \\right \\times \\div - Puissance : x², x³, a², b², cm², cm³, m², m³ - Multiplication : × - Division : / - Fraction simple : 2/5, 3/4, 7/10 - Exemple correct : D = b² - 4ac - Exemple correct : x = (-b ± √D) / 2a - Pour la racine, écris : √9 - Les molécules doivent être propres : H₂O, CO₂, O₂, H₂SO₄, NaCl`;

const REGLE_CALCUL_INTELLIGENT = `RÈGLES SPÉCIALES POUR LES CALCULS : - Sois rigoureux - Vérifie chaque étape - Avance ligne par ligne - Explique la logique avant le résultat - N'invente jamais un chiffre, une unité ou une formule`;

const SYSTEM_BASE = `Tu es Mwalimu EdTech, un précepteur numérique congolais, humain, chaleureux, rigoureux, pédagogue et bienveillant. MISSION PÉDAGOGIQUE : - Aider l'élève à comprendre - Guider sans faire le travail à sa place - Expliquer comme un vrai précepteur - Utiliser un ton humain, simple, motivant et respectueux - Adapter le niveau à la classe de l'élève - Te référer au contexte scolaire de la RDC lorsque c'est pertinent RÈGLE ABSOLUE POUR LES RÉPONSES PÉDAGOGIQUES : - À la fin de CHAQUE réponse pédagogique, tu DOIS écrire EXACTEMENT ceci : ❓ [ÉVALUATION OBLIGATOIRE] [ta question ici] ⚠️ *Réponds à cette question avant de continuer.* - Le mot "CONSOLIDATION" est TOTALEMENT INTERDIT dans toutes tes réponses - Tu ne dois JAMAIS écrire [CONSOLIDATION] - Tu dois TOUJOURS écrire [ÉVALUATION OBLIGATOIRE] MODE SOCIAL : - Si l'élève échange socialement, réponds naturellement, sans structure pédagogique. - Ne mets jamais VÉCU/SAVOIR/INSPIRATION/ÉVALUATION/citation dans les conversations sociales. - Tu peux parler simplement de détente, humeur, fatigue, motivation légère, foot, journée, musique, blague douce, rêve ou quotidien. - Garde un ton sain, respectueux et adapté à un élève. - Ne fais pas de romance, de contenu sexuel, de violence graphique, ni d'encouragement dangereux. STYLE PÉDAGOGIQUE OBLIGATOIRE : - Réponse claire, naturelle et brève - Évite les répétitions - Ne sois jamais bavard - Ne félicite pas exagérément - N'écris pas "bravo" sauf si l'élève a réellement bien répondu, corrigé juste ou fourni une bonne démarche - Évite les compliments excessifs - Le début doit être humain et simple - N'utilise pas toujours "Ah, prénom" - Si l'élève dit juste bonjour, bonsoir, merci, bonne nuit, réponds humainement et normalement, sans structure pédagogique - Quand il faut une vraie réponse pédagogique, la structure est : 🔵 [VÉCU] 🟡 [SAVOIR] 🔴 [INSPIRATION] ❓ [ÉVALUATION OBLIGATOIRE] ⚠️ *Réponds à cette question avant de continuer.* ${REGLE_CALCUL_INTELLIGENT} ${REGLE_FORMAT_MATH}`;

const SYSTEM_TUTORAT = `RÈGLES DE TUTORAT : - Tu es un précepteur, pas un solveur automatique - Pour un exercice : méthode d'abord, réponse finale seulement si nécessaire - Pour maths/physique/chimie : guider pas à pas - Pour une correction : corrige avec douceur et précision - À la fin de chaque explication, pose UNE question avec le format EXACT : ❓ [ÉVALUATION OBLIGATOIRE] [question] ⚠️ *Réponds à cette question avant de continuer.*`;

const SYSTEM_JURIDIQUE_WEB = `RÈGLES JURIDIQUES ET WEB : - Pour droit, loi, code, article, OHADA, fiscalité, procédure : utilise Google Search si nécessaire - N'invente jamais un article ou une source - Si un article exact est trouvé de manière fiable, recopie-le d'abord puis commente brièvement - Si le texte exact n'est pas certain, dis-le honnêtement`;

const SYSTEM_GEO_WEB = `RÈGLES GÉOGRAPHIE / ADMINISTRATION : - Pour province, territoire, commune, ville, secteur, chefferie, subdivision administrative : privilégie le web si nécessaire - Si la question demande une liste complète, donne la liste complète trouvée - N'invente jamais un nom manquant - Si tu n'es pas sûr qu'une liste soit exhaustive, dis-le honnêtement`;

const JSON_SCHEMA_INTENTION = {
  type: "OBJECT",
  properties: {
    intention: { type: "STRING" },
    matiere: { type: "STRING" },
    besoinCorrectionRenforcee: { type: "BOOLEAN" },
    sujet: { type: "STRING" },
  },
  required: ["intention", "matiere", "besoinCorrectionRenforcee", "sujet"],
};

const JSON_SCHEMA_AUDIO = {
  type: "OBJECT",
  properties: {
    transcription: { type: "STRING" },
    type: { type: "STRING" },
  },
  required: ["transcription", "type"],
};

/* ========================================================= 4) CACHE TTL ========================================================= */
class TTLCache {
  constructor({ ttlMs = 60_000, maxEntries = 500, cleanupIntervalMs = 120_000, } = {}) {
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
    if (this.store.size >= this.maxEntries) this.evictOldest();
    this.store.set(key, {
      value,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      expiresAt: Date.now() + ttlMs,
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
  cleanupIntervalMs: 120_000,
});

function makeCacheKey(user = {}, texte = "") {
  const classe = String(user?.classe || "")
    .toLowerCase()
    .trim();
  const nom = String(user?.nom || "")
    .toLowerCase()
    .trim();
  const q = String(texte || "")
    .toLowerCase()
    .trim();
  return `${nom}|${classe}|${q}`;
}
function getCache(key) {
  return cache.get(key);
}
function setCache(key, value) {
  cache.set(key, value);
}

/* ========================================================= 5) QUEUE PAR NUMÉRO ========================================================= */
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

/* ========================================================= 6) OUTILS SIMPLES ========================================================= */
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
  return String(nom || "")
    .trim()
    .replace(/\s+/g, " ");
}

function nettoyer(texte = "") {
  return String(texte || "")
    .replace(
      /je m'appelle|mon nom est|mon prénom est|je suis en|ma classe est|mon rêve est|je veux devenir/gi,
      ""
    )
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
  const data = String(
    err?.response?.data ? JSON.stringify(err.response.data) : ""
  ).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    data.includes("429") ||
    data.includes("quota")
  );
}

function genreEleve(nom = "") {
  const prenom = String(nom || "")
    .trim()
    .split(" ")[0]
    .toLowerCase();
  const prenomsFeminins = [
    "dora",
    "marie",
    "anne",
    "anna",
    "annie",
    "anuarite",
    "ruth",
    "grace",
    "esther",
    "sarah",
    "sara",
    "debora",
    "fatou",
    "chantal",
    "nadine",
    "joyce",
    "mireille",
    "patience",
    "rebecca",
    "prisca",
    "gloria",
    "divine",
    "naomie",
    "noella",
    "blandine",
    "huguette",
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
    .replace(/[.,!?;:()"`''´’]/g, " ")
    .replace(/\bmwalimu\b/g, " ")
    .replace(/\bmon\s+cher\b/g, " ")
    .replace(/\bma\s+chere\b/g, " ")
    .replace(/\bcher\b/g, " ")
    .replace(/\bchere\b/g, " ")
    .replace(/\bs il te plait\b/g, " ")
    .replace(/\bsvp\b/g, " ")
    .replace(/\bstp\b/g, " ")
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

function supprimerFormulesLourdesDAppel(texte = "", user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  let t = String(texte || "");
  t = t.replace(/\bAh,\s*\*\*[^*]+\*\*,?\s*/gi, "");
  t = t.replace(/\bAh,\s*[^,\n]+,?\s*/gi, "");
  t = t.replace(/\bfuture avocate\b/gi, "");
  t = t.replace(/\bfutur avocat\b/gi, "");
  t = t.replace(/\bmon cher\b/gi, prenom);
  t = t.replace(/\bma chère\b/gi, prenom);
  t = t.replace(/\bcher élève\b/gi, prenom);
  t = t.replace(/\bmon élève\b/gi, prenom);
  return t
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ========================================================= 7) MODULE SOCIAL RENFORCÉ ========================================================= */
function estEmojiOuReactionSimple(texte = "") {
  const brut = String(texte || "").trim();
  if (!brut) return false;
  const sansEspaces = brut.replace(/\s+/g, "");

  // Emoji seul : 😊 👍 😂 🙏 ❤️ 🇨🇩 etc.
  const emojiRegex =
    /^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D]+$/u;
  if (emojiRegex.test(sansEspaces)) return true;

  const t = normaliserTexteRelationnel(texte);
  const reactions = [
    "ok",
    "okay",
    "d accord",
    "dac",
    "dacc",
    "oui",
    "non",
    "hum",
    "humm",
    "hmmm",
    "hein",
    "amen",
    "alleluia",
    "alléluia",
    "lol",
    "mdr",
    "haha",
    "hahaha",
    "bien",
    "super",
    "cool",
    "parfait",
    "merci",
    "merci beaucoup",
    "top",
    "nickel",
  ];
  return reactions.includes(t);
}

function contientDemandePedagogiqueClaire(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  // Ces expressions ressemblent à des questions mais restent sociales.
  const socialPur = [
    "comment ca va",
    "ca va",
    "tu vas bien",
    "comment vas tu",
    "comment tu vas",
    "et toi",
    "et vous",
    "je vais bien et toi",
    "je vais bien et vous",
    "ca va et toi",
    "ca va et vous",
    "tres bien et toi",
    "tres bien et vous",
  ];
  if (socialPur.includes(t)) return false;

  const motsPedagogiques = [
    "explique",
    "explique moi",
    "expliquer",
    "corrige",
    "corriger",
    "calcule",
    "calculer",
    "resous",
    "resoudre",
    "résous",
    "résoudre",
    "c est quoi",
    "definition",
    "definis",
    "définis",
    "donne moi la definition",
    "aide moi",
    "aidez moi",
    "montre moi",
    "apprends moi",
    "je n ai pas compris",
    "cours",
    "lecon",
    "leçon",
    "chapitre",
    "exercice",
    "probleme",
    "problème",
    "math",
    "maths",
    "equation",
    "équation",
    "fraction",
    "calcul",
    "racine",
    "puissance",
    "physique",
    "chimie",
    "molécule",
    "molecule",
    "atome",
    "histoire",
    "geographie",
    "géographie",
    "francais",
    "français",
    "grammaire",
    "orthographe",
    "conjugaison",
    "droit",
    "loi",
    "article",
    "code",
    "constitution",
    "province",
    "territoire",
    "commune",
    "ville",
    "capital",
    "capitale",
    "rdc",
    "congo",
    "tenafep",
    "exetat",
    "examen",
    "devoir",
    "interro",
    "interrogation",
    "revision",
    "révision",
  ];

  return motsPedagogiques.some((mot) => t.includes(mot));
}

function classerMessageSocial(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return null;

  if (estEmojiOuReactionSimple(texte)) return "emoji";

  // Salutations simples, même avec le prénom : "bonsoir dora"
  if (
    /^(bonjour|bonsoir|salut|hello|coucou|bjr|bsr|mbote|yo|cc|slt)(\s+[a-z]{2,20}){0,2}$/i.test(
      t
    )
  ) {
    return "salutation";
  }

  // Questions d'humeur : "Mwalimu comment tu vas Dora ?"
  if (
    /^(comment ca va|ca va|tu vas bien|vous allez bien|comment vas tu|comment tu vas|et toi|et vous)(\s+[a-z]{2,20}){0,2}$/i.test(
      t
    )
  ) {
    return "question_humeur";
  }

  // Réponse d'humeur simple : "je vais bien", "ça va", "très bien"
  if (
    /^(je vais bien|je vais tres bien|je me porte bien|ca va|ca va bien|tranquille|pas mal|au top|bien|tres bien)(\s+[a-z]{2,20}){0,2}$/i.test(
      t
    )
  ) {
    return "reponse_humeur";
  }

  // Réponse + retour : "je vais bien et toi ?"
  if (
    /\b(je vais bien|je vais tres bien|ca va|ca va bien|tres bien|bien)\b.*\b(et toi|et vous)\b/i.test(
      t
    )
  ) {
    return "reponse_humeur_et_retour";
  }

  if (
    /^(merci|merci beaucoup|grand merci|mille mercis|merci infiniment|merci encore|merci bien|je te remercie|je vous remercie|thanks|thx)(\s+[a-z]{2,20}){0,2}$/i.test(
      t
    )
  ) {
    return "remerciement";
  }

  if (
    /^(bonne nuit|dors bien|bonne soiree|bonne journee|bonne matinee|bon apres midi|bon week end|bon weekend|a demain|a bientot)(\s+[a-z]{2,20}){0,2}$/i.test(
      t
    )
  ) {
    return "souhait";
  }

  if (
    /^(ok|okay|d accord|dac|dacc|entendu|compris|parfait|super|cool|bien|ca marche|c est note|je vois|noté|note)$/i.test(
      t
    )
  ) {
    return "accuse_reception";
  }

  // Détente et lien social : l'élève veut parler, souffler, rire ou échanger.
  if (
    /\b(blague|devinette|rire|rigoler|detente|détente|parlons|discutons|causer|causons|foot|football|basket|musique|chanson|film|serie|série|jeu|histoire drole|histoire drôle|journee|journée|fatigue|fatigué|fatiguee|fatiguée|stress|stressé|stressee|stressée|triste|decourage|découragé|decouragee|découragée|enerve|énervé|enervee|énervée|je m ennuie|ennui|tu es la|tu es là|on parle|on discute)\b/i.test(
      t
    )
  ) {
    return "detente";
  }

  return null;
}

function estMessagePurementSocial(texte = "") {
  if (!texte || !String(texte).trim()) return false;
  if (contientDemandePedagogiqueClaire(texte)) return false;
  return classerMessageSocial(texte) !== null;
}

function estAccuseReceptionSimple(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;
  const arSimples = [
    "ok",
    "okay",
    "d accord",
    "dac",
    "dacc",
    "d'accord",
    "oui",
    "non",
    "entendu",
    "compris",
    "parfait",
    "tres bien",
    "nickel",
    "ca marche",
    "ca va",
    "super",
    "cool",
    "bien",
    "ok merci",
    "okay merci",
    "d accord merci",
    "ca va merci",
    "c'est noté",
    "c'est note",
    "je vois",
    "je comprends",
    "je comprend",
    "ah ok",
    "ah d'accord",
    "ah d accord",
    "ah okay",
  ];
  if (arSimples.includes(t)) return true;
  return /^(ok|okay|d'?accord|dac|dacc|entendu|compris|parfait|super|cool|bien|nickel|ca marche|ca va|oui|non|c est note|je vois|je comprends?|ah ok|ah d'?accord|ah okay)[\s!]*$/i.test(
    t
  );
}

function estMessageSalutation(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  return (
    !!t &&
    /^(bonjour|bonsoir|salut|hello|coucou|bjr|mbote|yo|cc|bonne nuit|bonne soiree|bonne journee|bonne matinee|bon apres midi|bon week end|bon weekend|a demain)/i.test(
      t
    )
  );
}

function estMessageRemerciement(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  return (
    !!t &&
    /^(merci|grand merci|mille mercis|je te remercie|je vous remercie)/i.test(t)
  );
}

function estMessageRelationnelSimple(texte = "") {
  return estMessagePurementSocial(texte);
}

function construireReponseSocialeDirecte(user = {}, texte = "") {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom && prenom !== "élève" ? `**${prenom}**` : "toi";
  const typeSocial = classerMessageSocial(texte);
  const t = normaliserTexteRelationnel(texte);
  const heure = new Date().getHours();

  if (typeSocial === "emoji") {
    const brut = String(texte || "").trim();
    if (/👍|👌|✅/.test(brut)) return `Bien reçu ${appel} 👍`;
    if (/😂|🤣/.test(brut)) return `Je vois que ça t'a fait rire ${appel} 😄`;
    if (/🙏/.test(brut)) return `Avec plaisir ${appel} 🙏`;
    if (/❤️|💕|💙|💛/.test(brut)) return `Merci ${appel} 😊`;
    return pick([
      `😊 Je te comprends ${appel}.`,
      `Bien reçu ${appel} 😊`,
      `D'accord ${appel} 👍`,
      `Je suis avec toi ${appel}.`,
    ]);
  }

  if (typeSocial === "salutation") {
    if (heure < 12) return `Bonjour ${appel} ☀️ Comment vas-tu aujourd'hui ?`;
    if (heure < 18)
      return `Bon après-midi ${appel} 🌤 Comment se passe ta journée ?`;
    return `Bonsoir ${appel} 😊 Content de te retrouver. Comment s'est passée ta journée ?`;
  }

  if (typeSocial === "question_humeur") {
    return `Je vais bien, merci ${appel} 😊 Et toi, comment vas-tu ?`;
  }

  if (typeSocial === "reponse_humeur_et_retour") {
    return `Je vais bien aussi, merci ${appel} 😊 Content de continuer avec toi.`;
  }

  if (typeSocial === "reponse_humeur") {
    return pick([
      `Content de l'entendre ${appel} 😊`,
      `Très bien ${appel}, ça me fait plaisir.`,
      `Heureux de savoir que tu vas bien ${appel} 😊`,
    ]);
  }

  if (typeSocial === "remerciement") {
    return pick([
      `Avec plaisir ${appel} 😊`,
      `Je t'en prie ${appel}.`,
      `C'est normal ${appel}, je suis là pour t'accompagner.`,
    ]);
  }

  if (typeSocial === "souhait") {
    if (t.includes("bonne nuit"))
      return `Bonne nuit ${appel} 🌙 Repose-toi bien.`;
    if (t.includes("a demain")) return `À demain ${appel} 👋`;
    if (t.includes("bonne journee")) return `Bonne journée ${appel} ☀️`;
    if (t.includes("bonne soiree")) return `Bonne soirée ${appel} 🌙`;
    return `Merci ${appel}, à toi aussi 😊`;
  }

  if (typeSocial === "accuse_reception") {
    return pick([
      `D'accord ${appel}.`,
      `Bien reçu ${appel}.`,
      `Très bien ${appel}.`,
    ]);
  }

  if (typeSocial === "detente") {
    if (t.includes("blague")) {
      return `D'accord ${appel} 😄 Petite blague douce : Pourquoi le cahier est-il toujours calme ? Parce qu'il garde toutes ses lignes.`;
    }
    if (t.includes("devinette")) {
      return `Avec plaisir ${appel} 😊 Devinette : Qu'est-ce qui grandit quand on le partage ? Le savoir.`;
    }
    if (
      t.includes("fatigue") ||
      t.includes("fatiguee") ||
      t.includes("fatigué")
    ) {
      return `Je comprends ${appel}. Prends une petite pause, respire calmement, puis reprends doucement quand tu te sens prêt.`;
    }
    if (t.includes("stress")) {
      return `Je comprends ${appel}. On peut avancer calmement : une chose à la fois, sans pression.`;
    }
    if (t.includes("foot") || t.includes("football")) {
      return `Avec plaisir ${appel} ⚽ On peut parler football. Quelle équipe ou quel joueur aimes-tu ?`;
    }
    if (t.includes("musique")) {
      return `Oui ${appel} 🎵 La musique peut détendre l'esprit. Quel style écoutes-tu souvent ?`;
    }
    return `Oui ${appel}, on peut échanger un peu 😊 De quoi veux-tu parler ?`;
  }

  return `Je te lis ${appel} 😊`;
}

function estSoumissionReponse(texte = "") {
  const t = String(texte || "")
    .toLowerCase()
    .trim();
  const indices = [
    "ma réponse",
    "ma reponse",
    "j'ai trouvé",
    "jai trouvé",
    "j'ai fait",
    "voici ma réponse",
    "voici ma reponse",
    "mon résultat",
    "mon resultat",
    "j'obtiens",
    "j'ai obtenu",
    "le résultat est",
    "le resultat est",
    "ça donne",
  ];
  if (indices.some((i) => t.includes(i))) return true;
  return /^[0-9xXyYzZ\s=+\-÷/*().,]+$/.test(t) && t.length <= 80;
}

function estQuestionTechnique(texte = "") {
  const t = String(texte || "").toLowerCase();
  const mots = [
    "calcule",
    "calculer",
    "résous",
    "resous",
    "équation",
    "equation",
    "fraction",
    "physique",
    "chimie",
    "exercice",
    "problème",
    "probleme",
    "géométrie",
    "geometrie",
    "puissance",
    "racine",
    "math",
    "maths",
    "formule",
  ];
  return mots.some((m) => t.includes(m));
}

function estReponseRelationnelleSimpleIA(texte = "") {
  const t = String(texte || "").trim();
  if (!t) return false;
  if (/🔵\s*\[VÉCU\]|🟡\s*\[SAVOIR\]|🔴\s*\[INSPIRATION\]|❓\s*\[/i.test(t))
    return false;
  if (t.length > 220) return false;
  const n = normaliserMessageCourt(t);
  return (
    n.startsWith("je t en prie") ||
    n.startsWith("avec plaisir") ||
    n.startsWith("c est normal") ||
    n.startsWith("bonjour") ||
    n.startsWith("bonsoir") ||
    n.startsWith("salut") ||
    n.startsWith("bonne nuit") ||
    n.startsWith("d accord") ||
    n.startsWith("bonne journee") ||
    n.startsWith("je vais bien") ||
    n.startsWith("content de") ||
    n.startsWith("bien recu")
  );
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
    "geographie",
    "math",
    "mathematiques",
    "equation",
    "fraction",
    "histoire",
    "francais",
    "grammaire",
    "droit",
    "sciences",
    "physique",
    "chimie",
    "province",
    "territoire",
    "constitution",
    "rdc",
    "congo",
    "commune",
    "ville",
    "haut katanga",
  ];
  for (const s of sujets) {
    if (t.includes(s)) return s;
  }
  return t.split(" ").slice(0, 4).join(" ");
}

function detecterMatierePrincipale(question = "", corps = "") {
  const q = String(question || "")
    .toLowerCase()
    .trim();
  const c = String(corps || "")
    .toLowerCase()
    .trim();
  const scores = {
    droit: 0,
    geographie: 0,
    histoire: 0,
    math: 0,
    physique: 0,
    chimie: 0,
    francais: 0,
    general: 0,
  };

  const ajouter = ( theme, motsQuestion = [], motsCorps = [], poidsQuestion = 6, poidsCorps = 1 ) => {
    for (const mot of motsQuestion)
      if (q.includes(mot)) scores[theme] += poidsQuestion;
    for (const mot of motsCorps)
      if (c.includes(mot)) scores[theme] += poidsCorps;
  };

  ajouter(
    "droit",
    [
      "droit",
      "loi",
      "code",
      "article",
      "juridique",
      "tribunal",
      "ohada",
      "constitution",
    ],
    ["droit", "loi", "code", "article", "juridique"]
  );
  ajouter(
    "geographie",
    [
      "géographie",
      "geographie",
      "province",
      "territoire",
      "commune",
      "ville",
      "secteur",
      "chefferie",
    ],
    ["géographie", "province", "territoire", "commune", "ville"]
  );
  ajouter(
    "histoire",
    ["histoire", "passé", "colonisation", "indépendance", "royaume"],
    ["histoire", "passé", "colonisation", "indépendance"]
  );
  ajouter(
    "math",
    [
      "math",
      "maths",
      "équation",
      "equation",
      "fraction",
      "calcul",
      "racine",
      "puissance",
    ],
    ["math", "équation", "equation", "fraction", "calcul"]
  );
  ajouter(
    "physique",
    ["physique", "force", "vitesse", "énergie", "energie", "masse", "pression"],
    ["physique", "force", "vitesse"]
  );
  ajouter(
    "chimie",
    ["chimie", "molécule", "molecule", "atome", "acide", "base", "solution"],
    ["chimie", "molécule", "molecule", "atome"]
  );
  ajouter(
    "francais",
    ["français", "francais", "grammaire", "orthographe", "conjugaison"],
    ["français", "francais", "grammaire", "orthographe"]
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
  const matiere = detecterMatierePrincipale(question, "");
  if (estMessageRelationnelSimple(question))
    return `🔵 [VÉCU] : Je te lis, ${prenom}.`;
  if (matiere === "droit")
    return `🔵 [VÉCU] : D'accord ${prenom}, regardons cette notion de droit simplement.`;
  if (matiere === "geographie")
    return `🔵 [VÉCU] : D'accord ${prenom}, regardons ce point de géographie calmement.`;
  if (matiere === "histoire")
    return `🔵 [VÉCU] : D'accord ${prenom}, regardons cela comme un point d'histoire.`;
  return pick([
    `🔵 [VÉCU] : D'accord ${prenom}, voyons cela simplement.`,
    `🔵 [VÉCU] : Très bien ${prenom}, prenons cette question pas à pas.`,
    `🔵 [VÉCU] : Je t'accompagne ${prenom}. Regardons l'idée essentielle.`,
  ]);
}

function supprimerDoublonsLignes(texte = "") {
  if (!texte) return "";
  const lignes = String(texte)
    .split("\n")
    .map((l) => l.trimEnd());
  const resultat = [];
  let precedent = "";
  for (const ligne of lignes) {
    const normalisee = ligne.trim().toLowerCase();
    if (normalisee && normalisee === precedent) continue;
    resultat.push(ligne);
    precedent = normalisee;
  }
  return resultat
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function nettoyerReponseIA(texte = "") {
  if (!texte) return "";
  let t = String(texte);
  t = t.replace(/🔴🟡🔵\s*\*?Mwalimu EdTech[^*]*\*?\s*🇨🇩/gi, "");
  t = t.replace(/^\s*🌟\s*Mot d['’]encouragement\s*:.*$/gim, "");
  t = t.replace(/^\s*👉\s*Je reste disponible.*$/gim, "");
  t = t.replace(/^\s*👉\s*Continue à me parler.*$/gim, "");
  return supprimerDoublonsLignes(t)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function simplifierNotationMath(texte = "") {
  if (!texte) return "";
  let t = String(texte);
  t = t.replace(/\\times/g, "×");
  t = t.replace(/\\div/g, "/");
  t = t.replace(/\\pm/g, "±");
  t = t.replace(/\\sqrt\{([^}]+)\}/g, "√$1");
  t = t.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1 / $2");
  t = t.replace(/\^2/g, "²");
  t = t.replace(/\^3/g, "³");
  t = t.replace(/[{}]/g, "");
  t = t.replace(/\bH2O\b/g, "H₂O");
  t = t.replace(/\bCO2\b/g, "CO₂");
  t = t.replace(/\bO2\b/g, "O₂");
  return t
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function simplifierPresentationScientifique(texte = "") {
  return String(texte || "")
    .replace(/\b([0-9]+)\.([0-9]+)\b/g, "$1,$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function nettoyerSelonMatiere(texte = "", matiere = MATIERE_GENERAL) {
  if ([MATIERE_MATH, MATIERE_PHYSIQUE, MATIERE_CHIMIE].includes(matiere))
    return simplifierNotationMath(texte);
  return texte;
}

function reformaterFinalSelonMatiere(texte = "", _matiere = MATIERE_GENERAL) {
  return String(texte || "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function detecterMatiereScientifique( question = "", reponse = "", fiche = null ) {
  const base = [
    String(question || ""),
    String(reponse || ""),
    String(fiche?.matiere || ""),
    String(fiche?.titre || ""),
    String(fiche?.contenu || "").slice(0, 1200),
  ]
    .join(" ")
    .toLowerCase();
  const score = { math: 0, physique: 0, chimie: 0 };
  [
    "math",
    "maths",
    "équation",
    "equation",
    "fraction",
    "racine",
    "calcul",
  ].forEach((m) => {
    if (base.includes(m)) score.math += 2;
  });
  [
    "physique",
    "force",
    "vitesse",
    "énergie",
    "energie",
    "masse",
    "distance",
    "temps",
  ].forEach((m) => {
    if (base.includes(m)) score.physique += 2;
  });
  [
    "chimie",
    "mol",
    "solution",
    "acide",
    "base",
    "h2o",
    "co2",
    "o2",
    "nacl",
  ].forEach((m) => {
    if (base.includes(m)) score.chimie += 2;
  });
  const maxScore = Math.max(score.math, score.physique, score.chimie);
  if (maxScore <= 0) return MATIERE_GENERAL;
  if (score.chimie === maxScore) return MATIERE_CHIMIE;
  if (score.physique === maxScore) return MATIERE_PHYSIQUE;
  if (score.math === maxScore) return MATIERE_MATH;
  return MATIERE_GENERAL;
}

function appliquerLes4EtapesScientifiques( reponse = "", question = "", fiche = null ) {
  const matiere = detecterMatiereScientifique(question, reponse, fiche);
  let texte = String(reponse || "");
  texte = simplifierNotationMath(texte);
  texte = simplifierPresentationScientifique(texte);
  texte = nettoyerSelonMatiere(texte, matiere);
  texte = reformaterFinalSelonMatiere(texte, matiere);
  return { matiere, texte };
}

/* ========================================================= 8) ÉVALUATION OBLIGATOIRE ========================================================= */
function construireQuestionEvaluationForte( question = "", corps = "", sujet = "" ) {
  const matiere = detecterMatierePrincipale(question, corps);
  const notion = sujet || extraireSujetMemoire(question) || "cette notion";
  const modeles = {
    droit: `❓ [ÉVALUATION OBLIGATOIRE]\nAvant de continuer, peux-tu m'expliquer en une phrase ce qu'est le/la ${notion} ?\n⚠️ *Réponds à cette question pour valider ta compréhension.*`,
    geographie: `❓ [ÉVALUATION OBLIGATOIRE]\nAvant de changer de sujet, cite-moi un exemple concret lié à ${notion}.\n⚠️ *Cette étape est nécessaire pour continuer.*`,
    histoire: `❓ [ÉVALUATION OBLIGATOIRE]\nQuelle est, selon toi, la conséquence la plus importante de ${notion} ?\n⚠️ *Réponds d'abord à cette question.*`,
    math: `❓ [ÉVALUATION OBLIGATOIRE]\nExplique-moi avec tes mots la méthode pour résoudre un problème de "${notion}".\n⚠️ *Je dois vérifier que tu as compris avant d'avancer.*`,
    physique: `❓ [ÉVALUATION OBLIGATOIRE]\nComment pourrais-tu appliquer la notion de ${notion} dans la vie quotidienne ?\n⚠️ *Ta réponse est attendue.*`,
    chimie: `❓ [ÉVALUATION OBLIGATOIRE]\nQuelle erreur fréquente un élève pourrait-il commettre sur ${notion} ?\n⚠️ *Réponds-moi d'abord.*`,
    francais: `❓ [ÉVALUATION OBLIGATOIRE]\nDonne-moi un exemple de phrase qui illustre la règle de ${notion}.\n⚠️ *Cette réponse est obligatoire.*`,
    general: `❓ [ÉVALUATION OBLIGATOIRE]\nRésume avec tes mots l'idée principale de ${notion}.\n⚠️ *J'attends ta réponse pour continuer.*`,
  };
  return modeles[matiere] || modeles.general;
}

function forcerEvaluationObligatoire(texte = "", question = "", sujet = "") {
  if (!texte) return texte;
  let t = String(texte);
  t = t.replace(/\[CONSOLIDATION\]/gi, "[ÉVALUATION OBLIGATOIRE]");
  t = t.replace(/CONSOLIDATION/gi, "ÉVALUATION OBLIGATOIRE");

  if (!t.includes("[ÉVALUATION OBLIGATOIRE]")) {
    const notion = sujet || extraireSujetMemoire(question) || "cette notion";
    const blocEval = `\n\n${construireQuestionEvaluationForte( question, t, notion )}`;
    if (t.includes("***«")) t = t.replace(/\n\n\*\*\*«/, `${blocEval}\n\n***«`);
    else if (t.includes("🌟")) t = t.replace(/\n\n🌟/, `${blocEval}\n\n🌟`);
    else t = t + blocEval;
  }

  if (t.includes("[ÉVALUATION OBLIGATOIRE]") && !t.includes("⚠️")) {
    t = t.replace(
      /(\[ÉVALUATION OBLIGATOIRE\][^\n]*\n)([^\n]*)/,
      "$1$2\n⚠️ *Réponds à cette question avant de continuer.*"
    );
  }
  return t;
}

function choisirCitationFinale(question = "", corps = "") {
  const matiere = detecterMatierePrincipale(question, corps);
  const citationsMixtes = {
    droit:
      "***« Un droit compris est un droit mieux défendu, pour soi et pour la nation. »***",
    geographie:
      "***« Connaître les communes de sa ville, c'est déjà participer à la vie de la cité. »***",
    histoire:
      "***« Comprendre le passé de son pays, c'est honorer ceux qui l'ont bâti. »***",
    math: "***« Un esprit rigoureux en mathématiques est un esprit prêt à servir avec précision. »***",
    physique:
      "***« La physique nous apprend à observer le monde ; la citoyenneté, à l'améliorer. »***",
    chimie:
      "***« La chimie transforme la matière, la détermination transforme le pays. »***",
    francais:
      "***« Maîtriser sa langue, c'est porter haut la culture de sa nation. »***",
    general:
      "***« Apprendre aujourd'hui, c'est bâtir un Congo plus fort demain. »***",
  };
  return citationsMixtes[matiere] || citationsMixtes.general;
}

function choisirCitationContextuelle(reponse = "", question = "") {
  const matiere = detecterMatierePrincipale(question, reponse);
  if (estMessageRelationnelSimple(question)) return "";
  if (matiere === "droit") return pick(CITATIONS.civisme);
  if (matiere === "geographie") return pick(CITATIONS.geographie);
  if (matiere === "histoire") return pick(CITATIONS.histoire);
  if (matiere === "math") return pick(CITATIONS.mathematiques);
  if (matiere === "physique" || matiere === "chimie")
    return pick(CITATIONS.sciences);
  if (matiere === "francais") return pick(CITATIONS.francais);
  return pick(CITATIONS.general);
}

function verifierStructureMwalimu( corps = "", user = {}, historique = [], question = "" ) {
  let t = String(corps || "").trim();
  const aVecu = /🔵\s*\[VÉCU\]/i.test(t);
  const aSavoir = /🟡\s*\[SAVOIR\]/i.test(t);
  const aInspiration = /🔴\s*\[INSPIRATION\]/i.test(t);
  const aEvaluation = /❓\s*\[(?:CONSOLIDATION|ÉVALUATION OBLIGATOIRE)\]/i.test(
    t
  );
  if (aVecu && aSavoir && aInspiration && aEvaluation) return t;
  const vecu = aVecu ? "" : construireVecuNaturel(user, question, historique);
  const savoir = aSavoir
    ? ""
    : "🟡 [SAVOIR] : Voici l'idée essentielle à retenir.";
  const inspiration = aInspiration
    ? ""
    : "🔴 [INSPIRATION] : Une notion bien comprise te rend plus solide.";
  const evaluation = aEvaluation
    ? ""
    : "❓ [ÉVALUATION OBLIGATOIRE] : Dis-moi maintenant ce que tu retiens.\n⚠️ *Réponds à cette question avant de continuer.*";
  const morceaux = [];
  if (!aVecu) morceaux.push(vecu);
  morceaux.push(t);
  if (!aSavoir) morceaux.push(savoir);
  if (!aInspiration) morceaux.push(inspiration);
  if (!aEvaluation) morceaux.push(evaluation);
  return morceaux
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function choisirOuvertureContextuelle(reponse = "", _user = {}, question = "") {
  if (estMessageRelationnelSimple(question)) return "";
  return "👉 Réponds à la question d'évaluation ci-dessus, puis nous pourrons continuer.";
}

function choisirEncouragementContextuel(reponse = "", question = "") {
  if (estMessageRelationnelSimple(question)) return "";
  return "🌟 Mot d'encouragement : Avance pas à pas ; comprendre calmement vaut mieux que se précipiter.";
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
  return resultat
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

/* ========================================================= 9) DB ET QUESTIONS EN ATTENTE ========================================================= */
async function ensureBibliothequeSearchInfra() {
  await pool.query(
    `ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS search_vector tsvector;`
  );
  await pool.query(` CREATE OR REPLACE FUNCTION bibliotheque_search_vector_update() RETURNS trigger AS $$ BEGIN NEW.search_vector := setweight(to_tsvector('simple', unaccent(coalesce(NEW.titre, ''))), 'A') || setweight(to_tsvector('simple', unaccent(coalesce(NEW.matiere, ''))), 'A') || setweight(to_tsvector('simple', unaccent(coalesce(NEW.classe, ''))), 'B') || setweight(to_tsvector('simple', unaccent(coalesce(NEW.mots_cles, ''))), 'A') || setweight(to_tsvector('simple', unaccent(coalesce(NEW.contenu, ''))), 'B') || setweight(to_tsvector('simple', unaccent(coalesce(NEW.commentaire_ai, ''))), 'C'); RETURN NEW; END $$ LANGUAGE plpgsql; `);
  await pool.query(
    `DROP TRIGGER IF EXISTS trg_bibliotheque_search_vector_update ON bibliotheque;`
  );
  await pool.query(` CREATE TRIGGER trg_bibliotheque_search_vector_update BEFORE INSERT OR UPDATE OF titre, matiere, classe, mots_cles, contenu, commentaire_ai ON bibliotheque FOR EACH ROW EXECUTE FUNCTION bibliotheque_search_vector_update(); `);
  await pool.query(
    `UPDATE bibliotheque SET search_vector = setweight(to_tsvector('simple', unaccent(coalesce(titre, ''))), 'A') || setweight(to_tsvector('simple', unaccent(coalesce(matiere, ''))), 'A') || setweight(to_tsvector('simple', unaccent(coalesce(classe, ''))), 'B') || setweight(to_tsvector('simple', unaccent(coalesce(mots_cles, ''))), 'A') || setweight(to_tsvector('simple', unaccent(coalesce(contenu, ''))), 'B') || setweight(to_tsvector('simple', unaccent(coalesce(commentaire_ai, ''))), 'C') WHERE search_vector IS NULL;`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_bibliotheque_search_vector ON bibliotheque USING GIN (search_vector);`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_bibliotheque_updated_at ON bibliotheque (updated_at DESC);`
  );
}

async function initDB() {
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS unaccent;");
    await pool.query(
      `CREATE TABLE IF NOT EXISTS processed_messages (msg_id TEXT PRIMARY KEY, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS conversations (phone TEXT PRIMARY KEY, nom TEXT DEFAULT '', classe TEXT DEFAULT '', reve TEXT DEFAULT '', historique JSONB DEFAULT '[]'::jsonb, reminders_enabled BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS bibliotheque (id SERIAL PRIMARY KEY, titre TEXT, matiere TEXT, classe TEXT, mots_cles TEXT, contenu TEXT, commentaire_ai TEXT DEFAULT '', source_type TEXT DEFAULT 'db', source_url TEXT DEFAULT '', provenance TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS unanswered_questions (id SERIAL PRIMARY KEY, phone TEXT DEFAULT '', question TEXT NOT NULL, msg_type TEXT DEFAULT 'text', classe TEXT DEFAULT '', nom TEXT DEFAULT '', reason TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`
    );
    await pool.query(
      `CREATE TABLE IF NOT EXISTS student_attempts (id SERIAL PRIMARY KEY, phone TEXT NOT NULL, sujet TEXT DEFAULT '', question TEXT DEFAULT '', attempts_count INT DEFAULT 0, last_user_answer TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`
    );
    await pool.query(` CREATE TABLE IF NOT EXISTS pending_questions ( id SERIAL PRIMARY KEY, phone TEXT NOT NULL, question TEXT NOT NULL, matiere TEXT DEFAULT 'general', sujet TEXT DEFAULT '', asked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, resolved BOOLEAN DEFAULT FALSE, UNIQUE(phone) ); `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_processed_messages_created_at ON processed_messages (created_at DESC);`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_unanswered_questions_created_at ON unanswered_questions (created_at DESC);`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_student_attempts_phone_sujet_updated ON student_attempts (phone, sujet, updated_at DESC);`
    );
    await pool.query(
      `CREATE INDEX IF NOT EXISTS idx_pending_questions_phone ON pending_questions (phone);`
    );
    await ensureBibliothequeSearchInfra();
    logInfo("db_ready");
  } catch (e) {
    logError("init_db", e);
    process.exit(1);
  }
}

async function getUser(phone) {
  const { rows } = await pool.query(
    "SELECT * FROM conversations WHERE phone = $1",
    [phone]
  );
  return rows[0] || null;
}

async function createUser(phone) {
  await pool.query(
    `INSERT INTO conversations (phone, nom, classe, reve, historique, reminders_enabled) VALUES ($1, '', '', '', '[]'::jsonb, TRUE) ON CONFLICT (phone) DO NOTHING`,
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
    reminders_enabled: "reminders_enabled",
  };
  const safeField = fieldMap[field];
  if (!safeField) throw new Error("Champ non autorisé");
  await pool.query(
    `UPDATE conversations SET ${safeField} = $1, updated_at = NOW() WHERE phone = $2`,
    [value, phone]
  );
}

async function appendHistorique(phone, role, content) {
  const nouvelElement = {
    role,
    content: tronquerTexte(content, 2500),
    ts: new Date().toISOString(),
  };
  await pool.query(
    `UPDATE conversations SET historique = (SELECT COALESCE(jsonb_agg(value ORDER BY ord), '[]'::jsonb) FROM (SELECT value, ord FROM jsonb_array_elements(COALESCE(historique, '[]'::jsonb) || $1::jsonb) WITH ORDINALITY AS arr(value, ord) ORDER BY ord DESC LIMIT 12) t), updated_at = NOW() WHERE phone = $2`,
    [JSON.stringify([nouvelElement]), phone]
  );
  const user = await getUser(phone);
  return Array.isArray(user?.historique)
    ? user.historique
    : safeJsonParse(user?.historique, []);
}

async function getStudentAttempt(phone, sujet = "") {
  const { rows } = await pool.query(
    `SELECT * FROM student_attempts WHERE phone = $1 AND sujet = $2 ORDER BY updated_at DESC LIMIT 1`,
    [phone, sujet]
  );
  return rows[0] || null;
}

async function saveStudentAttempt( phone, sujet = "", question = "", lastUserAnswer = "" ) {
  const existing = await getStudentAttempt(phone, sujet);
  if (!existing) {
    await pool.query(
      `INSERT INTO student_attempts (phone, sujet, question, attempts_count, last_user_answer, updated_at) VALUES ($1, $2, $3, 1, $4, NOW())`,
      [phone, sujet, question, lastUserAnswer]
    );
    return 1;
  }
  const nextCount = Number(existing.attempts_count || 0) + 1;
  await pool.query(
    `UPDATE student_attempts SET attempts_count = $1, question = $2, last_user_answer = $3, updated_at = NOW() WHERE id = $4`,
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

// --- Questions en attente ---
async function getPendingQuestion(phone) {
  const { rows } = await pool.query(
    "SELECT * FROM pending_questions WHERE phone = $1 AND resolved = FALSE ORDER BY asked_at DESC LIMIT 1",
    [phone]
  );
  return rows[0] || null;
}

async function setPendingQuestion(phone, question, matiere, sujet) {
  await pool.query(
    "UPDATE pending_questions SET resolved = TRUE WHERE phone = $1 AND resolved = FALSE",
    [phone]
  );
  await pool.query(
    `INSERT INTO pending_questions (phone, question, matiere, sujet) VALUES ($1, $2, $3, $4) ON CONFLICT (phone) DO UPDATE SET question = $2, matiere = $3, sujet = $4, asked_at = NOW(), resolved = FALSE`,
    [phone, tronquerTexte(question, 2000), matiere, sujet]
  );
}

async function resolvePendingQuestion(phone) {
  await pool.query(
    "UPDATE pending_questions SET resolved = TRUE WHERE phone = $1 AND resolved = FALSE",
    [phone]
  );
}

function estReponseAQuestionEnAttente(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;
  if (estMessagePurementSocial(texte)) return false;
  if (estMessageSalutation(texte)) return false;
  if (estMessageRemerciement(texte)) return false;
  if (estAccuseReceptionSimple(texte)) return false;
  if (t.length < 10) return false;

  const indicesReponse = [
    "j'ai trouvé",
    "jai trouvé",
    "voici",
    "ma réponse",
    "ma reponse",
    "j'obtiens",
    "j'ai obtenu",
    "le résultat",
    "le resultat",
    "ça donne",
    "je pense que",
    "selon moi",
    "d'après moi",
    "je crois que",
    "à mon avis",
    "a mon avis",
  ];
  if (indicesReponse.some((i) => t.includes(i))) return true;
  if (
    t.length > 40 &&
    /\b(est|sont|a|ont|fait|font|donne|donnent|égale|egale|signifie|correspond|représente|represente|parce que|car|donc)\b/.test(
      t
    )
  )
    return true;
  if (/\d/.test(t) && t.length > 10) return true;
  return false;
}

function extraireQuestionEvaluation(texte = "") {
  const t = String(texte || "");
  const match = t.match(
    /❓\s*\[(?:CONSOLIDATION|ÉVALUATION OBLIGATOIRE)\]\s*\n?([\s\S]*?)(?=\n\n👉|\n\n🌟|\n\n\*\*\*«|$)/i
  );
  if (match && match[1]) {
    return match[1]
      .trim()
      .replace(/⚠️\s*\*.*?\*\s*/g, "")
      .trim();
  }
  return null;
}

function construireRappelQuestionNonRepondue(pendingQuestion, user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  const questionTexte = pendingQuestion.question || "";
  return `⛔ **${prenom}**, tu n'as pas encore répondu à ma question.\n\n📝 *Question en attente :*\n${questionTexte}\n\n🟡 *Rappel :* Avant de continuer le cours, tu dois répondre à cette question.\n✅ Même une réponse partielle ou une tentative me suffit.\n👉 *Envoie-moi ta réponse maintenant.*`;
}

function construireRappelForceAccuseReception(pendingQuestion, user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  const questionTexte = pendingQuestion.question || "";
  return `⛔ **${prenom}**, un simple "d'accord" ne suffit pas pour valider la leçon.\n\n📝 *Question en attente :*\n${questionTexte}\n\n🟡 *J'ai besoin que tu me montres que tu as compris.*\nMême une réponse partielle ou une tentative me suffit.\n👉 *Essaie de répondre à la question.*`;
}

async function enregistrerQuestionEvaluation( reponse, phone, question, matiere, sujet ) {
  const questionEval = extraireQuestionEvaluation(reponse);
  if (questionEval)
    await setPendingQuestion(phone, questionEval, matiere, sujet);
}

/* ========================================================= 10) SÉCURITÉ WEBHOOK ========================================================= */
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

/* ========================================================= 11) WHATSAPP ========================================================= */
async function envoyerWhatsApp(to, texte) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: tronquerTexte(texte, 3900) },
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
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
        typing_indicator: { type: "text" },
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );
  } catch (e) {
    logWarn("typing_indicator_error", {
      message: e?.message || "",
      data: e?.response?.data || null,
    });
  }
}

async function recupererMetaMediaInfo(mediaId) {
  const r = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 15000,
  });
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
    validateStatus: (s) => s >= 200 && s < 300,
  });
  const contentType = String(
    response.headers["content-type"] ||
      mediaInfo?.mime_type ||
      "application/octet-stream"
  ).toLowerCase();
  const contentLength = Number(
    response.headers["content-length"] || response.data?.byteLength || 0
  );
  if (contentLength > maxBytes) throw new Error("Fichier trop volumineux");
  return { buffer: Buffer.from(response.data), mimeType: contentType };
}

/* ========================================================= 12) IA ========================================================= */
async function consulterBibliotheque(question = "", classe = "") {
  try {
    const termes = String(question || "").trim();
    if (!termes) return null;
    const motifClasse = `%${classe}%`;
    const { rows } = await pool.query(
      `SELECT id, titre, matiere, classe, mots_cles, contenu, commentaire_ai, source_type, source_url, provenance, created_at, updated_at, ts_rank(search_vector, plainto_tsquery('simple', unaccent($1))) AS score FROM bibliotheque WHERE search_vector @@ plainto_tsquery('simple', unaccent($1)) AND ($2 = '' OR unaccent(lower(coalesce(classe, ''))) LIKE unaccent(lower($3))) ORDER BY score DESC, updated_at DESC, id DESC LIMIT 1`,
      [termes, classe || "", motifClasse]
    );
    return rows[0] || null;
  } catch (e) {
    logError("consulter_bibliotheque", e);
    return null;
  }
}

function construireSystemPrompt(user) {
  const appelEleve = construireAppelNaturel(user);
  const classe = user?.classe
    ? `Classe de l'élève : ${user.classe}`
    : "Classe non précisée";
  const reve = user?.reve
    ? `Rêve de l'élève : ${user.reve}`
    : "Rêve non précisé";
  return `${SYSTEM_BASE}\n${SYSTEM_TUTORAT}\n${SYSTEM_JURIDIQUE_WEB}\n${SYSTEM_GEO_WEB}\n\nPERSONNALISATION :\n- Adresse l'élève naturellement ainsi : ${appelEleve}\n- ${classe}\n- ${reve}\n\nRAPPEL FINAL : Le mot CONSOLIDATION est INTERDIT. Utilise [ÉVALUATION OBLIGATOIRE].`;
}

function toGeminiContents(messages = []) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content) }],
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
    tools: [{ googleSearch: {} }],
  });
  const result = await genererAvecRetry(model, {
    contents,
    generationConfig: { temperature: 0.1 },
  });
  return result.response.text();
}

async function appelerJsonStrict({ systemInstruction = "", prompt = "", schema = null, history = [], inlineParts = [], }) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction,
  });
  const result = await genererAvecRetry(model, {
    contents: [
      ...toGeminiContents(history),
      { role: "user", parts: [{ text: prompt }, ...inlineParts] },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      ...(schema ? { responseSchema: schema } : {}),
    },
  });
  return extraireJsonGemini(result.response.text());
}

async function chercherContexteWeb(question = "", user = {}, historique = []) {
  const system = construireSystemPrompt(user);
  const reponse = await safeAI(
    () =>
      appelerChatCompletion([
        { role: "system", content: system },
        {
          role: "system",
          content: `MISSION WEB :\n- Utilise Google Search\n- Donne un CONTEXTE WEB BRUT, court, clair et factuel\n- Pas de structure VÉCU/SAVOIR/INSPIRATION/ÉVALUATION`,
        },
        ...historique.slice(-4),
        {
          role: "user",
          content: `QUESTION :\n${question}\nDonne un contexte web brut et précis.`,
        },
      ]),
    ""
  );
  return String(reponse || "").trim();
}

async function detecterIntentionIA(user, texte = "", historique = []) {
  const system = `${construireSystemPrompt( user )}\nMODE CLASSIFICATION STRICTE :\n- Réponds uniquement en JSON valide\n- intention possible : salutation, remerciement, social, detente, question_normale, exercice, soumission_reponse, audio, image, juridique, geographie_rdc\n- matiere possible : math, physique, chimie, general\n- besoinCorrectionRenforcee doit être true ou false\n- sujet doit être court`;
  const fallback = {
    intention: "question_normale",
    matiere: detecterMatiereScientifique(texte, "", null),
    besoinCorrectionRenforcee: false,
    sujet: extraireSujetMemoire(texte) || "general",
  };
  try {
    const parsed = await appelerJsonStrict({
      systemInstruction: system,
      prompt: `Analyse ce message et classe-le.\n\nMESSAGE :\n${texte}`,
      schema: JSON_SCHEMA_INTENTION,
      history: historique.slice(-3),
    });
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      intention: String(parsed.intention || fallback.intention),
      matiere: String(parsed.matiere || fallback.matiere),
      besoinCorrectionRenforcee: Boolean(parsed.besoinCorrectionRenforcee),
      sujet: String(parsed.sujet || fallback.sujet),
    };
  } catch (e) {
    logError("detecter_intention_ia", e);
    return fallback;
  }
}

async function construireConsigneAntiBoucle( user, texteUtilisateur = "", historique = [] ) {
  const analyse = await detecterIntentionIA(user, texteUtilisateur, historique);
  const sujet =
    analyse.sujet || extraireSujetMemoire(texteUtilisateur) || "general";
  if (
    analyse.intention !== "soumission_reponse" &&
    !estSoumissionReponse(texteUtilisateur)
  ) {
    return { sujet, tentative: 0, consigne: "" };
  }
  const tentative = await saveStudentAttempt(
    user.phone,
    sujet,
    texteUtilisateur,
    texteUtilisateur
  );
  if (tentative < 3)
    return {
      sujet,
      tentative,
      consigne:
        "L'élève a proposé une réponse. Corrige avec douceur sans donner tout de suite la solution complète.",
    };
  return {
    sujet,
    tentative,
    consigne:
      "L'élève s'est probablement trompé plusieurs fois. Simplifie davantage, découpe en très petites étapes et donne un indice plus fort.",
  };
}

async function construireReponseDbWebIa( user, questionEleve, historique = [], fiche = null, consignePedagogique = "" ) {
  let contexteWeb = "";
  const utiliserWeb = fautChercherSurWeb(questionEleve, fiche);
  if (utiliserWeb)
    contexteWeb = await chercherContexteWeb(questionEleve, user, historique);
  const blocWeb = contexteWeb
    ? `CONTEXTE WEB :\n${contexteWeb}`
    : `CONTEXTE WEB : Aucune information web utile.`;
  const blocDB = fiche
    ? `CONTEXTE DB :\nTitre : ${fiche?.titre || ""}\nContenu :\n${ fiche?.contenu || "" }`
    : `CONTEXTE DB : Aucune fiche locale.`;
  const REPONSE_FALLBACK = `🔵 [VÉCU] : J'ai bien reçu ta demande.\n🟡 [SAVOIR] : Je n'ai pas encore pu produire une réponse claire.\n🔴 [INSPIRATION] : Ce n'est pas un problème.\n❓ [ÉVALUATION OBLIGATOIRE]\nReformule ta question en une seule phrase.\n⚠️ *Réponds à cette question avant de continuer.*`;

  return await safeAI(
    () =>
      appelerChatCompletion([
        { role: "system", content: construireSystemPrompt(user) },
        {
          role: "system",
          content: `INSTRUCTION CRITIQUE : Tu dois terminer ta réponse pédagogique par EXACTEMENT ce format :\n❓ [ÉVALUATION OBLIGATOIRE]\n[ta question]\n⚠️ *Réponds à cette question avant de continuer.*\nLe mot CONSOLIDATION est INTERDIT. Utilise [ÉVALUATION OBLIGATOIRE].`,
        },
        {
          role: "system",
          content: consignePedagogique || "Sois pédagogique et clair.",
        },
        ...historique.slice(-5),
        {
          role: "user",
          content: `QUESTION :\n${questionEleve}\n${blocWeb}\n${blocDB}\n\nRÉPONDS avec une ÉVALUATION OBLIGATOIRE à la fin.`,
        },
      ]),
    REPONSE_FALLBACK
  );
}

async function construireReponseSocialeIa( user, texteUtilisateur, historique = [] ) {
  const prenom = premierPrenom(user?.nom || "");
  const system = `Tu es Mwalimu EdTech en MODE SOCIAL. Tu échanges avec un élève nommé ${prenom}. Réponds comme un mentor proche, humain, calme et bienveillant. Règles strictes : - Pas de structure pédagogique. - N'écris jamais VÉCU, SAVOIR, INSPIRATION, ÉVALUATION, CONSOLIDATION. - Pas de citation patriotique. - Réponse courte : 1 à 4 phrases maximum. - Tu peux parler de détente, humeur, fatigue, stress léger, foot, musique, journée, motivation légère, blagues propres. - Reste adapté à un élève : pas de romance, pas de contenu sexuel, pas de violence graphique, pas de conseils dangereux. - Si l'élève pose finalement une question scolaire, dis-lui simplement qu'on peut passer au cours et invite-le à poser la question clairement.`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: system,
  });
  return await safeAI(async () => {
    const formattedHistory = historique
      .slice(-6)
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content) }],
      }));
    const r = await genererAvecRetry(model, {
      contents: [
        ...formattedHistory,
        { role: "user", parts: [{ text: texteUtilisateur }] },
      ],
      generationConfig: { temperature: 0.4 },
    });
    return r.response.text();
  }, construireReponseSocialeDirecte(user, texteUtilisateur));
}

async function analyserAudioCourt( user, audioBuffer, mimeType, historique = [] ) {
  const systemInstruction = `${construireSystemPrompt( user )}\nMODE ANALYSE AUDIO COURT :\n- Réponds UNIQUEMENT en JSON valide\n- type: "social" ou "pedagogique" ou "incompris"`;
  try {
    const parsed = await appelerJsonStrict({
      systemInstruction,
      prompt: "Analyse cet audio.",
      schema: JSON_SCHEMA_AUDIO,
      history: historique.slice(-2),
      inlineParts: [
        { inlineData: { mimeType, data: audioBuffer.toString("base64") } },
      ],
    });
    if (!parsed || typeof parsed !== "object")
      return { transcription: "", type: "incompris" };
    return {
      transcription: String(parsed.transcription || "").trim(),
      type: String(parsed.type || "incompris")
        .trim()
        .toLowerCase(),
    };
  } catch (e) {
    logError("analyser_audio_court", e);
    return { transcription: "", type: "incompris" };
  }
}

async function reponseAudioUneSeulePasse( user, audioBuffer, mimeType, historique = [], fiche = null ) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${construireSystemPrompt( user )}\nMODE AUDIO :\n- Si social : une phrase courte sans structure pédagogique\n- Si pédagogique : termine par ❓ [ÉVALUATION OBLIGATOIRE]`,
    tools: [{ googleSearch: {} }],
  });
  const formattedHistory = historique
    .slice(-4)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content) }],
    }));
  return await safeAI(async () => {
    const r = await genererAvecRetry(model, {
      contents: [
        ...formattedHistory,
        {
          role: "user",
          parts: [
            { text: "Analyse cet audio et réponds." },
            { inlineData: { mimeType, data: audioBuffer.toString("base64") } },
          ],
        },
      ],
      generationConfig: { temperature: 0.2 },
    });
    return r.response.text();
  }, "");
}

async function expliquerImageAvecIA( user, base64Image, mimeType, historique = [] ) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${construireSystemPrompt( user )}\nMODE IMAGE :\n- Commence par : "J'ai bien reçu ton image."\n- Termine par ❓ [ÉVALUATION OBLIGATOIRE]`,
    tools: [{ googleSearch: {} }],
  });
  const contents = [
    ...historique
      .slice(-4)
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content) }],
      })),
    {
      role: "user",
      parts: [
        {
          text: "Analyse cette image. Termine par ❓ [ÉVALUATION OBLIGATOIRE].",
        },
        { inlineData: { mimeType, data: base64Image } },
      ],
    },
  ];
  return await safeAI(async () => {
    const r = await genererAvecRetry(model, {
      contents,
      generationConfig: { temperature: 0.2 },
    });
    return r.response.text();
  }, "");
}

function estMimeImageSupporte(mimeType = "") {
  const allowed = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/heic",
    "image/heif",
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
    "audio/amr",
  ];
  return allowed.includes(String(mimeType || "").toLowerCase());
}

function ficheEstFaible(fiche = null) {
  if (!fiche) return true;
  const contenu = String(fiche?.contenu || "").trim();
  return contenu.length < 80;
}

function estQuestionGeographieRDC(question = "", fiche = null) {
  const t = `${question} ${fiche?.matiere || ""}`.toLowerCase();
  return /rdc|congo|province|territoire|commune|ville|haut.katanga|géographie|geographie/i.test(
    t
  );
}

function fautChercherSurWeb(question = "", fiche = null) {
  const q = String(question || "")
    .toLowerCase()
    .trim();
  if (!q || estMessageRelationnelSimple(q)) return false;
  if (
    fiche &&
    !ficheEstFaible(fiche) &&
    !estQuestionGeographieRDC(question, fiche)
  )
    return false;
  const casWeb = [
    "loi",
    "code",
    "article",
    "constitution",
    "juridique",
    "droit",
    "ohada",
    "impôt",
    "impot",
    "taxe",
    "tribunal",
    "géographie",
    "geographie",
    "rdc",
    "congo",
    "province",
    "territoire",
    "commune",
    "ville",
    "haut-katanga",
    "haut katanga",
    "actualité",
    "actualite",
    "récent",
    "recent",
    "aujourd'hui",
    "histoire",
    "date",
    "indépendance",
    "independance",
  ];
  return casWeb.some((m) => q.includes(m)) || !fiche || ficheEstFaible(fiche);
}

function typeMessage(msg) {
  if (!msg) return "unknown";
  if (msg.text?.body) return "text";
  if (msg.audio) return "audio";
  if (msg.image) return "image";
  if (msg.document) return "document";
  return msg.type || "unknown";
}

function messageTypeLisible(msgType = "message") {
  if (msgType === "audio") return "ton audio";
  if (msgType === "image") return "ton image";
  if (msgType === "text") return "ton message écrit";
  return "ton message";
}

/* ========================================================= 13) TRAITEMENT ========================================================= */
function estQuestionAcademique(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t || t.length < 10 || estMessagePurementSocial(texte)) return false;
  const motsAcademiques = [
    "explique",
    "c'est quoi",
    "c est quoi",
    "comment faire",
    "pourquoi",
    "quand",
    "qui",
    "combien",
    "math",
    "maths",
    "equation",
    "équation",
    "calcul",
    "physique",
    "chimie",
    "histoire",
    "geographie",
    "géographie",
    "francais",
    "français",
    "grammaire",
    "droit",
    "loi",
    "article",
    "constitution",
    "province",
    "territoire",
    "exercice",
    "probleme",
    "problème",
    "aide",
    "comprendre",
    "apprendre",
    "cours",
    "lecon",
    "leçon",
    "chapitre",
    "matiere",
    "matière",
    "examen",
    "revision",
    "révision",
  ];
  return motsAcademiques.some((mot) => t.includes(mot));
}

async function traiterTexte(user, texteUtilisateur, historique) {
  const pendingQuestion = await getPendingQuestion(user.phone);

  // =====================================================
  // 1) MODE SOCIAL DIRECT ET PRIORITAIRE
  // C'est ici que social et pédagogie sont réellement séparés.
  // =====================================================
  if (estMessagePurementSocial(texteUtilisateur)) {
    const typeSocial = classerMessageSocial(texteUtilisateur);
    const reponseSociale =
      typeSocial === "detente"
        ? await construireReponseSocialeIa(user, texteUtilisateur, historique)
        : construireReponseSocialeDirecte(user, texteUtilisateur);

    return {
      reponse: reponseSociale,
      fiche: null,
      bypassFormat: true,
    };
  }

  const conversationDemarree = historique.some(
    (m) => m.role === "user" && estQuestionAcademique(m.content || "")
  );

  if (
    !conversationDemarree &&
    !estQuestionAcademique(texteUtilisateur) &&
    !pendingQuestion
  ) {
    const prenom = premierPrenom(user?.nom || "");
    const relances = [
      `Je suis là pour t'aider **${prenom}** 😊 Tu veux travailler une matière ou simplement échanger un peu ?`,
      `**${prenom}**, je t'écoute 😊 Tu veux apprendre quelque chose ou parler un peu ?`,
    ];
    return { reponse: pick(relances), fiche: null, bypassFormat: true };
  }

  // QUESTION EN ATTENTE : seulement si le message n'est pas social.
  if (pendingQuestion) {
    const estReponse = estReponseAQuestionEnAttente(texteUtilisateur);
    const estSimple = estAccuseReceptionSimple(texteUtilisateur);
    const estSocial = estMessagePurementSocial(texteUtilisateur);

    if (estSocial || estSimple) {
      const rappel = estSimple
        ? construireRappelForceAccuseReception(pendingQuestion, user)
        : construireRappelQuestionNonRepondue(pendingQuestion, user);
      return { reponse: rappel, fiche: null, bypassFormat: true };
    }

    if (!estReponse) {
      const nouvelleMatiere = detecterMatierePrincipale(texteUtilisateur, "");
      const ancienneMatiere = pendingQuestion.matiere || "general";

      if (
        nouvelleMatiere !== ancienneMatiere &&
        nouvelleMatiere !== "general"
      ) {
        const prenom = premierPrenom(user?.nom || "");
        const nomsMatieres = {
          math: "mathématiques",
          physique: "physique",
          chimie: "chimie",
          droit: "droit",
          geographie: "géographie",
          histoire: "histoire",
          francais: "français",
          general: "général",
        };
        const rappelFerme = `⛔ **${prenom}**, je ne peux pas te laisser changer de matière sans valider la notion en cours.\n\n📝 *Question en attente (${ nomsMatieres[ancienneMatiere] || ancienneMatiere }) :*\n${ pendingQuestion.question }\n\n🟡 *Règle :* On valide une notion avant d'en commencer une autre.\n\n👉 *Réponds à cette question d'abord.*`;
        return { reponse: rappelFerme, fiche: null, bypassFormat: true };
      }

      const rappel = construireRappelQuestionNonRepondue(pendingQuestion, user);
      return { reponse: rappel, fiche: null, bypassFormat: true };
    }

    // Vraie réponse à la question en attente
    if (estReponse && !estSimple && !estSocial) {
      await resolvePendingQuestion(user.phone);
      const prenom = premierPrenom(user?.nom || "");
      const validationPreliminaire = `✅ Merci pour ta réponse, **${prenom}**. Je vérifie cela...\n\n`;

      const cacheKey = makeCacheKey(user, texteUtilisateur);
      const cached = getCache(cacheKey);
      if (cached)
        return {
          reponse: validationPreliminaire + cached,
          fiche: null,
          bypassFormat: false,
        };

      const fiche = await consulterBibliotheque(
        texteUtilisateur,
        user.classe || ""
      );
      const consigneFinale = `MODE CORRECTION : L'élève répond à une question d'évaluation. Corrige avec bienveillance. Termine IMPÉRATIVEMENT par ❓ [ÉVALUATION OBLIGATOIRE] avec ⚠️.`;
      const reponse = await construireReponseDbWebIa(
        user,
        texteUtilisateur,
        historique,
        fiche,
        consigneFinale
      );
      const messageComplet = validationPreliminaire + (reponse || "");

      if (reponse) {
        const sujet = extraireSujetMemoire(texteUtilisateur) || "general";
        await enregistrerQuestionEvaluation(
          reponse,
          user.phone,
          texteUtilisateur,
          "general",
          sujet
        );
      }
      return {
        reponse: messageComplet,
        fiche: fiche || null,
        bypassFormat: false,
      };
    }
  }

  // PAS de question en attente : pédagogie normale
  const cacheKey = makeCacheKey(user, texteUtilisateur);
  const cached = getCache(cacheKey);
  if (cached) return { reponse: cached, fiche: null, bypassFormat: false };

  const fiche = await consulterBibliotheque(
    texteUtilisateur,
    user.classe || ""
  );
  const consigneFinale = `MODE NORMAL : Termine IMPÉRATIVEMENT par ❓ [ÉVALUATION OBLIGATOIRE] avec ⚠️ *Réponds à cette question avant de continuer.*`;
  const reponse = await construireReponseDbWebIa(
    user,
    texteUtilisateur,
    historique,
    fiche,
    consigneFinale
  );

  if (reponse && String(reponse).trim()) setCache(cacheKey, reponse);
  const sujet = extraireSujetMemoire(texteUtilisateur) || "general";
  await enregistrerQuestionEvaluation(
    reponse,
    user.phone,
    texteUtilisateur,
    "general",
    sujet
  );
  return { reponse, fiche: fiche || null, bypassFormat: false };
}

function construireReponseHumaineSimple(user = {}, texte = "") {
  return construireReponseSocialeDirecte(user, texte);
}

async function traiterAudio(user, msg, historique) {
  const audioId = msg.audio?.id;
  if (!audioId)
    return {
      reponse: "Je n'arrive pas à lire ton audio.",
      fiche: null,
      bypassFormat: true,
    };

  const { buffer, mimeType } = await telechargerMedia(audioId, 8 * 1024 * 1024);
  if (!estMimeAudioSupporte(mimeType))
    return {
      reponse: "Format audio non supporté.",
      fiche: null,
      bypassFormat: true,
    };

  const analyse = await analyserAudioCourt(user, buffer, mimeType, historique);
  const transcription = String(analyse?.transcription || "").trim();
  const typeAudio = String(analyse?.type || "incompris")
    .trim()
    .toLowerCase();

  if (
    typeAudio === "social" ||
    (transcription && estMessagePurementSocial(transcription))
  ) {
    const typeSocial = classerMessageSocial(transcription || "bonjour");
    const reponseSociale =
      typeSocial === "detente"
        ? await construireReponseSocialeIa(
            user,
            transcription || "parlons un peu",
            historique
          )
        : construireReponseSocialeDirecte(user, transcription || "bonjour");
    return { reponse: reponseSociale, fiche: null, bypassFormat: true };
  }

  let reponse = await reponseAudioUneSeulePasse(
    user,
    buffer,
    mimeType,
    historique,
    null
  );
  if (!reponse || !reponse.trim())
    return {
      reponse: "Je n'arrive pas encore à analyser ton audio correctement.",
      fiche: null,
      bypassFormat: true,
    };

  if (reponse && !estReponseRelationnelleSimpleIA(reponse)) {
    await enregistrerQuestionEvaluation(
      reponse,
      user.phone,
      transcription || "",
      "general",
      extraireSujetMemoire(transcription || "")
    );
  }
  return {
    reponse,
    fiche: null,
    bypassFormat: estReponseRelationnelleSimpleIA(reponse),
  };
}

async function traiterImage(user, msg, historique) {
  const imageId = msg.image?.id;
  if (!imageId) {
    return {
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.\n🟡 [SAVOIR] : Mais je n'arrive pas à l'ouvrir.\n❓ [ÉVALUATION OBLIGATOIRE]\nRéessaie avec une image plus nette.\n⚠️ *Réponds avant de continuer.*`,
      fiche: null,
      bypassFormat: false,
    };
  }
  const { buffer, mimeType } = await telechargerMedia(imageId, 8 * 1024 * 1024);
  if (!estMimeImageSupporte(mimeType)) {
    return {
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.\n🟡 [SAVOIR] : Format non supporté.\n❓ [ÉVALUATION OBLIGATOIRE]\nEnvoie une image en JPG, PNG ou WEBP.\n⚠️ *Réponds avant de continuer.*`,
      fiche: null,
      bypassFormat: false,
    };
  }
  const base64Image = buffer.toString("base64");
  let reponse = await expliquerImageAvecIA(
    user,
    base64Image,
    mimeType,
    historique
  );
  if (!reponse || !String(reponse).trim()) {
    reponse = `🔵 [VÉCU] : J'ai bien reçu ton image.\n🟡 [SAVOIR] : Je n'arrive pas à l'analyser.\n❓ [ÉVALUATION OBLIGATOIRE]\nEnvoie une image plus nette.\n⚠️ *Réponds avant de continuer.*`;
  }
  if (reponse && !estReponseRelationnelleSimpleIA(reponse))
    await enregistrerQuestionEvaluation(
      reponse,
      user.phone,
      "",
      "general",
      "image"
    );
  return { reponse, fiche: null, bypassFormat: false };
}

/* ========================================================= 14) COMMANDES ========================================================= */
async function traiterCommandeTexte(from, _user, texteUtilisateur) {
  const cmd = String(texteUtilisateur || "")
    .trim()
    .toLowerCase();

  if (cmd === "/aide") {
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}\n📘 *Commandes*\n/aide\n/profil\n/reset\n/stop\n/start`
    );
    return true;
  }

  if (cmd === "/stop") {
    await updateUserField(from, "reminders_enabled", false);
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}\n────────────────\n🔵 Rappels du matin arrêtés.`
    );
    return true;
  }

  if (cmd === "/start") {
    await updateUserField(from, "reminders_enabled", true);
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}\n────────────────\n🔵 Rappels du matin réactivés.`
    );
    return true;
  }

  if (cmd === "/reset") {
    await pool.query(
      "UPDATE conversations SET historique = '[]'::jsonb, updated_at = NOW() WHERE phone = $1",
      [from]
    );
    await resetAllStudentAttempts(from);
    await resolvePendingQuestion(from);
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}\n────────────────\n🔵 Historique remis à zéro.\nTu peux maintenant m'envoyer ta question ou échanger simplement avec moi.`
    );
    return true;
  }

  if (cmd === "/profil") {
    await pool.query(
      "UPDATE conversations SET nom = '', classe = '', reve = '', historique = '[]'::jsonb, updated_at = NOW() WHERE phone = $1",
      [from]
    );
    await resetAllStudentAttempts(from);
    await resolvePendingQuestion(from);
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}\n────────────────\n🔄 Mise à jour du profil\n🟡 Quel est ton *prénom* ?`
    );
    return true;
  }

  return false;
}

/* ========================================================= 15) CRON ========================================================= */
cron.schedule(
  "0 7 * * *",
  async () => {
    try {
      const { rows } = await pool.query(
        `SELECT phone, nom FROM conversations WHERE coalesce(phone, '') <> '' AND coalesce(nom, '') <> '' AND coalesce(reminders_enabled, TRUE) = TRUE`
      );
      for (const eleve of rows) {
        try {
          const appel = `${genreEleve(eleve.nom)} **${premierPrenom( eleve.nom )}**`;
          const citation = pick(CITATIONS.patriotisme);
          const pending = await getPendingQuestion(eleve.phone);
          const rappelQuestion = pending
            ? `\n\n📝 *Rappel :* tu as une question en attente. Pense à y répondre aujourd'hui !`
            : "";
          const messageRappel = `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : Bonjour ${appel}.\n🟡 [SAVOIR] : Petit rappel du matin : avance avec calme et sérieux.${rappelQuestion}\n❓ [ÉVALUATION OBLIGATOIRE]\nQuelle matière veux-tu travailler aujourd'hui ?\n⚠️ *Réponds avant de continuer.*\n🌟 Mot d'encouragement : Un élève constant progresse.\n${citation}`;
          await envoyerWhatsApp(eleve.phone, messageRappel);
        } catch (e) {
          logError("cron_morning_reminder_user", e, {
            phone: eleve?.phone || "",
          });
        }
      }
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
      await pool.query(
        "DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '2 days'"
      );
      await pool.query(
        "DELETE FROM pending_questions WHERE resolved = TRUE AND asked_at < NOW() - INTERVAL '7 days'"
      );
    } catch (e) {
      logError("cron_cleanup", e);
    }
  },
  { timezone: "Africa/Lubumbashi" }
);

/* ========================================================= 16) PIPELINE PRINCIPAL ========================================================= */
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
    preview: texteUtilisateur.slice(0, 80),
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
      `${HEADER_MWALIMU}\n────────────────\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.\n🟡 Quel est ton *prénom* ?`
    );
    return;
  }

  if (msgType === "text") {
    const commandeTraitee = await traiterCommandeTexte(
      from,
      user,
      texteUtilisateur
    );
    if (commandeTraitee) return;
  }

  if (!user.nom) {
    const nom = normaliserNom(nettoyer(texteUtilisateur));
    if (!nom) {
      await envoyerWhatsApp(
        from,
        `${HEADER_MWALIMU}\n────────────────\n🟡 Donne-moi simplement ton *prénom*, s'il te plaît.`
      );
      return;
    }
    await updateUserField(from, "nom", nom);
    await envoyerWhatsApp(
      from,
      `🤝 Enchanté *${nom}* !\n🟡 En quelle *classe* es-tu ?`
    );
    return;
  }

  if (!user.classe) {
    const cl = normaliserNom(nettoyer(texteUtilisateur));
    if (!cl) {
      await envoyerWhatsApp(from, `🟡 Écris-moi ta *classe* simplement.`);
      return;
    }
    await updateUserField(from, "classe", cl);
    user = await getUser(from);
    await envoyerWhatsApp(
      from,
      `🟡 C'est bien noté, *${user.nom}*.\n❓ Quel est ton plus grand *rêve* professionnel ?`
    );
    return;
  }

  if (!user.reve) {
    const rv = normaliserNom(nettoyer(texteUtilisateur));
    if (!rv) {
      await envoyerWhatsApp(
        from,
        `❓ Dis-moi simplement ton *rêve* professionnel.`
      );
      return;
    }
    await updateUserField(from, "reve", rv);
    user = await getUser(from);
    await envoyerWhatsApp(
      from,
      `✨ *Quelle ambition magnifique !*\n🔵 Tu peux maintenant me poser une question de cours ou simplement échanger avec moi.`
    );
    return;
  }

  let historique = Array.isArray(user.historique)
    ? user.historique
    : safeJsonParse(user.historique, []);
  let contenuUtilisateurPourMemoire =
    texteUtilisateur || `[message ${msgType}]`;

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
    const resultat = await traiterTexte(
      { ...user, phone: from },
      texteUtilisateur,
      historique
    );
    reponseBrute = resultat?.reponse || "";
    ficheContexte = resultat?.fiche || null;
    bypassFormat = Boolean(resultat?.bypassFormat);
  } else if (msgType === "audio") {
    const resultat = await traiterAudio(
      { ...user, phone: from },
      msg,
      historique
    );
    reponseBrute = resultat?.reponse || "";
    ficheContexte = resultat?.fiche || null;
    bypassFormat = Boolean(resultat?.bypassFormat);
    contenuUtilisateurPourMemoire = "[audio envoyé]";
    await appendHistorique(from, "user", contenuUtilisateurPourMemoire);
  } else if (msgType === "image") {
    const resultat = await traiterImage(
      { ...user, phone: from },
      msg,
      historique
    );
    reponseBrute = resultat?.reponse || "";
    ficheContexte = resultat?.fiche || null;
    bypassFormat = Boolean(resultat?.bypassFormat);
    contenuUtilisateurPourMemoire = "[image envoyée]";
    await appendHistorique(from, "user", contenuUtilisateurPourMemoire);
  } else {
    reponseBrute = `🔵 [VÉCU] : J'ai bien reçu ton fichier.\n🟡 [SAVOIR] : Je ne peux pas encore analyser ce format.\n❓ [ÉVALUATION OBLIGATOIRE]\nEnvoie ton exercice par écrit ou en photo.\n⚠️ *Réponds avant de continuer.*`;
    bypassFormat = false;
  }

  // =====================================================
  // POST-TRAITEMENT FINAL GARANTI
  // Important : rien de pédagogique n'est ajouté si bypassFormat = true.
  // =====================================================
  let messageFinal = reponseBrute;

  if (!bypassFormat) {
    messageFinal = messageFinal.replace(
      /\[CONSOLIDATION\]/gi,
      "[ÉVALUATION OBLIGATOIRE]"
    );
    messageFinal = messageFinal.replace(
      /\bCONSOLIDATION\b/gi,
      "ÉVALUATION OBLIGATOIRE"
    );

    if (!messageFinal.includes("[ÉVALUATION OBLIGATOIRE]")) {
      const sujet =
        extraireSujetMemoire(
          texteUtilisateur || contenuUtilisateurPourMemoire
        ) || "cette notion";
      messageFinal = forcerEvaluationObligatoire(
        messageFinal,
        texteUtilisateur || "",
        sujet
      );
    }

    if (
      messageFinal.includes("[ÉVALUATION OBLIGATOIRE]") &&
      !messageFinal.includes("⚠️")
    ) {
      messageFinal = messageFinal.replace(
        /(\[ÉVALUATION OBLIGATOIRE\][^\n]*\n)([^\n]*)/,
        "$1$2\n⚠️ *Réponds à cette question avant de continuer.*"
      );
    }
  }

  messageFinal = supprimerFormulesLourdesDAppel(messageFinal, {
    ...user,
    phone: from,
  });
  messageFinal = nettoyerReponseIA(messageFinal);
  messageFinal = messageFinal.replace(/\n{3,}/g, "\n\n").trim();

  if (!bypassFormat && !messageFinal.includes(HEADER_MWALIMU)) {
    messageFinal = `${HEADER_MWALIMU}\n────────────────\n${messageFinal}`;
  }

  if (!bypassFormat && !messageFinal.includes("***«")) {
    const citation = choisirCitationFinale(
      texteUtilisateur || "",
      messageFinal
    );
    messageFinal = messageFinal + `\n${citation}`;
  }

  if (!bypassFormat && !messageFinal.includes("🌟")) {
    messageFinal =
      messageFinal +
      `\n${choisirEncouragementContextuel( messageFinal, texteUtilisateur || "" )}`;
  }

  if (!bypassFormat && !messageFinal.includes("👉")) {
    messageFinal =
      messageFinal +
      `\n${choisirOuvertureContextuelle( messageFinal, user, texteUtilisateur || "" )}`;
  }

  messageFinal = dedupeBlocFinal(messageFinal);

  logInfo("final_message_check", {
    socialBypass: bypassFormat,
    hasEvaluation: messageFinal.includes("[ÉVALUATION OBLIGATOIRE]"),
    hasConsolidation: messageFinal.includes("CONSOLIDATION"),
    hasWarning: messageFinal.includes("⚠️"),
  });

  if (!messageFinal || !messageFinal.trim()) {
    messageFinal = `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : J'ai bien reçu ${messageTypeLisible( msgType )}.\n🟡 [SAVOIR] : Je rencontre un petit souci technique.\n🔴 [INSPIRATION] : On peut reprendre avec calme.\n❓ [ÉVALUATION OBLIGATOIRE]\nRéessaie dans un instant.\n⚠️ *Réponds avant de continuer.*\n🌟 Mot d'encouragement : Nous pouvons reprendre calmement.\n${pick( CITATIONS.general )}`;
  }

  await appendHistorique(from, "assistant", messageFinal);
  await envoyerWhatsApp(from, messageFinal);
  logInfo("message_processed_success", {
    phone: from,
    msgId,
    durationMs: nowMs() - startedAt,
  });
}

/* ========================================================= 17) ENDPOINTS ========================================================= */
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
  // Si tu veux forcer la signature Meta, ajoute ENFORCE_META_SIGNATURE=true dans tes variables d'environnement.
  if (
    process.env.ENFORCE_META_SIGNATURE === "true" &&
    !verifierSignatureMeta(req)
  ) {
    logWarn("invalid_meta_signature");
    return res.sendStatus(403);
  }

  const msg = extraireMessageWhatsApp(req.body);
  if (!msg) return res.sendStatus(200);

  const from = msg.from;
  runSequentialByKey(from, async () => {
    try {
      await processIncomingMessage(msg);
    } catch (err) {
      logError("pipeline_processing_failure", err, {
        phone: from,
        msgId: msg.id,
      });
      try {
        const fallback = `${HEADER_MWALIMU}\n────────────────\n🔵 [VÉCU] : Une erreur est survenue.\n🟡 [SAVOIR] : Nous allons reprendre.\n❓ [ÉVALUATION OBLIGATOIRE]\nRéessaie d'envoyer ton message.\n⚠️ *Réponds avant de continuer.*\n🌟 Mot d'encouragement : Nous pouvons reprendre calmement.`;
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

/* ========================================================= 18) INITIALISATION ========================================================= */
(async () => {
  logInfo("api_starting");
  await initDB();
  app.listen(PORT, () => {
    logInfo("server_listening", { port: PORT });
  });
})();
