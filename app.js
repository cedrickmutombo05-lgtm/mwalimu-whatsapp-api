

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cron = require("node-cron");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const app = express();
app.set("trust proxy", 1);

/* =========================================================
   1) CONFIG & GARDE-FOUS
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
  console.error("❌ Erreur inattendue PostgreSQL :", err.message);
});

app.use(express.json({
  limit: "2mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests"
});

app.use(generalLimiter);

/* =========================================================
   2) CONSTANTES MWALIMU
========================================================= */
const HEADER_MWALIMU = "🔴🟡🔵 *Mwalimu EdTech : Ton Mentor pour l'Excellence* 🇨🇩";

const CITATIONS = {
  patriotisme: [
    "***« Aimer sa patrie, c’est la servir avec intelligence, honnêteté et discipline. »***",
    "***« Un bon élève d’aujourd’hui peut devenir un grand bâtisseur du Congo de demain. »***",
    "***« Le vrai savoir ne sert pas seulement à réussir sa vie, mais aussi à relever sa nation. »***",
    "***« Le Congo a besoin d’enfants instruits, responsables et fiers de leur pays. »***"
  ],
  geographie: [
    "***« La géographie aide à mieux comprendre le monde et à mieux servir sa patrie. »***",
    "***« Connaître son pays, c’est déjà commencer à mieux l’aimer. »***"
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
    "***« La politesse, le respect et l’amour du prochain élèvent aussi la nation. »***",
    "***« Un cœur reconnaissant et discipliné honore sa famille et sa patrie. »***"
  ],
  general: [
    "***« Apprendre avec sérieux aujourd’hui, c’est mieux servir le Congo demain. »***",
    "***« Le savoir, la discipline et l’amour du pays font grandir la nation. »***"
  ]
};

