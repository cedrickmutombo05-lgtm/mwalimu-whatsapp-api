

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
  console.error("❌ Erreur PostgreSQL inattendue :", err.message);
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
   2) CONSTANTES
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

STYLE OBLIGATOIRE :
- Réponse claire, naturelle et brève
- Évite les répétitions
- Ne sois jamais bavard
- Ne félicite pas exagérément
- N'écris pas "bravo" sauf si l'élève a réellement bien répondu, corrigé juste ou fourni une bonne démarche
- Évite les compliments excessifs comme "future avocate" ou "œil de lynx" sauf si c'est vraiment utile
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

/* =========================================================
   3) OUTILS SIMPLES
========================================================= */
const cache = new Map();

function getCache(key) {
  return cache.get(key);
}

function setCache(key, value) {
  cache.set(key, value);
  setTimeout(() => cache.delete(key), 60000);
}

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

function construireAppel(user = {}) {
  const prenom = normaliserNom(user?.nom || "élève").split(" ")[0] || "élève";
  const styles = [
    `**${prenom}**`,
    `${prenom}`,
    `cher ${prenom}`,
    `mon ami`
  ];
  return pick(styles);
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

function estMessageRelationnelSimple(texte = "") {
  return (
    estMessageSalutation(texte) ||
    estMessageRemerciement(texte) ||
    estMessageCourtHumain(texte)
  );
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

function estQuestionSimpleDefinition(texte = "") {
  const t = normaliserTexteMemoire(texte);
  return (
    t.startsWith("qu est ce que ") ||
    t.startsWith("qu est ce qu ") ||
    t.startsWith("c est quoi ") ||
    t.startsWith("definis ") ||
    t.startsWith("definition ")
  );
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

    const contenu = String(item.content || "");
    if (
      contenu.includes("[audio envoyé]") ||
      contenu.includes("[audio]") ||
      contenu.includes("[image envoyée]") ||
      contenu.includes("[image]") ||
      contenu.includes("[message")
    ) {
      continue;
    }

    const ancien = extraireSujetMemoire(contenu);
    if (ancien && (ancien === actuel || contenu.toLowerCase().includes(actuel))) {
      return ancien;
    }
  }

  return "";
}

function construirePhraseRetourMemoire(historique = [], texteActuel = "", user = {}) {
  if (estMessageRelationnelSimple(texteActuel)) return "";
  if (estQuestionSimpleDefinition(texteActuel)) return "";

  const sujet = retrouverSujetProche(historique, texteActuel);
  const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";

  if (!sujet) return "";

  const sujetNet = String(sujet || "").toLowerCase().trim();
  if (
    sujetNet.includes("audio") ||
    sujetNet.includes("image") ||
    sujetNet.includes("document") ||
    sujetNet.includes("message")
  ) {
    return "";
  }

  return `🔵 [VÉCU] : Je suis content que tu reviennes sur ${sujet}, ${prenom}.`;
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

function nettoyerReponseIA(texte = "") {
  if (!texte) return "";
  let t = String(texte);
  t = t.replace(/🔴🟡🔵\s*\*?Mwalimu EdTech\s*:\s*Ton Mentor pour l'Excellence\*?\s*🇨🇩/gi, "");
  t = t.replace(/^\s*🌟\s*Mot d['’]encouragement\s*:\s*.*$/gim, "");
  t = t.replace(/^\s*👉\s*Je reste disponible.*$/gim, "");
  t = t.replace(/^\s*👉\s*Continue à me parler.*$/gim, "");
  return supprimerDoublonsLignes(t).replace(/\n{3,}/g, "\n\n").trim();
}

function nettoyerParasitesMemoire(texte = "") {
  return String(texte || "")
    .replace(/🔵\s*\[VÉCU\]\s*:\s*Je suis content que tu reviennes sur .*?\.\s*/gi, "")
    .replace(/🔵\s*\[VÉCU\]\s*:\s*Je suis heureux de continuer cet échange avec toi, .*?\.\s*/gi, "")
    .replace(/Prenons cela calmement et clairement\.\s*/gi, "")
    .replace(/\baudio envoy[eé]\b/gi, "")
    .replace(/\baudio\b/gi, (m, idx, str) => {
      const around = str.slice(Math.max(0, idx - 20), Math.min(str.length, idx + 20));
      if (/reviens sur/i.test(around)) return "";
      return m;
    })
    .replace(/\bimage envoy[ée]e?\b/gi, "")
    .trim();
}

function couperDoubleReponse(texte = "") {
  const t = String(texte || "").trim();
  const blocs = t.split(/(?=🔴🟡🔵)/g).filter(Boolean);
  if (blocs.length <= 1) return t;
  return blocs[0].trim();
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
  const t = `${reponse} ${question}`.toLowerCase();

  if (estMessageRelationnelSimple(question)) {
    return "";
  }

  if (t.includes("histoire")) {
    return pick(CITATIONS.histoire);
  }
  if (t.includes("loi") || t.includes("code") || t.includes("article") || t.includes("droit")) {
    return pick(CITATIONS.civisme);
  }
  if (
    t.includes("géographie") || t.includes("geographie") ||
    t.includes("territoire") || t.includes("province") ||
    t.includes("commune") || t.includes("ville")
  ) {
    return pick(CITATIONS.geographie);
  }
  if (
    t.includes("math") || t.includes("calcul") ||
    t.includes("équation") || t.includes("equation") ||
    t.includes("fraction") || t.includes("chimie")
  ) {
    return pick(CITATIONS.mathematiques);
  }
  if (t.includes("physique") || t.includes("science")) {
    return pick(CITATIONS.sciences);
  }

  return pick(CITATIONS.general);
}

function extraireBlocStructure(emoji = "🔵", label = "VÉCU", texte = "") {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${emoji}\\s*\\[${escaped}\\]\\s*:[\\s\\S]*?(?=\\n(?:🔵\\s*\\[VÉCU\\]|🟡\\s*\\[SAVOIR\\]|🔴\\s*\\[INSPIRATION\\]|❓\\s*\\[CONSOLIDATION\\]|👉 |🌟 |\\*\\*\\*«|$))`, "i");
  const match = String(texte || "").match(regex);
  return match ? match[0].trim() : "";
}

function contientStructureComplete(texte = "") {
  const t = String(texte || "");
  return (
    /🔵\s*\[VÉCU\]/i.test(t) &&
    /🟡\s*\[SAVOIR\]/i.test(t) &&
    /🔴\s*\[INSPIRATION\]/i.test(t) &&
    /❓\s*\[CONSOLIDATION\]/i.test(t)
  );
}

function normaliserStructureUnique(texte = "") {
  const t = String(texte || "").trim();
  if (!t) return "";

  const vecu = extraireBlocStructure("🔵", "VÉCU", t);
  const savoir = extraireBlocStructure("🟡", "SAVOIR", t);
  const inspiration = extraireBlocStructure("🔴", "INSPIRATION", t);
  const consolidation = extraireBlocStructure("❓", "CONSOLIDATION", t);

  if (!vecu && !savoir && !inspiration && !consolidation) return t;

  return [vecu, savoir, inspiration, consolidation]
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function verifierStructureMwalimu(corps = "", user = {}, historique = [], question = "") {
  let t = String(corps || "").trim();
  t = couperDoubleReponse(t);
  t = nettoyerParasitesMemoire(t);

  if (contientStructureComplete(t)) {
    return normaliserStructureUnique(t);
  }

  const aVecu = /🔵\s*\[VÉCU\]/i.test(t);
  const aSavoir = /🟡\s*\[SAVOIR\]/i.test(t);
  const aInspiration = /🔴\s*\[INSPIRATION\]/i.test(t);
  const aConsolidation = /❓\s*\[CONSOLIDATION\]/i.test(t);

  const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";
  const phraseRetour = construirePhraseRetourMemoire(historique, question, user);
  const vecu = aVecu ? "" : (phraseRetour || `🔵 [VÉCU] : Je suis heureux de t'aider, ${prenom}.`);
  const savoir = aSavoir ? "" : `🟡 [SAVOIR] : Voici l’idée essentielle à retenir.`;
  const inspiration = aInspiration ? "" : `🔴 [INSPIRATION] : Chaque notion bien comprise renforce ta confiance.`;
  const consolidation = aConsolidation ? "" : `❓ [CONSOLIDATION] : Dis-moi maintenant ce que tu retiens.`;

  const morceaux = [];
  if (!aVecu) morceaux.push(vecu);
  morceaux.push(t);
  if (!aSavoir) morceaux.push(savoir);
  if (!aInspiration) morceaux.push(inspiration);
  if (!aConsolidation) morceaux.push(consolidation);

  return normaliserStructureUnique(
    nettoyerParasitesMemoire(
      morceaux.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()
    )
  );
}

function detecterThemeConsolidation(question = "", corps = "") {
  const t = `${question} ${corps}`.toLowerCase();
  if (t.includes("histoire")) return "histoire";
  if (t.includes("territoire") || t.includes("province") || t.includes("rdc") || t.includes("congo") || t.includes("commune") || t.includes("ville")) return "geographie";
  if (t.includes("loi") || t.includes("code") || t.includes("article") || t.includes("ohada") || t.includes("tribunal") || t.includes("droit")) return "droit";
  if (t.includes("math") || t.includes("équation") || t.includes("fraction") || t.includes("calcul")) return "math";
  if (t.includes("physique") || t.includes("vitesse") || t.includes("force")) return "physique";
  if (t.includes("chimie") || t.includes("molécule") || t.includes("acide") || t.includes("base")) return "chimie";
  return "general";
}

function construireQuestionsConsolidation(question = "", corps = "") {
  const theme = detecterThemeConsolidation(question, corps);

  if (theme === "histoire") {
    return `1) Question de réflexion : pourquoi est-il important de connaître le passé de son pays ?
2) Petite vérification rapide :
A. L’histoire aide à comprendre le présent
B. L’histoire ne sert presque à rien
👉 Choisis la bonne réponse.`;
  }

  if (theme === "geographie") {
    return `1) Question de réflexion : pourquoi faut-il connaître correctement les subdivisions administratives ?
2) Petite vérification rapide :
A. Une liste administrative doit être précise
B. Une liste approximative suffit
👉 Choisis la bonne réponse.`;
  }

  if (theme === "droit") {
    return `1) Question de réflexion : pourquoi faut-il vérifier la source avant de citer un article ?
2) Petite vérification rapide :
A. On peut citer sans vérifier
B. Il faut vérifier le texte exact
👉 Choisis la bonne réponse.`;
  }

  if (theme === "math") {
    return `1) Question de réflexion : pourquoi la méthode compte-t-elle ?
2) Petite vérification rapide :
A. La méthode compte aussi
B. Seule la réponse finale compte
👉 Choisis la bonne réponse.`;
  }

  if (theme === "physique") {
    return `1) Question de réflexion : pourquoi les unités sont-elles importantes ?
2) Petite vérification rapide :
A. Les unités aident à vérifier le raisonnement
B. Les unités ne servent presque à rien
👉 Choisis la bonne réponse.`;
  }

  if (theme === "chimie") {
    return `1) Question de réflexion : pourquoi faut-il bien écrire les symboles chimiques ?
2) Petite vérification rapide :
A. H₂O et CO₂ sont différents
B. H₂O et CO₂ sont identiques
👉 Choisis la bonne réponse.`;
  }

  return `1) Question de réflexion : quelle idée importante retiens-tu ?
2) Petite vérification rapide :
A. Comprendre vaut mieux que mémoriser sans réfléchir
B. Mémoriser sans comprendre suffit toujours
👉 Choisis la bonne réponse.`;
}

function renforcerBlocConsolidation(corps = "", question = "") {
  let t = String(corps || "").trim();
  if (!t) return t;

  if (/question de réflexion/i.test(t) || /petite vérification rapide/i.test(t)) {
    return t;
  }

  const blocPlus = construireQuestionsConsolidation(question, t);

  if (/❓\s*\[CONSOLIDATION\]/i.test(t)) {
    return t.replace(
      /(❓\s*\[CONSOLIDATION\]\s*:?\s*[\s\S]*?)(?=\n👉|\n🌟|\n\*\*\*«|$)/i,
      (match) => {
        if (/question de réflexion/i.test(match) || /petite vérification rapide/i.test(match)) return match;
        return `${match}\n\n${blocPlus}`;
      }
    );
  }

  return `${t}\n\n❓ [CONSOLIDATION] :\n\n${blocPlus}`;
}

function choisirOuvertureContextuelle(reponse = "", _user = {}, question = "") {
  const corps = String(reponse || "").toLowerCase();
  const q = normaliserMessageCourt(question);

  if (estMessageRelationnelSimple(q)) return "";

  if (q.includes("histoire") || corps.includes("histoire")) {
    return "👉 Nous pouvons continuer avec une autre petite question d'histoire.";
  }

  if (estQuestionTechnique(q)) {
    return "👉 Essaie maintenant de continuer, puis envoie-moi ta réponse.";
  }

  if (
    corps.includes("géographie") ||
    corps.includes("geographie") ||
    corps.includes("rdc") ||
    corps.includes("congo") ||
    q.includes("territoire") ||
    q.includes("province") ||
    q.includes("commune") ||
    q.includes("ville")
  ) {
    return "👉 Nous pouvons continuer avec une autre petite question de géographie.";
  }

  if (
    corps.includes("loi") ||
    corps.includes("article") ||
    corps.includes("droit") ||
    q.includes("droit") ||
    q.includes("loi")
  ) {
    return "👉 Nous pouvons continuer avec une autre petite question de droit.";
  }

  return pick(OUVERTURES);
}

function choisirEncouragementContextuel(reponse = "", question = "") {
  const corps = String(reponse || "").toLowerCase();
  const q = String(question || "").toLowerCase();

  if (estMessageRelationnelSimple(question)) {
    return "";
  }

  if (corps.includes("je n'arrive pas encore") || corps.includes("petit souci technique") || corps.includes("réessaie") || corps.includes("image plus nette") || corps.includes("message vocal plus clair")) {
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

  if (vraieReussite && (corps.includes("bonne réponse") || corps.includes("réponse correcte") || corps.includes("exact") || corps.includes("juste"))) {
    return "🌟 Mot d'encouragement : Bon travail ; continue avec cette rigueur.";
  }

  if (corps.includes("méthode") || corps.includes("explication") || corps.includes("à retenir")) {
    return "🌟 Mot d'encouragement : Relis doucement ; une idée bien comprise reste mieux.";
  }

  return "🌟 Mot d'encouragement : Avance pas à pas ; comprendre calmement vaut mieux que se précipiter.";
}

function construireReponseHumaineSimple(user = {}, texte = "") {
  const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";
  const appel = construireAppel({ nom: prenom });
  const t = normaliserTexteRelationnel(texte);

  if (estMessageRemerciement(t)) {
    return pick([
      `Je t’en prie ${appel} 😊`,
      `Avec plaisir ${appel} 😊`,
      `C’est normal ${appel}`,
      `Toujours là ${appel} 💪`,
      `Avec joie ${appel} 😊`
    ]);
  }

  if (estMessageSalutation(t)) {
    if (t.includes("bonsoir")) return `Bonne soirée ${appel} 🌙`;
    if (t.includes("bonne nuit")) return `Bonne nuit ${appel} 🌙`;
    if (t.includes("journee")) return `Bonne journée ${appel} 😊`;
    if (t.includes("matinee")) return `Bonne matinée ${appel} 😊`;
    if (t.includes("apres midi")) return `Bon après-midi ${appel} 😊`;
    if (t.includes("week end") || t.includes("weekend")) return `Bon week-end ${appel} 😄`;
    if (t.includes("a demain")) return `À demain ${appel} 👋`;

    return pick([
      `Bonjour ${appel} 😊`,
      `Salut ${appel} 👋`,
      `Coucou ${appel} 👋`,
      `Mbote ${appel} 😊`
    ]);
  }

  if (estMessageCourtHumain(t)) {
    if (t === "ca va" || t === "ca va merci") {
      return pick([
        `Oui, ça va bien ${appel} 😊`,
        `Ça va bien ${appel}, merci 😊`
      ]);
    }

    return pick([
      `D’accord ${appel} 👍`,
      `Très bien ${appel} 👍`,
      `Parfait ${appel} 👍`
    ]);
  }

  return "";
}

function garderUneSeuleCitation(texte = "") {
  const lignes = String(texte || "").split("\n");
  let citationGardee = false;
  const resultat = [];

  for (const ligne of lignes) {
    const trimmed = ligne.trim();
    const estCitation = /^\*\*\*«.*»\*\*\*$/.test(trimmed);
    if (estCitation) {
      if (citationGardee) continue;
      citationGardee = true;
    }
    resultat.push(ligne);
  }

  return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function garderUneSeuleOuverture(texte = "") {
  const lignes = String(texte || "").split("\n");
  let ouvertureGardee = false;
  const resultat = [];

  for (const ligne of lignes) {
    const trimmed = ligne.trim();
    if (trimmed.startsWith("👉 ")) {
      if (ouvertureGardee) continue;
      ouvertureGardee = true;
    }
    resultat.push(ligne);
  }

  return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function dedupeBlocFinal(texte = "") {
  let t = String(texte || "").trim();

  t = couperDoubleReponse(t);
  t = nettoyerParasitesMemoire(t);
  t = normaliserStructureUnique(t);
  t = garderUneSeuleOuverture(t);
  t = garderUneSeuleCitation(t);

  const lignes = t.split("\n");
  const resultat = [];
  let dernierBloc = "";

  for (const ligneBrute of lignes) {
    const ligne = ligneBrute.trimRight();
    const normalisee = ligne.trim().toLowerCase();

    if (!normalisee) {
      if (resultat[resultat.length - 1] !== "") {
        resultat.push("");
      }
      continue;
    }

    const estBlocStructure =
      /🔵\s*\[vécu\]/i.test(ligne) ||
      /🟡\s*\[savoir\]/i.test(ligne) ||
      /🔴\s*\[inspiration\]/i.test(ligne) ||
      /❓\s*\[consolidation\]/i.test(ligne);

    if (estBlocStructure) {
      if (dernierBloc === normalisee) continue;
      dernierBloc = normalisee;
    }

    resultat.push(ligne);
  }

  return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function nettoyerStyleFinal(texte = "") {
  return String(texte || "")
    .replace(/\bfuture avocate\b/gi, "future personne compétente")
    .replace(/\bfutur avocat\b/gi, "future personne compétente")
    .replace(/\bmon enfant\b/gi, "cher élève");
}

function construireMessageFinal(user, reponseBrute, historique = [], question = "", fiche = null) {
  let propre = couperDoubleReponse(reponseBrute);
  propre = nettoyerReponseIA(propre);
  propre = nettoyerParasitesMemoire(propre);

  const sortieScientifique = appliquerLes4EtapesScientifiques(propre, question, fiche);

  let corps = verifierStructureMwalimu(sortieScientifique.texte, user, historique, question);
  corps = renforcerBlocConsolidation(corps, question);
  corps = nettoyerParasitesMemoire(corps);
  corps = normaliserStructureUnique(corps);

  let corpsFinal = adapterTexteGenre(corps, user.nom);
  corpsFinal = nettoyerAppelsRepetitifs(corpsFinal, user.nom);
  corpsFinal = nettoyerStyleFinal(corpsFinal);
  corpsFinal = supprimerDoublonsLignes(corpsFinal);
  corpsFinal = nettoyerParasitesMemoire(corpsFinal);
  corpsFinal = normaliserStructureUnique(corpsFinal);

  const ouverture = adapterTexteGenre(
    choisirOuvertureContextuelle(corpsFinal, user, question),
    user.nom
  );
  const encouragement = choisirEncouragementContextuel(corpsFinal, question);
  const citation = choisirCitationContextuelle(corpsFinal, question);

  const parties = [
    HEADER_MWALIMU,
    "────────────────",
    corpsFinal,
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
   8) CONSIGNES PÉDAGOGIQUES
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
- Sinon, commence par dire que tu as bien reçu l'audio
- Réponds avec chaleur et pédagogie
- Sois bref et clair`;
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
   9) TRAITEMENT
========================================================= */
async function traiterTexte(user, texteUtilisateur, historique) {
  const cacheKey = String(texteUtilisateur || "").toLowerCase();
  const cached = getCache(cacheKey);
  if (cached) {
    console.log("⚡ Réponse depuis cache");
    return { reponse: cached, fiche: null, bypassFormat: false };
  }

  if (estMessageRelationnelSimple(texteUtilisateur)) {
    const reponseSimple = construireReponseHumaineSimple(user, texteUtilisateur);
    if (reponseSimple) {
      return { reponse: reponseSimple, fiche: null, bypassFormat: true };
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
    texteMin.includes("histoire");

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
    return {
      reponse: "Je n'arrive pas à lire ton audio.",
      fiche: null,
      bypassFormat: true,
      memoryContent: "[audio]"
    };
  }

  const { buffer, mimeType } = await telechargerMedia(audioId, 8 * 1024 * 1024);
  console.log("🎧 MIME audio reçu :", mimeType);

  if (!estMimeAudioSupporte(mimeType)) {
    return {
      reponse: "Format audio non supporté.",
      fiche: null,
      bypassFormat: true,
      memoryContent: "[audio]"
    };
  }

  const historiquePropre = (historique || []).filter((m) => {
    const c = String(m.content || "");
    return !c.includes("[audio envoyé]") && !c.includes("[audio]") && !c.includes("[image envoyée]") && !c.includes("[image]");
  });

  const analyse = await analyserAudioCourt(user, buffer, mimeType, historiquePropre);
  const transcriptionBrute = String(analyse?.transcription || "").trim();
  const transcription = normaliserTexteRelationnel(transcriptionBrute);
  const typeAudio = String(analyse?.type || "incompris").trim().toLowerCase();

  if (transcription && estMessageRelationnelSimple(transcription)) {
    const rep = construireReponseHumaineSimple(user, transcription);
    if (rep) {
      return {
        reponse: rep,
        fiche: null,
        bypassFormat: true,
        memoryContent: transcriptionBrute || "[audio]"
      };
    }
  }

  if (transcriptionBrute && estMessageRelationnelSimple(transcriptionBrute)) {
    const rep = construireReponseHumaineSimple(user, transcriptionBrute);
    if (rep) {
      return {
        reponse: rep,
        fiche: null,
        bypassFormat: true,
        memoryContent: transcriptionBrute || "[audio]"
      };
    }
  }

  const tMini = normaliserTexteRelationnel(transcriptionBrute);
  if (
    tMini &&
    tMini.split(" ").length <= 5 &&
    (
      tMini.includes("merci") ||
      estMessageSalutation(tMini) ||
      estMessageCourtHumain(tMini)
    )
  ) {
    return {
      reponse: construireReponseHumaineSimple(user, tMini) || "Je t’en prie 😊",
      fiche: null,
      bypassFormat: true,
      memoryContent: transcriptionBrute || "[audio]"
    };
  }

  if (typeAudio === "social") {
    return {
      reponse: construireReponseHumaineSimple(user, transcription || transcriptionBrute || "merci") || "Je t’en prie 😊",
      fiche: null,
      bypassFormat: true,
      memoryContent: transcriptionBrute || "[audio]"
    };
  }

  let reponse = await reponseAudioUneSeulePasse(user, buffer, mimeType, historiquePropre, null);
  reponse = nettoyerParasitesMemoire(reponse);

  const texteAudioNormalise = normaliserTexteRelationnel(reponse);

  if (
    texteAudioNormalise.includes("merci") ||
    estMessageSalutation(texteAudioNormalise) ||
    estMessageCourtHumain(texteAudioNormalise)
  ) {
    return {
      reponse: construireReponseHumaineSimple(user, texteAudioNormalise) || "Je t’en prie 😊",
      fiche: null,
      bypassFormat: true,
      memoryContent: transcriptionBrute || "[audio]"
    };
  }

  if (!reponse || !reponse.trim()) {
    reponse = "Je n'arrive pas encore à analyser ton audio correctement.";
    return {
      reponse,
      fiche: null,
      bypassFormat: true,
      memoryContent: transcriptionBrute || "[audio]"
    };
  }

  const bypassFormat = estReponseRelationnelleSimpleIA(reponse);

  return {
    reponse,
    fiche: null,
    bypassFormat,
    memoryContent: transcriptionBrute || "[audio]"
  };
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
      bypassFormat: false,
      memoryContent: "[image]"
    };
  }

  const { buffer, mimeType } = await telechargerMedia(imageId, 8 * 1024 * 1024);
  console.log("🖼️ MIME image reçu :", mimeType);

  if (!estMimeImageSupporte(mimeType)) {
    return {
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Le format d’image n'est pas encore supporté.
🔴 [INSPIRATION] : Ce n’est pas grave.
❓ [CONSOLIDATION] : Envoie-moi une image en JPG, JPEG, PNG, WEBP, GIF, BMP, HEIC ou HEIF.`,
      fiche: null,
      bypassFormat: false,
      memoryContent: "[image]"
    };
  }

  const base64Image = buffer.toString("base64");
  let reponse = await expliquerImageAvecIA(user, base64Image, mimeType, historique);
  reponse = nettoyerParasitesMemoire(reponse);

  if (!reponse || !String(reponse).trim()) {
    reponse = `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Je n'arrive pas encore à l'analyser correctement.
🔴 [INSPIRATION] : Nous pouvons reprendre calmement.
❓ [CONSOLIDATION] : Envoie-moi une image plus nette ou mieux cadrée.`;
  }

  return { reponse, fiche: null, bypassFormat: false, memoryContent: "[image]" };
}

/* =========================================================
   10) COMMANDES
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
   11) CRON
========================================================= */
cron.schedule("0 7 * * *", async () => {
  try {
    console.log("⏰ Rappel matinal exécuté.");

    const { rows } = await pool.query(`
      SELECT phone, nom
      FROM conversations
      WHERE coalesce(phone, '') <> ''
        AND coalesce(nom, '') <> ''
        AND coalesce(reminders_enabled, TRUE) = TRUE
    `);

    for (const eleve of rows) {
      try {
        const appel = `${genreEleve(eleve.nom)} **${normaliserNom(eleve.nom).split(" ")[0]}**`;
        const citation = pick(CITATIONS.patriotisme);

        const messageRappel = `${HEADER_MWALIMU}
────────────────
🔵 [VÉCU] : Bonjour ${appel}.
🟡 [SAVOIR] : Petit rappel du matin : avance aujourd’hui avec calme et sérieux.
🔴 [INSPIRATION] : Ton objectif n’est pas d’aller vite, mais de bien comprendre.
❓ [CONSOLIDATION] : Quelle matière veux-tu travailler aujourd’hui ?
👉 Je reste à tes côtés.
🌟 Mot d'encouragement : Un élève constant progresse.
${citation}`.replace(/\n{3,}/g, "\n\n").trim();

        await envoyerWhatsApp(eleve.phone, messageRappel);
      } catch (e) {
        console.error("Erreur rappel matinal:", e.message);
      }
    }
  } catch (e) {
    console.error("Erreur cron bonjour:", e.message);
  }
}, { timezone: "Africa/Lubumbashi" });

cron.schedule("0 3 * * *", async () => {
  try {
    await pool.query("DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '2 days'");
    console.log("🧹 Nettoyage processed_messages terminé.");
  } catch (e) {
    console.error("Erreur cron nettoyage:", e.message);
  }
}, { timezone: "Africa/Lubumbashi" });

/* =========================================================
   12) WEBHOOK
========================================================= */
app.post("/webhook", async (req, res) => {
  if (!verifierSignatureMeta(req)) {
    console.warn("⛔ Signature Meta invalide");
    return res.sendStatus(403);
  }

  const msg = extraireMessageWhatsApp(req.body);
  if (!msg) return res.sendStatus(200);

  res.sendStatus(200);

  const from = msg.from || "unknown";

  runSequentialByKey(from, async () => {
    const msgId = msg.id;
    const texteUtilisateur = msg.text?.body?.trim() || "";
    const msgType = typeMessage(msg);

    console.log("📩 Message reçu :", msgType, "|", texteUtilisateur?.slice(0, 50));

    try {
      const check = await pool.query(
        "INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT DO NOTHING",
        [msgId]
      );
      if (check.rowCount === 0) return;

      await envoyerIndicateurFrappe(msgId);

      let user = await getUser(from);

      if (!user) {
        await createUser(from);
        user = await getUser(from);
        return await envoyerWhatsApp(
          from,
          `${HEADER_MWALIMU}
────────────────
🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.
🟡 Quel est ton *prénom* ?`
        );
      }

      if (msgType === "text") {
        const commandeTraitee = await traiterCommandeTexte(from, user, texteUtilisateur);
        if (commandeTraitee) return;
      }

      if (!user.nom) {
        const nom = normaliserNom(nettoyer(texteUtilisateur));
        if (!nom) {
          return await envoyerWhatsApp(
            from,
            `${HEADER_MWALIMU}
────────────────
🟡 Donne-moi simplement ton *prénom*, s'il te plaît.`
          );
        }

        await updateUserField(from, "nom", nom);
        return await envoyerWhatsApp(
          from,
          `🤝 Enchanté *${nom}* !
🟡 En quelle *classe* es-tu ?`
        );
      }

      if (!user.classe) {
        const cl = normaliserNom(nettoyer(texteUtilisateur));
        if (!cl) {
          return await envoyerWhatsApp(
            from,
            `🟡 Écris-moi ta *classe* simplement.
Exemple : 6e, 8e, Terminale, 1ère secondaire.`
          );
        }

        await updateUserField(from, "classe", cl);
        user = await getUser(from);

        return await envoyerWhatsApp(
          from,
          `🟡 C'est bien noté, *${user.nom}*.
❓ Quel est ton plus grand *rêve* professionnel ?`
        );
      }

      if (!user.reve) {
        const rv = normaliserNom(nettoyer(texteUtilisateur));
        if (!rv) {
          return await envoyerWhatsApp(
            from,
            `❓ Dis-moi simplement ton *rêve* professionnel.
Exemple : avocat, médecin, ingénieur, pilote.`
          );
        }

        await updateUserField(from, "reve", rv);
        user = await getUser(from);

        return await envoyerWhatsApp(
          from,
          `✨ *Quelle ambition magnifique !*
🔴 Devenir *${rv}* est un rêve noble, et je sais que tu en es capable.
🔵 *Pour commencer notre parcours ensemble, dis-moi :*
👉 Quelle matière ou quel chapitre te pose problème en ce moment ?`
        );
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
        contenuUtilisateurPourMemoire = resultat?.memoryContent || "[audio]";
        await appendHistorique(from, "user", contenuUtilisateurPourMemoire);
      } else if (msgType === "image") {
        const resultat = await traiterImage({ ...user, phone: from }, msg, historique);
        reponseBrute = resultat?.reponse || "";
        ficheContexte = resultat?.fiche || null;
        bypassFormat = Boolean(resultat?.bypassFormat);
        contenuUtilisateurPourMemoire = resultat?.memoryContent || "[image]";
        await appendHistorique(from, "user", contenuUtilisateurPourMemoire);
      } else {
        reponseBrute = `🔵 [VÉCU] : J'ai bien reçu ton message.
🟡 [SAVOIR] : Pour l'instant, je traite surtout les textes, les audios et les images.
🔴 [INSPIRATION] : Nous pouvons déjà avancer correctement avec ces formats.
❓ [CONSOLIDATION] : Envoie-moi ta question par écrit, par audio ou avec une image nette.`;
      }

      if (!reponseBrute || !String(reponseBrute).trim()) {
        await logUnansweredQuestion({ ...user, phone: from }, texteUtilisateur || contenuUtilisateurPourMemoire, msgType, "final_empty");
        reponseBrute = `🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Je n'ai pas encore pu produire une réponse claire.
🔴 [INSPIRATION] : Ce n’est pas un problème ; nous pouvons reprendre plus simplement.
❓ [CONSOLIDATION] : Reformule ta question en une seule phrase.`;
      }

      const messageFinal = bypassFormat
        ? nettoyerParasitesMemoire(reponseBrute)
        : construireMessageFinal(
            user,
            reponseBrute,
            historique,
            texteUtilisateur || contenuUtilisateurPourMemoire,
            ficheContexte
          );

      await envoyerWhatsApp(from, nettoyerParasitesMemoire(messageFinal));
      await appendHistorique(from, "assistant", tronquerTexte(nettoyerParasitesMemoire(messageFinal), 2500));
    } catch (e) {
      console.error("Erreur générale complète:", {
        message: e?.message || null,
        stack: e?.stack || null,
        data: e?.response?.data || null
      });

      try {
        let user = await getUser(from);
        if (!user) user = { nom: "élève" };

        if (estErreurQuotaGemini(e)) {
          await envoyerWhatsApp(
            from,
            `${HEADER_MWALIMU}
────────────────
🔵 [VÉCU] : J'ai bien reçu ${messageTypeLisible(msgType)}.
🟡 [SAVOIR] : Je suis momentanément très sollicité.
🔴 [INSPIRATION] : Ce petit contretemps n’empêche pas notre progression.
❓ [CONSOLIDATION] : Réessaie dans une minute avec la même question.`
          );
          return;
        }

        await envoyerWhatsApp(from, messageSecours(user, msgType));
      } catch (e2) {
        console.error("Erreur secours complète:", {
          message: e2?.message || null,
          stack: e2?.stack || null,
          data: e2?.response?.data || null
        });
      }
    }
  }).catch((e) => {
    console.error("Erreur queue:", e?.message || e);
  });
});

/* =========================================================
   13) VERIFY + HEALTHCHECK
========================================================= */
app.get("/", (_req, res) => {
  res.send("Mwalimu EdTech Server: OK");
});

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
    return res.send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

/* =========================================================
   14) DÉMARRAGE
========================================================= */
(async () => {
  await initDB();
  app.listen(PORT, () => {
    console.log(`✅ Mwalimu en marche sur le port ${PORT}`);
  });
})();