const OUVERTURES = [
  "👉 Continue à me parler librement, je suis là pour t'aider.",
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
- Division : / si c'est plus propre
- Fraction simple : 2/5, 3/4, 7/10
- Exemple correct : D = b² - 4ac
- Exemple correct : x = (-b ± √D) / 2a
- Exemple correct : v = d / t
- Exemple correct : F = m × a
- Exemple correct : C = n / V
- Exemple correct : m = n × M
- Pour la racine, écris : √9
- Les molécules doivent être propres : H₂O, CO₂, O₂, H₂SO₄, NaCl
- Les unités doivent être propres : cm², cm³, m/s, g/L, mol/L, kg/m³`;

const REGLE_CALCUL_INTELLIGENT = `RÈGLES SPÉCIALES POUR LES CALCULS :
- Sois extrêmement rigoureux
- Vérifie chaque étape avant de l'écrire
- Avance ligne par ligne
- Explique la logique avant le résultat
- Privilégie la méthode scolaire claire
- N’invente jamais un chiffre, une unité ou une formule
- Distingue clairement : donnée, opération, méthode, résultat intermédiaire, conclusion
- Pour les maths, la physique et la chimie, écris toujours en format horizontal simple`;

const SYSTEM_BASE = `Tu es Mwalimu EdTech, un précepteur numérique congolais, humain, chaleureux, rigoureux, pédagogue et bienveillant.

MISSION :
- Aider l'élève à comprendre
- Guider sans faire le travail à sa place
- Expliquer comme un vrai précepteur
- Utiliser un ton humain, simple, motivant et respectueux
- Adapter le niveau à la classe de l'élève
- Te référer au contexte scolaire de la RDC lorsque c'est pertinent

STYLE OBLIGATOIRE :
- Réponse claire, structurée, naturelle et brève
- Sois très succinct quand une réponse courte suffit
- Évite les répétitions
- N'utilise pas toujours la même formule d'appel
- N'appelle pas systématiquement l'élève "ma chère" ou "mon cher"
- Varie naturellement l'interpellation ou commence directement la réponse quand c'est préférable
- Ne sois jamais bavard
- Ne jamais humilier l'élève
- Si l'information n'est pas certaine, le dire honnêtement
- Ne pas inventer de référence scolaire, scientifique ou juridique
- Répondre en français sauf si l'élève change de langue
- Après une réponse théorique, proposer une petite question de retour naturelle seulement si cela est utile
- La structure doit toujours être : VÉCU, SAVOIR, INSPIRATION, CONSOLIDATION
- Après cette structure seulement : ouverture, encouragement, citation
- Si l'élève dit juste bonjour, bonsoir, merci, bonne nuit, réponds humainement et normalement, sans utiliser le modèle VÉCU/SAVOIR/INSPIRATION/CONSOLIDATION

STRUCTURE SOUHAITÉE :
🔵 [VÉCU]
🟡 [SAVOIR]
🔴 [INSPIRATION]
❓ [CONSOLIDATION]

${REGLE_CALCUL_INTELLIGENT}
${REGLE_FORMAT_MATH}`;

const SYSTEM_TUTORAT = `RÈGLES DE TUTORAT STRICTES :
- Tu es un précepteur, pas un solveur automatique
- Pour un exercice :
  1. identifie le type d'exercice
  2. explique calmement la méthode
  3. montre seulement le démarrage utile
  4. laisse l'élève continuer
  5. demande à l'élève de proposer sa réponse
  6. corrige ensuite avec douceur
- Ne donne pas directement la réponse finale si l'élève n'a pas encore essayé
- Pour tout exercice de maths, physique ou chimie :
  1. identifier la matière
  2. nettoyer l’écriture scientifique
  3. reformater proprement
  4. guider pas à pas sans faire tout à la place`;

const SYSTEM_JURIDIQUE_WEB = `RÈGLES JURIDIQUES ET RECHERCHE WEB :
- Pour le droit, les lois, les codes, la fiscalité, la procédure, la Constitution, le travail, le commerce ou l’OHADA, utilise la recherche web Google si nécessaire
- Réfère-toi en priorité aux textes applicables en RDC et au droit OHADA
- N’invente jamais un article, un numéro d’article ou une source
- Si une information n’est pas certaine, dis-le honnêtement
- En matière juridique, reste pédagogique, clair, prudent et très succinct
- Lorsqu'il s'agit d'un article de loi, commence d'abord par reprendre l'article dans son intégralité SI le texte exact est disponible de manière fiable
- Si le texte intégral exact n’est pas disponible avec certitude, ne l’invente pas et dis honnêtement que tu ne peux pas le recopier mot à mot
- Après avoir repris l'article, fais un commentaire bref, clair et utile
- Évite les longs développements inutiles`;

const PROMPT_IMAGE_TYPES = `TYPES D’IMAGES ET PHOTOS À LIRE :
- photo d’exercice manuscrit
- photo de cahier
- photo de feuille d’examen
- photo de tableau
- capture d’écran
- carte
- schéma
- graphique
- page de livre
- page imprimée
- document photographié
- image JPG
- image JPEG
- image PNG
- image WEBP
- image GIF
- image BMP
- image HEIC
- image HEIF`;

/* =========================================================
   3) OUTILS SIMPLES
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

function nettoyer(t) {
  if (!t) return "";
  return String(t)
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

function genreEleve(nom = "") {
  const prenom = String(nom || "").trim().split(" ")[0].toLowerCase();
  const prenomsFeminins = [
    "dora", "marie", "anne", "anna", "annie", "anuarite", "ruth", "grace", "grâce",
    "esther", "sarah", "sara", "debora", "débora", "fatou", "chantal", "nadine",
    "brigitte", "joyce", "elodie", "élodie", "mireille", "patience", "rebecca",
    "rebeca", "prisca", "gloria", "divine", "mercie", "naomie", "noella", "blandine", "huguette"
  ];
  const terminaisonsFeminines = ["a", "ia", "na", "ssa", "elle", "ine", "ette", "line"];
  if (prenomsFeminins.includes(prenom) || terminaisonsFeminines.some((fin) => prenom.endsWith(fin))) {
    return "ma chère";
  }
  return "mon cher";
}

function construireAppel(user) {
  const prenom = normaliserNom(user?.nom || "élève").split(" ")[0] || "élève";
  const prefixe = genreEleve(prenom);

  const options = [
    `${prenom}`,
    `${prefixe} ${prenom}`,
    `cher ${prenom}`,
    `bon ${prenom}`,
    `${prefixe}`,
    `toi`,
    `mon ami`,
    `mon enfant`
  ];

  return pick(options);
}

function nettoyerAppelsRepetitifs(texte = "", nom = "") {
  const prenom = normaliserNom(nom).split(" ")[0] || "élève";
  const prefixe = genreEleve(prenom);

  const variations = [
    `**${prenom}**`,
    `${prefixe} **${prenom}**`,
    `cher **${prenom}**`,
    `bon **${prenom}**`,
    `mon ami`,
    `mon enfant`
  ];

  let compteur = 0;

  return String(texte || "").replace(
    /(ma chère|mon cher)\s+\*\*[^\*]+\*\*/gi,
    () => {
      const choix = variations[compteur % variations.length];
      compteur += 1;
      return choix;
    }
  );
}

function adapterTexteGenre(texte = "", nom = "") {
  const prenomNettoye = normaliserNom(nom).split(" ")[0] || "élève";
  const prefixe = genreEleve(prenomNettoye);
  const appelComplet = `${prefixe} **${prenomNettoye}**`;

  let t = String(texte || "")
    .replace(/mon cher élève/gi, appelComplet)
    .replace(/ma chère élève/gi, appelComplet)
    .replace(/mon élève/gi, `**${prenomNettoye}**`)
    .replace(/cher élève/gi, `**${prenomNettoye}**`);

  return nettoyerAppelsRepetitifs(t, nom);
}

function estMessageSalutation(texte = "") {
  const t = String(texte || "").toLowerCase().trim();
  if (!t) return false;
  const salutationsExactes = [
    "bonjour", "bonsoir", "salut", "cc", "coucou", "hello", "bjr",
    "bonne nuit", "bonne soirée", "bonne soiree", "à demain", "a demain",
    "bonjour mwalimu", "bonsoir mwalimu", "salut mwalimu", "mbote", "mbote mwalimu"
  ];
  if (salutationsExactes.includes(t)) return true;
  return /^(bonjour|bonsoir|salut|hello|coucou|mbote|bjr)(\s+mwalimu)?[!\s.]*$/i.test(t);
}

function estMessageRemerciement(texte = "") {
  const t = String(texte || "").toLowerCase().trim();
  const remerciements = [
    "merci", "merci beaucoup", "mercii", "grand merci", "mersi",
    "merci mwalimu", "merci beaucoup mwalimu", "je te remercie",
    "je vous remercie", "ok merci", "d'accord merci", "dac merci"
  ];
  return remerciements.includes(t);
}

function estMessageCourtHumain(texte = "") {
  const t = String(texte || "").toLowerCase().trim();
  const expressions = [
    "ok", "okay", "d'accord", "dac", "ça va", "ca va", "oui", "non",
    "bien", "super", "parfait", "cool", "entendu", "compris"
  ];
  return expressions.includes(t);
}

function estMessageRelationnelSimple(texte = "") {
  return estMessageSalutation(texte) || estMessageRemerciement(texte) || estMessageCourtHumain(texte);
}

function estSoumissionReponse(texte = "") {
  const t = String(texte || "").toLowerCase().trim();
  const indices = [
    "ma réponse", "ma reponse", "j'ai trouvé", "jai trouvé", "jai trouve",
    "j'ai fait", "voici ma réponse", "voici ma reponse",
    "mon résultat", "mon resultat", "j'obtiens", "j'ai obtenu",
    "le résultat est", "le resultat est", "ça donne", "cela donne"
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
  const brut = String(texte || "").trim();
  const t = normaliserTexteMemoire(brut);
  if (!t) return "";
  if (estMessageRelationnelSimple(brut)) return "";

  const motsASupprimer = [
    "bonjour", "bonsoir", "salut", "hello", "coucou", "mbote",
    "merci", "mwalimu", "cc", "bjr", "bonne nuit", "bonne soiree",
    "a demain", "ca va", "ça va", "ok", "okay", "dac", "d accord"
  ];

  const motsUtiles = t
    .split(" ")
    .filter(Boolean)
    .filter((m) => !motsASupprimer.includes(m));

  const texteFiltre = motsUtiles.join(" ").trim();
  if (!texteFiltre) return "";

  const sujets = [
    "nepal", "chine", "geo", "geographie", "math", "mathematiques", "equation",
    "fraction", "histoire", "francais", "grammaire", "impot",
    "taxe", "civisme", "rdc", "congo", "province", "territoire",
    "constitution", "droit", "sciences", "physique", "chimie"
  ];

  for (const s of sujets) {
    if (texteFiltre.includes(s)) return s;
  }

  const mots = texteFiltre.split(" ").filter(Boolean);
  return mots.length ? mots.slice(0, 4).join(" ") : "";
}

function retrouverSujetProche(historique = [], texteActuel = "") {
  const actuel = extraireSujetMemoire(texteActuel);
  if (!actuel) return "";

  for (let i = historique.length - 1; i >= 0; i--) {
    const item = historique[i];
    if (!item || item.role !== "user") continue;
    const contenu = String(item.content || "");
    const ancien = extraireSujetMemoire(contenu);
    if (ancien && (ancien === actuel || contenu.toLowerCase().includes(actuel))) {
      return ancien;
    }
  }

  return "";
}

function construirePhraseRetourMemoire(historique = [], texteActuel = "", user = {}) {
  if (estMessageRelationnelSimple(texteActuel)) return "";
  const sujet = retrouverSujetProche(historique, texteActuel);
  const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";
  if (!sujet) return "";

  const mapEtiquettes = {
    nepal: "le Népal",
    chine: "la Chine",
    geo: "la géographie",
    geographie: "la géographie",
    math: "les mathématiques",
    mathematiques: "les mathématiques",
    equation: "les équations",
    fraction: "les fractions",
    histoire: "l’histoire",
    francais: "le français",
    grammaire: "la grammaire",
    impot: "l’impôt",
    taxe: "la taxe",
    civisme: "le civisme",
    rdc: "la RDC",
    congo: "le Congo",
    province: "les provinces",
    territoire: "les territoires",
    constitution: "la Constitution",
    droit: "le droit",
    sciences: "les sciences",
    physique: "la physique",
    chimie: "la chimie"
  };

  const etiquette = mapEtiquettes[sujet] || sujet;
  return `🔵 [VÉCU] : Je suis content que tu reviennes sur ${etiquette}, ${prenom}. Cela montre que tu veux vraiment bien comprendre, et c’est une très belle attitude.`;
}

function supprimerDoublonsLignes(texte = "") {
  if (!texte) return "";
  const lignes = String(texte)
    .split("\n")
    .map((l) => l.trimEnd());

  const resultat = [];
  let precedenteNormalisee = "";

  for (const ligne of lignes) {
    const normalisee = ligne.trim().toLowerCase();
    if (normalisee && normalisee === precedenteNormalisee) continue;
    resultat.push(ligne);
    precedenteNormalisee = normalisee;
  }

  return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function nettoyerReponseIA(texte = "") {
  if (!texte) return "";
  let t = String(texte);
  t = t.replace(/🔴🟡🔵\s*\*?Mwalimu EdTech\s*:\s*Ton Mentor pour l'Excellence\*?\s*🇨🇩/gi, "");
  t = t.replace(/\*\*\*«[^»]+»\*\*\*/g, "");
  t = t.replace(/^\s*🌟\s*Mot d['’]encouragement\s*:\s*.*$/gim, "");
  t = t.replace(/^\s*👉\s*Je reste disponible.*$/gim, "");
  t = t.replace(/^\s*👉\s*Continue à me parler.*$/gim, "");
  t = t.replace(/^\s*👉\s*Reviens quand tu veux.*$/gim, "");
  t = supprimerDoublonsLignes(t);
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

function appliquerRemplacements(texte = "", remplacements = []) {
  let t = String(texte || "");
  for (const [pattern, replacement] of remplacements) {
    t = t.replace(pattern, replacement);
  }
  return t;
}

function simplifierNotationMath(texte = "") {
  if (!texte) return "";

  let t = appliquerRemplacements(String(texte), [
    [/\\\[/g, ""],
    [/\\\]/g, ""],
    [/\\\(/g, ""],
    [/\\\)/g, ""],
    [/\\times/g, "×"],
    [/\\div/g, "/"],
    [/\\pm/g, "±"],
    [/\\cdot/g, "×"],
    [/\\sqrt\{([^}]+)\}/g, "√$1"],
    [/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1 / $2"],
    [/\^2/g, "²"],
    [/\^3/g, "³"],
    [/[{}]/g, ""],
    [/\s*×\s*/g, " × "],
    [/\s*=\s*/g, " = "],
    [/\s*\+\s*/g, " + "],
    [/\s*-\s*/g, " - "],
    [/\s*\/\s*/g, " / "],
    [/\bcm2\b/g, "cm²"],
    [/\bcm3\b/g, "cm³"],
    [/\bm2\b/g, "m²"],
    [/\bm3\b/g, "m³"],
    [/\bH2O\b/g, "H₂O"],
    [/\bCO2\b/g, "CO₂"],
    [/\bO2\b/g, "O₂"],
    [/\bH2SO4\b/g, "H₂SO₄"],
    [/[ \t]{2,}/g, " "]
  ]);

  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

function simplifierPresentationScientifique(texte = "") {
  if (!texte) return "";
  let t = String(texte);
  t = t.replace(/\b([0-9]+)\.([0-9]+)\b/g, "$1,$2");
  t = t.replace(/[ \t]{2,}/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

function nettoyerSpecifiqueMath(texte = "") {
  return simplifierNotationMath(texte);
}

function nettoyerSpecifiquePhysique(texte = "") {
  return simplifierNotationMath(texte);
}

function nettoyerSpecifiqueChimie(texte = "") {
  return simplifierNotationMath(texte);
}

function nettoyerSelonMatiere(texte = "", matiere = MATIERE_GENERAL) {
  if (matiere === MATIERE_MATH) return nettoyerSpecifiqueMath(texte);
  if (matiere === MATIERE_PHYSIQUE) return nettoyerSpecifiquePhysique(texte);
  if (matiere === MATIERE_CHIMIE) return nettoyerSpecifiqueChimie(texte);
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

  const indicesChimie = ["chimie", "mol", "mole", "solution", "acide", "base", "h2o", "co2", "o2", "nacl"];
  const indicesPhysique = ["physique", "force", "vitesse", "energie", "énergie", "masse", "distance", "temps", "m/s", "kg/m³"];
  const indicesMath = ["math", "maths", "équation", "equation", "fraction", "racine", "x²", "a²", "b²", "calcul"];

  const score = { math: 0, physique: 0, chimie: 0 };
  for (const mot of indicesChimie) if (base.includes(mot)) score.chimie += 2;
  for (const mot of indicesPhysique) if (base.includes(mot)) score.physique += 2;
  for (const mot of indicesMath) if (base.includes(mot)) score.math += 2;

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

function humaniserDebutReponse(texte = "") {
  return String(texte || "").trim();
}

function choisirCitationContextuelle(reponse = "", question = "") {
  const t = `${reponse} ${question}`.toLowerCase();
  if (t.includes("merci") || t.includes("bonjour") || t.includes("bonsoir") || t.includes("bonne nuit")) return pick(CITATIONS.relationnel);
  if (t.includes("impôt") || t.includes("impot") || t.includes("taxe") || t.includes("civisme") || t.includes("droit") || t.includes("loi")) return pick(CITATIONS.civisme);
  if (t.includes("géographie") || t.includes("geographie") || t.includes("territoire") || t.includes("province") || t.includes("rdc") || t.includes("congo")) return pick(CITATIONS.geographie);
  if (t.includes("math") || t.includes("calcul") || t.includes("équation") || t.includes("equation") || t.includes("fraction") || t.includes("racine")) return pick(CITATIONS.mathematiques);
  if (t.includes("physique") || t.includes("chimie") || t.includes("science")) return pick(CITATIONS.sciences);
  if (t.includes("histoire") || t.includes("date") || t.includes("indépendance") || t.includes("independance")) return pick(CITATIONS.histoire);
  if (t.includes("français") || t.includes("francais") || t.includes("grammaire") || t.includes("orthographe")) return pick(CITATIONS.francais);
  if (t.includes("congo") || t.includes("rdc") || t.includes("patrie") || t.includes("nation")) return pick(CITATIONS.patriotisme);
  return pick(CITATIONS.general);
}

function verifierStructureMwalimu(corps = "", user = {}, historique = [], question = "") {
  let t = String(corps || "").trim();
  const aVecu = /🔵\s*\[VÉCU\]/i.test(t);
  const aSavoir = /🟡\s*\[SAVOIR\]/i.test(t);
  const aInspiration = /🔴\s*\[INSPIRATION\]/i.test(t);
  const aConsolidation = /❓\s*\[CONSOLIDATION\]/i.test(t);

  if (aVecu && aSavoir && aInspiration && aConsolidation) {
    return t;
  }

  const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";
  const phraseRetour = construirePhraseRetourMemoire(historique, question, user);
  const vecu = aVecu ? "" : (phraseRetour || `🔵 [VÉCU] : Je suis heureux de continuer cet échange avec toi, ${prenom}. Prenons le temps de bien comprendre ensemble.`);
  const savoir = aSavoir ? "" : `🟡 [SAVOIR] : Voici l’idée essentielle à retenir sur cette question.`;
  const inspiration = aInspiration ? "" : `🔴 [INSPIRATION] : Chaque notion bien comprise renforce ton intelligence et ta confiance.`;
  const consolidation = aConsolidation ? "" : `❓ [CONSOLIDATION] : Je veux aussi vérifier ta compréhension. Réponds d’abord avec tes propres mots, puis essaie la petite vérification que je vais te poser.`;

  const morceaux = [];
  if (!aVecu) morceaux.push(vecu);
  morceaux.push(t);
  if (!aSavoir) morceaux.push(savoir);
  if (!aInspiration) morceaux.push(inspiration);
  if (!aConsolidation) morceaux.push(consolidation);

  return morceaux.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function detecterThemeConsolidation(question = "", corps = "") {
  const t = `${question} ${corps}`.toLowerCase();
  if (t.includes("territoire") || t.includes("province") || t.includes("rdc") || t.includes("congo") || t.includes("géographie") || t.includes("geographie")) return "geographie";
  if (t.includes("loi") || t.includes("code") || t.includes("article") || t.includes("ohada") || t.includes("tribunal") || t.includes("juridique") || t.includes("droit")) return "droit";
  if (t.includes("math") || t.includes("équation") || t.includes("equation") || t.includes("fraction") || t.includes("calcul")) return "math";
  if (t.includes("physique") || t.includes("vitesse") || t.includes("force") || t.includes("énergie") || t.includes("energie")) return "physique";
  if (t.includes("chimie") || t.includes("molécule") || t.includes("molecule") || t.includes("acide") || t.includes("base") || t.includes("réaction") || t.includes("reaction")) return "chimie";
  return "general";
}

function construireQuestionsConsolidation(question = "", corps = "") {
  const theme = detecterThemeConsolidation(question, corps);

  if (theme === "geographie") {
    return `1) Question de réflexion : pourquoi est-il utile de connaître les territoires et les provinces de la RDC ?
2) Petite vérification rapide :
A. Un territoire fait partie d’une province
B. Une province fait partie d’un territoire
👉 Choisis la bonne réponse.`;
  }

  if (theme === "droit") {
    return `1) Question de réflexion : pourquoi faut-il vérifier la source avant de citer une règle de droit ?
2) Petite vérification rapide :
A. On peut citer un article sans vérification
B. Il faut vérifier le texte exact avant de citer un article
👉 Choisis la bonne réponse.`;
  }

  if (theme === "math") {
    return `1) Question de réflexion : pourquoi faut-il suivre les étapes du calcul au lieu de chercher seulement la réponse finale ?
2) Petite vérification rapide :
A. La méthode compte aussi
B. Seule la réponse finale compte
👉 Choisis la bonne réponse.`;
  }

  if (theme === "physique") {
    return `1) Question de réflexion : pourquoi les unités sont-elles importantes en physique ?
2) Petite vérification rapide :
A. Les unités aident à vérifier le raisonnement
B. Les unités ne servent presque à rien
👉 Choisis la bonne réponse.`;
  }

  if (theme === "chimie") {
    return `1) Question de réflexion : pourquoi faut-il bien écrire les symboles et les molécules en chimie ?
2) Petite vérification rapide :
A. H₂O et CO₂ représentent deux substances différentes
B. H₂O et CO₂ représentent la même chose
👉 Choisis la bonne réponse.`;
  }

  return `1) Question de réflexion : quelle idée importante retiens-tu de cette réponse ?
2) Petite vérification rapide :
A. Comprendre vaut mieux que mémoriser sans réfléchir
B. Mémoriser sans comprendre suffit toujours
👉 Choisis la bonne réponse.`;
}

function renforcerBlocConsolidation(corps = "", question = "") {
  let t = String(corps || "").trim();
  if (!t) return t;

  const blocPlus = construireQuestionsConsolidation(question, t);

  if (/❓\s*\[CONSOLIDATION\]/i.test(t)) {
    return t.replace(
      /(❓\s*\[CONSOLIDATION\]\s*:\s*[\s\S]*?)(?=\n👉|\n🌟|$)/i,
      (match) => {
        if (/question de réflexion/i.test(match) || /petite vérification rapide/i.test(match) || /choisis la bonne réponse/i.test(match)) {
          return match;
        }
        return `${match}\n\n${blocPlus}`;
      }
    );
  }

  return `${t}\n\n❓ [CONSOLIDATION] :\n\n${blocPlus}`;
}

function choisirOuvertureContextuelle(reponse = "", _user = {}, question = "") {
  const corps = String(reponse || "").toLowerCase();
  const q = String(question || "").toLowerCase().trim();

  if (estMessageRelationnelSimple(q)) {
    if (q.includes("merci")) return "👉 Reviens quand tu veux ; je t’accueillerai toujours avec plaisir.";
    if (q.includes("bonne nuit") || q.includes("bonne soirée") || q.includes("bonne soiree") || q.includes("à demain") || q.includes("a demain")) {
      return "👉 Repose-toi bien, et nous reprendrons ensemble quand tu reviendras.";
    }
    return "👉 Je reste disponible pour toi, dès que tu veux continuer.";
  }

  if (estQuestionTechnique(q)) return "👉 Essaie maintenant de continuer, puis envoie-moi ta réponse pour que je la vérifie avec toi.";
  if (corps.includes("géographie") || corps.includes("geographie") || corps.includes("rdc") || corps.includes("congo")) return "👉 Nous pouvons continuer avec une autre petite question de géographie.";
  return pick(OUVERTURES);
}

function choisirEncouragementContextuel(reponse = "") {
  const corps = String(reponse || "").toLowerCase();

  if (corps.includes("je n'arrive pas encore") || corps.includes("petit souci technique") || corps.includes("réessaie") || corps.includes("image plus nette") || corps.includes("message vocal plus clair")) {
    return "🌟 Mot d'encouragement : Ne te décourage pas ; même quand cela bloque un peu, nous pouvons reprendre calmement ensemble.";
  }

  if (corps.includes("bravo") || corps.includes("bonne réponse") || corps.includes("bonne reponse") || corps.includes("félicit")) {
    return "🌟 Mot d'encouragement : Bravo pour ton effort ; tu avances réellement, et cela fait plaisir à voir.";
  }

  if (corps.includes("méthode") || corps.includes("explication") || corps.includes("à retenir")) {
    return "🌟 Mot d'encouragement : Prends le temps de relire doucement ; une idée bien comprise reste plus solidement dans l’esprit.";
  }

  return "🌟 Mot d'encouragement : Avance pas à pas ; comprendre calmement vaut mieux que se précipiter.";
}

function construireReponseHumaineSimple(user = {}, texte = "") {
  const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";
  const t = String(texte || "").toLowerCase().trim();

  const salutations = [
    `Bonjour ${prenom}. Dis-moi ce que tu veux travailler.`,
    `Salut ${prenom}. Je t’écoute.`,
    `Bonjour. Je suis prêt à t’aider.`,
    `Bonsoir ${prenom}. Dis-moi ta question.`
  ];

  const remerciements = [
    `Avec plaisir ${prenom}.`,
    `Je t’en prie.`,
    `Toujours avec plaisir.`,
    `C’est normal ${prenom}.`
  ];

  const bonneNuit = [
    `Bonne nuit ${prenom}.`,
    `Bonne soirée ${prenom}.`,
    `À demain ${prenom}.`,
    `Repose-toi bien.`
  ];

  const reponsesCourtes = [
    `D'accord ${prenom}.`,
    `Très bien.`,
    `Je te suis.`,
    `Entendu.`
  ];

  if (t === "bonne nuit" || t === "bonne soirée" || t === "bonne soiree" || t === "à demain" || t === "a demain") {
    return pick(bonneNuit);
  }

  if (estMessageRemerciement(t)) {
    return pick(remerciements);
  }

  if (estMessageSalutation(t)) {
    return pick(salutations);
  }

  if (estMessageCourtHumain(t)) {
    return pick(reponsesCourtes);
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

function estErreurQuotaGemini(err) {
  const msg = String(err?.message || "").toLowerCase();
  const data = String(err?.response?.data ? JSON.stringify(err.response.data) : "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("too many requests") ||
    msg.includes("quota") ||
    data.includes("429") ||
    data.includes("too many requests") ||
    data.includes("quota")
  );
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
      const result = await model.generateContent(payload);
      return result;
    } catch (e) {
      lastError = e;
      console.error(`Erreur Gemini tentative ${tentative + 1}:`, e?.message || e);

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
    console.error("❌ AI Error:", e.message);
    return fallbackMessage;
  }
}

/* =========================================================
   4) DB
========================================================= */
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
      CREATE TABLE IF NOT EXISTS processed_topics (
        id SERIAL PRIMARY KEY,
        phone TEXT NOT NULL,
        sujet TEXT NOT NULL,
        question_originale TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS nom TEXT DEFAULT '';`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS classe TEXT DEFAULT '';`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS reve TEXT DEFAULT '';`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS historique JSONB DEFAULT '[]'::jsonb;`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS reminders_enabled BOOLEAN DEFAULT TRUE;`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
    await pool.query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);

    await pool.query(`ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS commentaire_ai TEXT DEFAULT '';`);
    await pool.query(`ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'db';`);
    await pool.query(`ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT '';`);
    await pool.query(`ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS provenance TEXT DEFAULT '';`);
    await pool.query(`ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);

    await pool.query(`UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;`);
    await pool.query(`UPDATE conversations SET historique = '[]'::jsonb WHERE historique IS NULL;`);
    await pool.query(`UPDATE conversations SET reminders_enabled = TRUE WHERE reminders_enabled IS NULL;`);

    await pool.query(`UPDATE bibliotheque SET commentaire_ai = '' WHERE commentaire_ai IS NULL;`);
    await pool.query(`UPDATE bibliotheque SET source_type = 'db' WHERE source_type IS NULL;`);
    await pool.query(`UPDATE bibliotheque SET source_url = '' WHERE source_url IS NULL;`);
    await pool.query(`UPDATE bibliotheque SET provenance = '' WHERE provenance IS NULL;`);
    await pool.query(`UPDATE bibliotheque SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL;`);

    console.log("✅ DB prête.");
  } catch (e) {
    console.error("Init DB Error:", e.message);
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
  return Array.isArray(user?.historique)
    ? user.historique
    : safeJsonParse(user?.historique, []);
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
    console.error("Erreur logUnansweredQuestion:", e.message);
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
    `DELETE FROM student_attempts
     WHERE phone = $1 AND sujet = $2`,
    [phone, sujet]
  );
}

async function resetAllStudentAttempts(phone) {
  await pool.query(
    `DELETE FROM student_attempts
     WHERE phone = $1`,
    [phone]
  );
}

/* =========================================================
   5) SÉCURITÉ WEBHOOK
========================================================= */
function verifierSignatureMeta(req) {
  try {
    const signature = req.get("x-hub-signature-256");
    if (!APP_SECRET || !signature || !req.rawBody) return false;

    const expectedSignature =
      "sha256=" +
      crypto
        .createHmac("sha256", APP_SECRET)
        .update(req.rawBody)
        .digest("hex");

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
   6) WHATSAPP
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
    console.error("Erreur WA:", e.response?.data || e.message);
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

  const contentType = String(response.headers["content-type"] || mediaInfo?.mime_type || "application/octet-stream").toLowerCase();
  const contentLength = Number(response.headers["content-length"] || response.data?.byteLength || 0);

  if (contentLength > maxBytes) {
    throw new Error("Fichier trop volumineux");
  }

  return {
    buffer: Buffer.from(response.data),
    mimeType: contentType
  };
}

/* =========================================================
   7) IA : DB -> GOOGLE SEARCH -> IA
========================================================= */
async function consulterBibliotheque(question = "", classe = "") {
  try {
    const termes = String(question || "").trim();
    if (!termes) return null;

    const q = `
      SELECT
        id, titre, matiere, classe, mots_cles, contenu, commentaire_ai,
        source_type, source_url, provenance, created_at, updated_at,
        ts_rank(
          to_tsvector(
            'simple',
            unaccent(
              coalesce(titre, '') || ' ' ||
              coalesce(matiere, '') || ' ' ||
              coalesce(mots_cles, '') || ' ' ||
              coalesce(contenu, '') || ' ' ||
              coalesce(commentaire_ai, '')
            )
          ),
          plainto_tsquery('simple', unaccent($1))
        ) AS score
      FROM bibliotheque
      WHERE
        to_tsvector(
          'simple',
          unaccent(
            coalesce(titre, '') || ' ' ||
            coalesce(matiere, '') || ' ' ||
            coalesce(mots_cles, '') || ' ' ||
            coalesce(contenu, '') || ' ' ||
            coalesce(commentaire_ai, '')
          )
        ) @@ plainto_tsquery('simple', unaccent($1))
        AND ($2 = '' OR unaccent(lower(coalesce(classe, ''))) LIKE unaccent(lower($3)))
      ORDER BY score DESC, updated_at DESC, id DESC
      LIMIT 1
    `;

    const motifClasse = `%${classe}%`;
    const { rows } = await pool.query(q, [termes, classe || "", motifClasse]);
    return rows[0] || null;
  } catch (e) {
    console.error("Erreur consulterBibliotheque:", e.message);
    return null;
  }
}

function estQuestionGeographieRDC(question = "", fiche = null) {
  const t = `${question} ${fiche?.matiere || ""} ${fiche?.titre || ""}`.toLowerCase();
  return (
    t.includes("rdc") ||
    t.includes("congo") ||
    t.includes("république démocratique du congo") ||
    t.includes("republique democratique du congo") ||
    t.includes("province") ||
    t.includes("provinces") ||
    t.includes("territoire") ||
    t.includes("territoires") ||
    t.includes("géographie") ||
    t.includes("geographie") ||
    t.includes("ville") ||
    t.includes("villes") ||
    t.includes("capitale") ||
    t.includes("fleuve") ||
    t.includes("lac") ||
    t.includes("frontière") ||
    t.includes("frontiere")
  );
}

function ficheEstFaible(fiche = null) {
  if (!fiche) return true;
  const contenu = String(fiche?.contenu || "").trim();
  const commentaire = String(fiche?.commentaire_ai || "").trim();
  if (!contenu && !commentaire) return true;
  if (contenu.length < 80 && commentaire.length < 50) return true;
  return false;
}

function fautChercherSurWeb(question = "", fiche = null) {
  const q = String(question || "").toLowerCase().trim();

  if (!q) return false;
  if (estMessageRelationnelSimple(q)) return false;

  const casWebFort = [
    "loi", "code", "article", "constitution", "juridique", "droit",
    "ohada", "impôt", "impot", "taxe", "tribunal", "procédure", "procedure",
    "géographie", "geographie", "rdc", "congo", "province", "territoire",
    "actualité", "actualite", "récent", "recent", "dernière", "derniere",
    "aujourd'hui", "aujourdhui", "actuel", "actuelle",
    "histoire", "date", "indépendance", "independance",
    "qui", "quand", "où", "ou", "combien", "pourquoi", "comment"
  ];

  if (casWebFort.some((mot) => q.includes(mot))) return true;

  if (!fiche) return true;
  if (ficheEstFaible(fiche)) return true;
  if (estQuestionGeographieRDC(question, fiche)) return true;

  return false;
}

function construireSystemPrompt(user) {
  const appelEleve = construireAppel(user);
  const classe = user?.classe ? `Classe de l'élève : ${user.classe}` : "Classe non précisée";
  const reve = user?.reve ? `Rêve de l'élève : ${user.reve}` : "Rêve non précisé";

  return `${SYSTEM_BASE}
${SYSTEM_TUTORAT}
${SYSTEM_JURIDIQUE_WEB}
PERSONNALISATION :
- Adresse l'élève ainsi : ${appelEleve}
- ${classe}
- ${reve}
INTERDICTION :
- Ne dis pas "mon élève"
- Utilise naturellement le prénom quand c'est utile
- Ne donne pas une réponse froide de moteur de recherche
- Ne répète jamais le header Mwalimu
- Ne génère jamais une citation finale
- Ne génère jamais une deuxième ouverture finale
- Ne génère jamais un mot d'encouragement final`;
}

async function appelerChatCompletion(messages) {
  const systemMessages = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content) }]
    }));

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemMessages,
    tools: [{ googleSearch: {} }]
  });

  const result = await genererAvecRetry(model, {
    contents,
    generationConfig: { temperature: 0.2 }
  });

  return result.response.text();
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
- Cherche des faits utiles et fiables pour répondre à la question
- Ne rédige pas encore la réponse finale de Mwalimu
- Donne seulement un CONTEXTE WEB BRUT, court, clair et factuel
- Si une information n'est pas certaine, dis-le honnêtement
- Si le sujet concerne la RDC, privilégie les informations les plus cohérentes et utiles pour la RDC
- Pas de citation finale
- Pas de mot d'encouragement
- Pas de structure VÉCU/SAVOIR/INSPIRATION/CONSOLIDATION`
      },
      ...historique.slice(-4),
      {
        role: "user",
        content: `QUESTION :
${question}
Donne un contexte web brut et utile.`
      }
    ]),
    ""
  );

  return String(reponse || "").trim();
}

async function detecterIntentionIA(user, texte = "", historique = []) {
  const system = construireSystemPrompt(user);
  const fallback = {
    intention: "question_normale",
    matiere: detecterMatiereScientifique(texte, "", null),
    besoinCorrectionRenforcee: false,
    sujet: extraireSujetMemoire(texte) || "general"
  };

  const brut = await safeAI(
    () => appelerChatCompletion([
      { role: "system", content: system },
      {
        role: "system",
        content: `Tu es un classificateur pédagogique.
Analyse seulement l’intention du message.
Réponds uniquement en JSON valide.
Format attendu :
{
  "intention": "salutation|remerciement|question_normale|exercice|soumission_reponse|audio|image|juridique|geographie_rdc",
  "matiere": "math|physique|chimie|general",
  "besoinCorrectionRenforcee": true,
  "sujet": "mot ou petit groupe de mots"
}
Règles :
- pas d'explication
- pas de markdown
- JSON uniquement`
      },
      ...historique.slice(-3),
      {
        role: "user",
        content: texte
      }
    ]),
    JSON.stringify(fallback)
  );

  try {
    const parsed = JSON.parse(brut);
    return {
      intention: parsed.intention || fallback.intention,
      matiere: parsed.matiere || fallback.matiere,
      besoinCorrectionRenforcee: Boolean(parsed.besoinCorrectionRenforcee),
      sujet: parsed.sujet || fallback.sujet
    };
  } catch {
    return fallback;
  }
}

async function construireConsigneAntiBoucle(user, texteUtilisateur = "", historique = []) {
  const analyse = await detecterIntentionIA(user, texteUtilisateur, historique);
  const sujet = analyse.sujet || extraireSujetMemoire(texteUtilisateur) || "general";

  if (analyse.intention !== "soumission_reponse" && !estSoumissionReponse(texteUtilisateur)) {
    return {
      sujet,
      tentative: 0,
      consigne: ""
    };
  }

  const tentative = await saveStudentAttempt(
    user.phone,
    sujet,
    texteUtilisateur,
    texteUtilisateur
  );

  if (tentative < 3) {
    return {
      sujet,
      tentative,
      consigne: `L'élève a proposé une réponse.
Tu dois corriger avec douceur.
Ne donne pas tout de suite la solution complète.
Aide-le à voir où se trouve l'erreur.`
    };
  }

  return {
    sujet,
    tentative,
    consigne: `L'élève s'est probablement trompé plusieurs fois sur le même point.
Tu dois maintenant renforcer fortement l'aide pédagogique :
- simplifie davantage
- découpe en étapes très petites
- donne un indice beaucoup plus fort
- donne un exemple très proche
- enlève toute complication inutile
- garde un ton très encourageant
- évite la frustration`
  };
}

async function construireReponseDbWebIa(user, questionEleve, historique = [], fiche = null, consignePedagogique = "") {
  const system = construireSystemPrompt(user);
  const commentaireAI = fiche?.commentaire_ai || "";

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
${commentaireAI || ""}`
    : `CONTEXTE DB :
Aucune fiche locale disponible.`;

  return await safeAI(
    () => appelerChatCompletion([
      { role: "system", content: system },
      {
        role: "system",
        content: `RÈGLE FONDAMENTALE :
- Tu utilises le WEB comme source principale
- Tu utilises la DB seulement comme appui
- Tu ne réponds jamais comme un moteur de recherche

FORMAT OBLIGATOIRE :
- Tu dois STRICTEMENT respecter :
🔵 [VÉCU]
🟡 [SAVOIR]
🔴 [INSPIRATION]
❓ [CONSOLIDATION]

STYLE :
- humain, chaleureux, naturel
- pas robotique
- pas trop long
- pas de copier-coller du web

CAS JURIDIQUE (TRÈS IMPORTANT) :
- Si la question concerne un ARTICLE DE LOI :
  1. Reproduis l’article dans son intégralité si disponible de manière fiable
  2. Ensuite explique simplement
  3. Ne jamais inventer un article
  4. Si incertain → dire honnêtement

IMPORTANT :
- Ne jamais répondre comme Google
- Toujours expliquer comme un professeur
- Toujours guider l’élève`
      },
      { role: "system", content: consignePedagogique || "Sois pédagogique et clair." },
      ...historique.slice(-5),
      {
        role: "user",
        content: `QUESTION :
${questionEleve}

${blocWeb}

${blocDB}

Donne maintenant la réponse finale complète de Mwalimu.`
      }
    ]),
    `🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Je n'ai pas encore pu produire une réponse claire.
🔴 [INSPIRATION] : Ce n’est pas un problème ; nous pouvons reprendre plus simplement.
❓ [CONSOLIDATION] : Reformule ta question en une seule phrase.`
  );
}

async function reponseAudioUneSeulePasse(user, audioBuffer, mimeType, historique = [], fiche = null) {
  const system = construireSystemPrompt(user);
  const commentaireAI = fiche?.commentaire_ai || "";

  const blocDB = fiche
    ? `CONTEXTE DB :
Titre : ${fiche?.titre || "Sans titre"}
Matière : ${fiche?.matiere || "Non précisée"}
Classe : ${fiche?.classe || "Non précisée"}
Contenu DB :
${tronquerTexte(fiche?.contenu || "", 3000)}
Commentaire IA :
${tronquerTexte(commentaireAI || "Aucun commentaire IA.", 1200)}`
    : `CONTEXTE DB :
Aucune fiche locale fiable trouvée.`;

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${system}
MODE AUDIO GEMINI :
- Tu es Gemini Audio
- Commence toujours par dire : "J'ai bien reçu ton audio."
- Tu écoutes l’audio, tu comprends la question et tu réponds directement
- Si un mot n’est pas clair, tu le dis honnêtement
- Tu peux utiliser Google Search si nécessaire
- Utilise la DB d’abord, puis le web, puis l’IA pour rédiger
- Sois très succinct quand c'est possible
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
              {
                text: `${blocDB}
Consigne pédagogique :
${construireConsignePedagogique("", "audio")}
Écoute cet audio et réponds pédagogiquement.`
              },
              { inlineData: { mimeType, data: audioBuffer.toString("base64") } }
            ]
          }
        ],
        generationConfig: { temperature: 0.2 }
      });
      return r.response.text();
    },
    ``
  );
}

async function expliquerImageAvecIA(user, base64Image, mimeType, historique = []) {
  const system = construireSystemPrompt(user);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${system}
MODE IMAGE :
- Commence toujours par dire : "J'ai bien reçu ton image."
- ${PROMPT_IMAGE_TYPES}
- Recopie clairement ce qui est visible
- Si une partie est floue, dis-le honnêtement
- Utilise Google Search si cela aide à vérifier ou compléter
- Puis explique avec pédagogie
- Sois succinct lorsque c'est possible
- Ne fais pas tout l'exercice à la place de l'élève
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
        {
          text: `Analyse cette image ou cette photo. Commence obligatoirement par dire : J'ai bien reçu ton image.
${PROMPT_IMAGE_TYPES}
Ensuite, recopie clairement ce qui est visible ou lisible. S'il y a une partie floue ou illisible, dis-le honnêtement. Puis explique pas à pas avec pédagogie.`
        },
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
    ``
  );
}

function construireMessageFinal(user, reponseBrute, historique = [], question = "", fiche = null) {
  const reponseNettoyee = nettoyerReponseIA(reponseBrute);
  const sortieScientifique = appliquerLes4EtapesScientifiques(reponseNettoyee, question, fiche);
  const reponseHumanisee = humaniserDebutReponse(sortieScientifique.texte);
  const corpsAvecStructure = verifierStructureMwalimu(reponseHumanisee, user, historique, question);
  const corpsRenforce = renforcerBlocConsolidation(corpsAvecStructure, question);
  let corps = adapterTexteGenre(corpsRenforce, user.nom);
  corps = nettoyerAppelsRepetitifs(corps, user.nom);
  const ouverture = adapterTexteGenre(choisirOuvertureContextuelle(corps, user, question), user.nom);
  const encouragement = choisirEncouragementContextuel(corps);
  const citation = choisirCitationContextuelle(corps, question);

  return `${HEADER_MWALIMU}
${corps}
${ouverture}
${encouragement}
${citation}`.replace(/\n{3,}/g, "\n\n").trim();
}

function messageSecours(user) {
  const appel = `${genreEleve(user?.nom || "élève")} **${normaliserNom(user?.nom || "élève").split(" ")[0]}**`;
  return `${HEADER_MWALIMU}
🔵 [VÉCU] : J'ai bien reçu ton message, ${appel}.
🟡 [SAVOIR] : Je rencontre un petit souci technique pour traiter ta demande correctement maintenant.
🔴 [INSPIRATION] : Même quand cela bloque un peu, on peut reprendre avec calme et méthode.
❓ [CONSOLIDATION] : Réessaie dans un instant, ou reformule ta question plus simplement. Tu peux aussi m'envoyer une seule question à la fois.
👉 Je reste à tes côtés.
🌟 Mot d'encouragement : Même quand cela bloque un peu, on continue avec calme et méthode.
${pick(CITATIONS.general)}`.replace(/\n{3,}/g, "\n\n").trim();
}

/* =========================================================
   8) PÉDAGOGIE / CONSIGNES
========================================================= */
function construireConsignePedagogique(texte = "", type = "text") {
  const t = String(texte || "");

  if (type === "image") {
    return `MODE PÉDAGOGIQUE IMAGE :
- Il s'agit probablement d'un exercice ou d'une leçon envoyé(e) en image
- ${PROMPT_IMAGE_TYPES}
- Commence toujours par dire que tu as bien reçu l'image
- Recopie d'abord ce qui est visible
- Si une partie est floue, tu le dis honnêtement
- Tu expliques la démarche
- Tu aides l'élève à comprendre
- Tu ne résous pas tout jusqu'à la réponse finale
- Sois bref et clair
- Dans la CONSOLIDATION, pose une question de réflexion liée au sujet
- Ajoute aussi, quand c'est pertinent, une seule question à choix multiple simple
- Tu termines en demandant à l'élève d'essayer lui-même puis de t'envoyer sa réponse`;
  }

  if (type === "audio") {
    return `MODE PÉDAGOGIQUE AUDIO :
- Il s'agit d'un message vocal
- Commence toujours par dire que tu as bien reçu l'audio
- L’analyse vient de Gemini Audio
- Tu réponds ensuite avec chaleur et pédagogie
- Sois bref et clair
- Dans la CONSOLIDATION, pose une question de réflexion liée au sujet
- Ajoute aussi, quand c'est pertinent, une seule question à choix multiple simple`;
  }

  if (estSoumissionReponse(t)) {
    return `MODE CORRECTION BIENVEILLANTE :
- L'élève soumet probablement sa propre réponse
- Tu dois d'abord féliciter son effort
- Tu vérifies calmement
- Tu corriges avec douceur si nécessaire
- Tu expliques précisément l'erreur
- Sois bref et clair
- Dans la CONSOLIDATION, pose une question de réflexion liée au sujet
- Ajoute aussi, quand c'est pertinent, une seule question à choix multiple simple
- Tu encourages l'élève avec chaleur`;
  }

  if (estQuestionTechnique(t)) {
    return `MODE EXERCICE GUIDÉ :
- C'est un exercice ou un calcul
- Tu expliques la méthode
- Tu montres le démarrage utile
- Tu ne donnes pas la réponse finale complète à la place de l'élève
- Sois bref et clair
- Dans la CONSOLIDATION, pose une question de réflexion liée au sujet
- Ajoute aussi, quand c'est pertinent, une seule question à choix multiple simple
- Tu invites l'élève à continuer
- Tu lui demandes ensuite de t'envoyer sa réponse pour vérification`;
  }

  return `MODE ÉCHANGE NORMAL :
- Réponds naturellement
- Sois humain, chaleureux, utile et succinct
- Dans la CONSOLIDATION, pose une question de réflexion liée au sujet
- Ajoute aussi, quand c'est pertinent, une seule question à choix multiple simple`;
}

/* =========================================================
   9) TRAITEMENT PAR TYPE DE MESSAGE
========================================================= */
async function traiterTexte(user, texteUtilisateur, historique) {
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
    texteMin.includes("geographie");

  if (besoinAnalyseIA) {
    analyse = await detecterIntentionIA(user, texteUtilisateur, historique);
  }

  const fiche = await consulterBibliotheque(texteUtilisateur, user.classe || "");
  const consigneBase = construireConsignePedagogique(texteUtilisateur, "text");
  const antiBoucle = await construireConsigneAntiBoucle(user, texteUtilisateur, historique);
  let consigneFinale = consigneBase;

  if (analyse.intention === "juridique") {
    consigneFinale += `
Le message semble juridique.
S'il s'agit d'un article de loi, commence par reprendre l'article intégral seulement si le texte exact est fiable.
Ensuite fais un commentaire bref, clair et utile.
Sois prudent, clair et succinct.`;
  }

  if (analyse.intention === "geographie_rdc") {
    consigneFinale += `
Le message semble concerner la géographie de la RDC.
La recherche web peut être utilisée même si une fiche DB existe.
Sois succinct.`;
  }

  if (analyse.intention === "exercice") {
    consigneFinale += `
Le message semble être un exercice.
Explique la méthode avant tout résultat.
Sois succinct.`;
  }

  if (analyse.intention === "soumission_reponse") {
    consigneFinale += `
Le message semble être une réponse proposée par l'élève.
Corrige avec douceur, précision, patience et brièveté.`;
  }

  if (antiBoucle.consigne) {
    consigneFinale += `
${antiBoucle.consigne}`;
  }

  const reponse = await construireReponseDbWebIa(
    user,
    texteUtilisateur,
    historique,
    fiche,
    consigneFinale
  );

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
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton audio.
🟡 [SAVOIR] : Mais je n'arrive pas à l'ouvrir correctement.
🔴 [INSPIRATION] : Ne t'inquiète pas, cela peut arriver.
❓ [CONSOLIDATION] : Réessaie avec un autre message vocal plus clair.`,
      fiche: null
    };
  }

  const { buffer, mimeType } = await telechargerMedia(audioId, 8 * 1024 * 1024);
  console.log("🎧 MIME audio reçu :", mimeType);

  if (!estMimeAudioSupporte(mimeType)) {
    return {
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton audio.
🟡 [SAVOIR] : Le format audio n'est pas encore supporté.
🔴 [INSPIRATION] : Ce n’est pas grave ; nous pouvons essayer autrement.
❓ [CONSOLIDATION] : Envoie-moi un audio en OGG, MP3, MP4, WAV, WEBM, AAC ou AMR.`,
      fiche: null
    };
  }

  const fiche = null;
  let reponse = await reponseAudioUneSeulePasse(user, buffer, mimeType, historique, fiche);

  if (!reponse || !String(reponse).trim()) {
    reponse = `🔵 [VÉCU] : J'ai bien reçu ton audio.
🟡 [SAVOIR] : Je n'arrive pas encore à le traiter correctement avec Gemini Audio.
🔴 [INSPIRATION] : Ce n’est pas grave ; nous pouvons réessayer calmement.
❓ [CONSOLIDATION] : Envoie-moi un message vocal plus clair et sans bruit autour.`;
  }

  if (!reponse || !String(reponse).trim()) {
    await logUnansweredQuestion(user, "[audio envoyé]", "audio", "audio_empty");
  }

  return { reponse, fiche: fiche || null };
}

async function traiterImage(user, msg, historique) {
  const imageId = msg.image?.id;

  if (!imageId) {
    return {
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Mais je n'arrive pas à l'ouvrir correctement.
🔴 [INSPIRATION] : Nous allons y arriver en reprenant tranquillement.
❓ [CONSOLIDATION] : Réessaie en envoyant une image plus nette.`,
      fiche: null
    };
  }

  const { buffer, mimeType } = await telechargerMedia(imageId, 8 * 1024 * 1024);
  console.log("🖼️ MIME image reçu :", mimeType);

  if (!estMimeImageSupporte(mimeType)) {
    return {
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Le format d’image n'est pas encore supporté.
🔴 [INSPIRATION] : Ce n’est pas grave ; nous pouvons essayer autrement.
❓ [CONSOLIDATION] : Envoie-moi une image ou une photo en JPG, JPEG, PNG, WEBP, GIF, BMP, HEIC ou HEIF.`,
      fiche: null
    };
  }

  const base64Image = buffer.toString("base64");
  let reponse = await expliquerImageAvecIA(user, base64Image, mimeType, historique);

  if (!reponse || !String(reponse).trim()) {
    reponse = `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Je n'arrive pas encore à l'analyser correctement.
🔴 [INSPIRATION] : Ce n’est pas grave ; nous pouvons reprendre calmement.
❓ [CONSOLIDATION] : Envoie-moi une image plus nette ou mieux cadrée.`;
  }

  if (!reponse || !String(reponse).trim()) {
    await logUnansweredQuestion(user, "[image envoyée]", "image", "image_empty");
  }

  return { reponse, fiche: null };
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
🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Les rappels du matin sont maintenant arrêtés.
🔴 [INSPIRATION] : Tu gardes ainsi le contrôle de ton rythme.
❓ [CONSOLIDATION] : Si tu veux les réactiver plus tard, envoie simplement /start.`
    );
    return true;
  }

  if (cmd === "/start") {
    await updateUserField(from, "reminders_enabled", true);
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}
🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Les rappels du matin sont maintenant réactivés.
🔴 [INSPIRATION] : Une bonne régularité aide souvent à mieux progresser.
❓ [CONSOLIDATION] : Nous pourrons continuer ensemble pas à pas.`
    );
    return true;
  }

  if (cmd === "/reset") {
    await updateUserField(from, "historique", JSON.stringify([]));
    await resetAllStudentAttempts(from);
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}
🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : L'historique de l’échange a été remis à zéro.
🔴 [INSPIRATION] : Repartir proprement peut aussi aider à mieux comprendre.
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
      SELECT phone, nom, classe, reve
      FROM conversations
      WHERE coalesce(phone, '') <> ''
        AND coalesce(nom, '') <> ''
        AND coalesce(reminders_enabled, TRUE) = TRUE
    `);

    for (const eleve of rows) {
      try {
        const prenom = normaliserNom(eleve.nom).split(" ")[0] || "élève";
        const appel = `${genreEleve(prenom)} **${prenom}**`;
        const citation = pick(CITATIONS.patriotisme);

        const messageRappel = `${HEADER_MWALIMU}
🔵 [VÉCU] : Bonjour ${appel}. J’espère que tu as bien commencé ta journée.
🟡 [SAVOIR] : Petit rappel du matin : avance aujourd’hui avec calme, sérieux et confiance. Même un petit effort bien fait peut te rapprocher de ton rêve.
🔴 [INSPIRATION] : Ton objectif n’est pas d’aller vite, mais de bien comprendre. C’est ainsi qu’on bâtit un avenir solide.
❓ [CONSOLIDATION] : Dis-moi plus tard : quelle matière veux-tu travailler aujourd’hui ?
👉 Je reste à tes côtés pour t’accompagner pas à pas.
🌟 Mot d'encouragement : Un élève constant finit toujours par progresser.
${citation}`.replace(/\n{3,}/g, "\n\n").trim();

        await envoyerWhatsApp(eleve.phone, messageRappel);
      } catch (e) {
        console.error("Erreur envoi rappel matinal:", e.message);
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
   12) WEBHOOK PRINCIPAL
========================================================= */
app.post("/webhook", async (req, res) => {
  if (!verifierSignatureMeta(req)) {
    return res.sendStatus(403);
  }

  const msg = extraireMessageWhatsApp(req.body);
  if (!msg) return res.sendStatus(200);

  res.sendStatus(200);

  const from = msg.from;
  const msgId = msg.id;
  const texteUtilisateur = msg.text?.body?.trim() || "";
  const msgType = typeMessage(msg);

  try {
    const check = await pool.query(
      "INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT DO NOTHING",
      [msgId]
    );
    if (check.rowCount === 0) return;

    let user = await getUser(from);

    if (!user) {
      await createUser(from);
      user = await getUser(from);
      return await envoyerWhatsApp(
        from,
        `${HEADER_MWALIMU}
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

      const appel = `${genreEleve(user.nom)} **${user.nom}**`;
      return await envoyerWhatsApp(
        from,
        `✨ *Quelle ambition magnifique !*
🔴 Devenir *${rv}* est un rêve noble, et je sais que tu en es capable, ${appel}.
🔵 *Pour commencer notre parcours ensemble, dis-moi :*
👉 Quelle est la matière ou le chapitre qui te pose problème en ce moment ?`
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

      contenuUtilisateurPourMemoire = "[audio envoyé]";
      await appendHistorique(from, "user", contenuUtilisateurPourMemoire);

      const userFresh = await getUser(from);
      historique = Array.isArray(userFresh?.historique)
        ? userFresh.historique
        : safeJsonParse(userFresh?.historique, []);
    } else if (msgType === "image") {
      const resultat = await traiterImage({ ...user, phone: from }, msg, historique);
      reponseBrute = resultat?.reponse || "";
      ficheContexte = resultat?.fiche || null;

      contenuUtilisateurPourMemoire = "[image envoyée]";
      await appendHistorique(from, "user", contenuUtilisateurPourMemoire);

      const userFresh = await getUser(from);
      historique = Array.isArray(userFresh?.historique)
        ? userFresh.historique
        : safeJsonParse(userFresh?.historique, []);
    } else {
      reponseBrute = `🔵 [VÉCU] : J'ai bien reçu ton message.
🟡 [SAVOIR] : Pour l'instant, je traite surtout les textes, les audios et les images.
🔴 [INSPIRATION] : Nous pouvons déjà avancer correctement avec ces formats.
❓ [CONSOLIDATION] : Envoie-moi ta question par écrit, par audio ou avec une image nette de l'exercice.`;
    }

    if (!reponseBrute || !String(reponseBrute).trim()) {
      await logUnansweredQuestion({ ...user, phone: from }, texteUtilisateur || contenuUtilisateurPourMemoire, msgType, "final_empty");
      reponseBrute = `🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Je n'ai pas encore pu produire une réponse claire.
🔴 [INSPIRATION] : Ce n’est pas un problème ; nous pouvons reprendre plus simplement.
❓ [CONSOLIDATION] : Reformule ta question en une seule phrase, et je t'aiderai pas à pas.`;
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
  } catch (e) {
    console.error("Erreur générale:", e.response?.data || e.message);

    try {
      let user = await getUser(from);
      if (!user) user = { nom: "élève" };

      if (estErreurQuotaGemini(e)) {
        await envoyerWhatsApp(
          from,
          `${HEADER_MWALIMU}
🔵 [VÉCU] : J'ai bien reçu ton message.
🟡 [SAVOIR] : Je suis momentanément très sollicité et je dois ralentir un peu pour bien te répondre.
🔴 [INSPIRATION] : Ce petit contretemps n’empêche pas notre progression.
❓ [CONSOLIDATION] : Réessaie dans une minute avec la même question, ou envoie-la par écrit si c'était un audio ou une image.`
        );
        return;
      }

      await envoyerWhatsApp(from, messageSecours(user));
    } catch (e2) {
      console.error("Erreur secours:", e2.message);
    }
  }
});

/* =========================================================
   13) WEBHOOK VERIFY + HEALTHCHECK
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
