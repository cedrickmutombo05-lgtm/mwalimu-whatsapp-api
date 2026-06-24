

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

const {
  PORT,
  GEMINI_API_KEY,
  DATABASE_URL,
  TOKEN,
  PHONE_NUMBER_ID,
  VERIFY_TOKEN,
  APP_SECRET
} = require("./src/config");

const {
  logInfo,
  logWarn,
  logError,
  nowMs,
  makeCacheKey,
  getCache,
  setCache,
  runSequentialByKey,
  pick,
  safeJsonParse,
  attendre,
  tronquerTexte,
  estErreurQuotaGemini,
  normaliserNom,
  premierPrenom,
  nettoyer,
  retirerAccents,
  normaliserMessageCourt,
  normaliserTexteRelationnel,
  construireAppel,
  adapterTexteGenre,
  nettoyerAppelsRepetitifs,
  supprimerFormulesLourdesDAppel,
  supprimerDoublonsLignes,
  simplifierNotationMath,
  simplifierPresentationScientifique
} = require("./src/utils");
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
  legacyHeaders: false,
  message: "Too many requests"
}));


/* =========================================================
   3) CONSTANTES
========================================================= */

const {
  HEADER_MWALIMU,
  SEPARATOR,
  CITATIONS,
  OUVERTURES,
  MATIERE_MATH,
  MATIERE_PHYSIQUE,
  MATIERE_CHIMIE,
  MATIERE_GENERAL,
  REGLE_FORMAT_MATH,
  REGLE_CALCUL,
  SYSTEM_BASE,
  JSON_SCHEMA_INTENTION,
  JSON_SCHEMA_AUDIO
} = require("./src/constants");

/* =========================================================
   6) SOCIAL
========================================================= */
function estMessageSalutation(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  return /^(bonjour|bonsoir|salut|hello|coucou|bjr|bsr|mbote|yo|cc|slt|bonne nuit|bonne soiree|bonne journee|bon apres midi|bon week end|bon weekend|a demain)$/.test(t);
}

function estMessageRemerciement(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  return /^(merci|merci beaucoup|grand merci|mille mercis|merci infiniment|merci encore|merci bien|ok merci|okay merci|je te remercie|je vous remercie|merci pour tout|merci pour ton aide|merci pour votre aide)$/.test(t);
}

function estMessageCourtHumain(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  return [
    "ok", "okay", "d accord", "oui", "non", "ca va", "ca va merci",
    "bien", "super", "cool", "entendu", "compris", "parfait",
    "tres bien", "nickel", "ca marche", "pas mal", "tranquille"
  ].includes(t);
}

function estQuestionBienEtre(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  return /^(tu vas bien|comment vas tu|comment tu vas|et toi|et vous|vous allez bien|comment ca va|ca va)$/.test(t);
}

function estReponseBienEtre(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  return /^(je vais bien|je vais tres bien|je vais bien merci|je me porte bien|je me sens bien|bien merci|ca va|ca va bien|ca va merci|tranquille|super|cool|pas mal|au top|oui ca va|oui je vais bien)( et toi)?$/.test(t);
}

function estMessagePurementSocial(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;
  if (estMessageSalutation(t)) return true;
  if (estMessageRemerciement(t)) return true;
  if (estMessageCourtHumain(t)) return true;
  if (estQuestionBienEtre(t)) return true;
  if (estReponseBienEtre(t)) return true;
  if (/^[\u{1F300}-\u{1FAFF}\s]+$/u.test(t)) return true;
  return false;
}

function dernierAssistantQuestionBienEtre(historique = []) {
  const dernier = [...historique].reverse().find((m) => m.role === "assistant");
  if (!dernier) return false;
  const t = normaliserTexteRelationnel(dernier.content || "");
  return (
    t.includes("comment vas tu") ||
    t.includes("comment te sens tu") ||
    t.includes("comment se passe ta journee") ||
    t.includes("comment s est passee ta journee") ||
    t.includes("est ce que tout va bien")
  );
}

function construireReponseHumaineSimple(user = {}, texte = "", historique = []) {
  const appel = construireAppel(user);
  const t = normaliserTexteRelationnel(texte);
  const heure = new Date().getHours();

  if (dernierAssistantQuestionBienEtre(historique) && estReponseBienEtre(t)) {
    return pick([
      `Tant mieux ${appel} 😊 Quelle matière veux-tu travailler maintenant ?`,
      `Je suis content de l'entendre ${appel}. Dis-moi ce que tu veux réviser.`,
      `Très bien ${appel} 😊 On peut maintenant passer à une leçon ou un exercice.`
    ]);
  }

  if (estMessageRemerciement(t)) {
    return pick([
      `Avec plaisir ${appel} 😊 Dis-moi si tu veux revoir quelque chose.`,
      `Je t'en prie ${appel} 🤗 Une autre question ?`,
      `C'est normal ${appel}, je suis là pour t'aider 💪`
    ]);
  }

  if (estQuestionBienEtre(t)) {
    return pick([
      `Je vais très bien, merci ${appel} 😊 Et toi, comment vas-tu ?`,
      `Tout va bien de mon côté ${appel}. Quelle matière veux-tu explorer aujourd'hui ?`,
      `Je suis prêt à t'aider ${appel} 😊 Qu'aimerais-tu apprendre ?`
    ]);
  }

  if (estMessageSalutation(t)) {
    if (t.includes("bonsoir")) {
      return pick([
        `Bonsoir ${appel} 🌙 Comment s'est passée ta journée ?`,
        `Bonsoir ${appel} 😊 As-tu une matière ou un exercice à revoir ?`
      ]);
    }

    if (t.includes("bonne nuit")) {
      return `Bonne nuit ${appel} 🌙 Repose-toi bien.`;
    }

    if (t.includes("a demain")) {
      return `À demain ${appel} 👋 Nous continuerons calmement.`;
    }

    if (heure < 12) {
      return pick([
        `Bonjour ${appel} ☀️ Comment vas-tu aujourd'hui ?`,
        `Salut ${appel} 😊 J'espère que tu vas bien. Quelle matière veux-tu travailler ?`
      ]);
    }

    if (heure < 18) {
      return pick([
        `Bon après-midi ${appel} 🌤 Comment se passe ta journée ?`,
        `Salut ${appel} 😊 Quelle notion veux-tu revoir ?`
      ]);
    }

    return pick([
      `Bonsoir ${appel} 🌙 Comment s'est passée ta journée ?`,
      `Bonsoir ${appel} 😊 Qu'aimerais-tu apprendre maintenant ?`
    ]);
  }

  if (estMessageCourtHumain(t)) {
    return pick([
      `D'accord ${appel} 👍 Tu as une matière à revoir ?`,
      `Parfait ${appel} ✅ Envoie-moi ta question.`,
      `Entendu ${appel} 😉 Je suis prêt à t'aider.`
    ]);
  }

  return "";
}

/* =========================================================
   7) DÉTECTION PÉDAGOGIQUE
========================================================= */
function estSoumissionReponse(texte = "") {
  const t = String(texte || "").toLowerCase().trim();
  const indices = [
    "ma réponse", "ma reponse", "j'ai trouvé", "jai trouvé", "voici ma réponse",
    "voici ma reponse", "mon résultat", "mon resultat", "j'obtiens",
    "j'ai obtenu", "le résultat est", "le resultat est", "ça donne", "ca donne"
  ];
  if (indices.some((i) => t.includes(i))) return true;
  if (/^[0-9xXyYzZ\s=+\-÷/*().,]+$/.test(t) && t.length <= 80) return true;
  return false;
}

function estQuestionTechnique(texte = "") {
  const t = String(texte || "").toLowerCase();
  return [
    "calcule", "calculer", "résous", "resous", "équation", "equation",
    "fraction", "physique", "chimie", "exercice", "problème", "probleme",
    "géométrie", "geometrie", "puissance", "racine", "math", "maths", "formule"
  ].some((m) => t.includes(m));
}

function estQuestionAcademique(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t || t.length < 4) return false;
  if (estMessagePurementSocial(t)) return false;

  return [
    "explique", "c est quoi", "qu est ce que", "comment", "pourquoi",
    "quand", "ou", "qui", "combien", "quelle", "quel", "quels", "quelles",
    "math", "maths", "equation", "calcul", "physique", "chimie",
    "histoire", "geographie", "francais", "grammaire", "conjugaison",
    "droit", "loi", "article", "constitution", "province", "territoire",
    "exercice", "probleme", "aide", "comprendre", "apprendre",
    "cours", "lecon", "chapitre", "matiere", "examen", "revision",
    "peux tu", "dis moi", "je voudrais", "explique moi"
  ].some((mot) => t.includes(mot));
}

function extraireSujetMemoire(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t || estMessagePurementSocial(t)) return "";

  const sujets = [
    "math", "mathematiques", "equation", "fraction", "histoire", "geographie",
    "francais", "grammaire", "droit", "loi", "article", "rdc", "congo",
    "province", "territoire", "commune", "ville", "physique", "chimie"
  ];

  for (const s of sujets) {
    if (t.includes(s)) return s;
  }

  return t.split(" ").slice(0, 4).join(" ");
}

function detecterMatierePrincipale(question = "", corps = "") {
  const q = normaliserTexteRelationnel(question);
  const c = normaliserTexteRelationnel(corps);
  const base = `${q} ${c}`;

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

  const add = (theme, mots, poids = 1) => {
    for (const mot of mots) {
      if (base.includes(mot)) scores[theme] += poids;
    }
  };

  add("droit", ["droit", "loi", "code", "article", "juridique", "tribunal", "ohada", "constitution"], 4);
  add("geographie", ["geographie", "province", "territoire", "commune", "ville", "secteur", "chefferie"], 4);
  add("histoire", ["histoire", "passe", "colonisation", "independance", "royaume", "date historique"], 4);
  add("math", ["math", "maths", "equation", "fraction", "calcul", "racine", "puissance", "geometrie"], 4);
  add("physique", ["physique", "force", "vitesse", "energie", "masse", "pression", "mouvement"], 4);
  add("chimie", ["chimie", "molecule", "atome", "acide", "base", "solution", "reaction"], 4);
  add("francais", ["francais", "grammaire", "orthographe", "conjugaison", "verbe", "phrase"], 4);

  let best = "general";
  let score = 0;

  for (const [k, v] of Object.entries(scores)) {
    if (v > score) {
      best = k;
      score = v;
    }
  }

  return score > 0 ? best : "general";
}

function detecterMatiereScientifique(question = "", reponse = "", fiche = null) {
  const base = [
    question,
    reponse,
    fiche?.matiere || "",
    fiche?.titre || "",
    fiche?.contenu || ""
  ].join(" ").toLowerCase();

  const score = { math: 0, physique: 0, chimie: 0 };

  ["math", "maths", "équation", "equation", "fraction", "racine", "calcul"].forEach((m) => {
    if (base.includes(m)) score.math += 2;
  });

  ["physique", "force", "vitesse", "énergie", "energie", "masse", "distance", "temps"].forEach((m) => {
    if (base.includes(m)) score.physique += 2;
  });

  ["chimie", "mol", "solution", "acide", "base", "h2o", "co2", "o2", "nacl"].forEach((m) => {
    if (base.includes(m)) score.chimie += 2;
  });

  const max = Math.max(score.math, score.physique, score.chimie);
  if (max <= 0) return MATIERE_GENERAL;
  if (score.chimie === max) return MATIERE_CHIMIE;
  if (score.physique === max) return MATIERE_PHYSIQUE;
  return MATIERE_MATH;
}

/* =========================================================
   8) NETTOYAGE FINAL
========================================================= */
function simplifierNotationMath(texte = "") {
  let t = String(texte || "");
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
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function nettoyerReponseIA(texte = "") {
  let t = String(texte || "");
  t = t.replace(/🔴🟡🔵\s*\*?Mwalimu EdTech\s*:\s*Ton Mentor pour l'Excellence\*?\s*🇨🇩/gi, "");
  t = t.replace(/^🌟\s*Mot d['’]encouragement\s*:.*$/gim, "");
  t = t.replace(/^👉\s*Je reste disponible.*$/gim, "");
  t = t.replace(/^👉\s*Continue à me parler.*$/gim, "");
  t = t.replace(/\bfuture avocate\b/gi, "future professionnelle");
  t = t.replace(/\bfutur avocat\b/gi, "futur professionnel");
  t = t.replace(/\bmon élève\b/gi, "élève");
  return supprimerDoublonsLignes(t);
}

function blocEstPertinent(bloc = "") {
  return String(bloc || "").includes("?") && String(bloc || "").length > 20;
}

function construireQuestionConsolidation(question = "", corps = "") {
  const matiere = detecterMatierePrincipale(question, corps);
  const sujet = extraireSujetMemoire(question) || "cette notion";

  const modeles = {
    droit: `❓ [CONSOLIDATION] : Explique avec tes mots l'idée juridique principale de ${sujet}.`,
    geographie: `❓ [CONSOLIDATION] : Donne un exemple concret lié à ${sujet}.`,
    histoire: `❓ [CONSOLIDATION] : Quelle idée importante retiens-tu de ${sujet} ?`,
    math: `❓ [CONSOLIDATION] : Reprends la méthode en une phrase, puis essaie une étape.`,
    physique: `❓ [CONSOLIDATION] : Quelle unité ou formule principale dois-tu retenir ici ?`,
    chimie: `❓ [CONSOLIDATION] : Quelle erreur faut-il éviter dans cette notion ?`,
    francais: `❓ [CONSOLIDATION] : Donne un autre exemple avec tes propres mots.`,
    general: `❓ [CONSOLIDATION] : Résume l'idée principale avec tes mots.`
  };

  return modeles[matiere] || modeles.general;
}

function verifierStructureMwalimu(corps = "", user = {}, historique = [], question = "") {
  let t = String(corps || "").trim();

  const aVecu = /🔵\s*\[VÉCU\]/i.test(t);
  const aSavoir = /🟡\s*\[SAVOIR\]/i.test(t);
  const aInspiration = /🔴\s*\[INSPIRATION\]/i.test(t);
  const aConsolidation = /❓\s*\[CONSOLIDATION\]/i.test(t);

  if (aVecu && aSavoir && aInspiration && aConsolidation) return t;

  const prenom = premierPrenom(user?.nom || "");
  const matiere = detecterMatierePrincipale(question, t);

  const vecu = aVecu ? "" : pick([
    `🔵 [VÉCU] : D'accord ${prenom}, regardons cela calmement.`,
    `🔵 [VÉCU] : Très bien ${prenom}, allons à l'essentiel.`,
    `🔵 [VÉCU] : Je t'accompagne ${prenom}, prenons cela pas à pas.`
  ]);

  const savoir = aSavoir ? "" : "🟡 [SAVOIR] : Voici l'idée essentielle à retenir.";
  const inspiration = aInspiration ? "" : "🔴 [INSPIRATION] : Une notion bien comprise te rend plus solide.";
  const consolidation = aConsolidation ? "" : construireQuestionConsolidation(question, t);

  const blocs = [];
  if (!aVecu) blocs.push(vecu);
  blocs.push(t);
  if (!aSavoir && matiere === "general") blocs.push(savoir);
  if (!aInspiration) blocs.push(inspiration);
  if (!aConsolidation) blocs.push(consolidation);

  return blocs.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function remplacerBlocConsolidation(corps = "", question = "") {
  const regex = /❓\s*\[CONSOLIDATION\][\s\S]*?(?=\n👉|\n🌟|\n\*\*\*«|$)/i;
  const found = String(corps || "").match(regex)?.[0] || "";
  if (found && blocEstPertinent(found)) return corps;
  const bloc = construireQuestionConsolidation(question, corps);
  if (found) return corps.replace(regex, bloc).trim();
  return `${corps}\n\n${bloc}`.trim();
}

function choisirCitationFinale(question = "", corps = "") {
  const matiere = detecterMatierePrincipale(question, corps);

  if (matiere === "droit") return pick(CITATIONS.civisme);
  if (matiere === "geographie") return pick(CITATIONS.geographie);
  if (matiere === "histoire") return pick(CITATIONS.histoire);
  if (matiere === "math") return pick(CITATIONS.mathematiques);
  if (matiere === "physique" || matiere === "chimie") return pick(CITATIONS.sciences);
  if (matiere === "francais") return pick(CITATIONS.francais);
  return pick(CITATIONS.general);
}

function choisirOuverture(question = "", corps = "") {
  const matiere = detecterMatierePrincipale(question, corps);

  if (matiere === "droit") return "👉 Nous pouvons continuer avec une autre notion de droit.";
  if (matiere === "geographie") return "👉 Nous pouvons continuer avec une autre petite question de géographie.";
  if (matiere === "histoire") return "👉 Nous pouvons prendre un autre point d'histoire ensuite.";
  if (matiere === "math" || matiere === "physique" || matiere === "chimie") {
    return "👉 Essaie maintenant une étape, puis envoie-moi ta réponse.";
  }
  return "👉 Tu peux m'envoyer ta réponse, et je vais la vérifier avec toi.";
}

function choisirEncouragement(question = "", corps = "") {
  const q = String(question || "").toLowerCase();
  const c = String(corps || "").toLowerCase();

  if (estMessagePurementSocial(question)) return "";

  if (
    c.includes("je n'arrive pas") ||
    c.includes("souci technique") ||
    c.includes("réessaie") ||
    c.includes("reessaie")
  ) {
    return "🌟 Mot d'encouragement : Ne te décourage pas ; nous pouvons reprendre calmement.";
  }

  if (
    estSoumissionReponse(q) &&
    (c.includes("bonne réponse") || c.includes("correct") || c.includes("juste") || c.includes("exact"))
  ) {
    return "🌟 Mot d'encouragement : Bon travail ; continue avec cette rigueur.";
  }

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

    const unique =
      normalisee.startsWith("👉 ") ||
      normalisee.startsWith("🌟 mot d'encouragement") ||
      normalisee.startsWith("***«") ||
      normalisee === SEPARATOR;

    if (unique) {
      if (uniques.has(normalisee)) continue;
      uniques.add(normalisee);
    }

    resultat.push(ligne);
  }

  return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function construireMessageFinal(user, reponseBrute, historique = [], question = "", fiche = null) {
  let corps = nettoyerReponseIA(reponseBrute);
  corps = simplifierNotationMath(corps);
  corps = verifierStructureMwalimu(corps, user, historique, question);
  corps = remplacerBlocConsolidation(corps, question);

  corps = corps.replace(/^\s*\*\*\*«[^»]+»\*\*\*\s*$/gm, "");
  corps = corps.replace(/^🌟\s*Mot d['’]encouragement\s*:.*$/gim, "");
  corps = corps.replace(/^👉\s*Je reste disponible.*$/gim, "");
  corps = corps.replace(/\n{3,}/g, "\n\n").trim();

  const citation = choisirCitationFinale(question, corps);
  const ouverture = choisirOuverture(question, corps);
  const encouragement = choisirEncouragement(question, corps);

  return dedupeBlocFinal([
    HEADER_MWALIMU,
    SEPARATOR,
    corps,
    citation,
    ouverture,
    encouragement
  ].filter(Boolean).join("\n"));
}

/* =========================================================
   9) DB
========================================================= */
async function ensureBibliothequeSearchInfra() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS unaccent;");

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

  await pool.query("DROP TRIGGER IF EXISTS trg_bibliotheque_search_vector_update ON bibliotheque;");

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
    ON bibliotheque USING GIN (search_vector);
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

    await pool.query("CREATE INDEX IF NOT EXISTS idx_processed_messages_created_at ON processed_messages (created_at DESC);");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_unanswered_questions_created_at ON unanswered_questions (created_at DESC);");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_student_attempts_phone_sujet_updated ON student_attempts (phone, sujet, updated_at DESC);");

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
  await pool.query(`
    INSERT INTO conversations (phone, nom, classe, reve, historique, reminders_enabled)
    VALUES ($1, '', '', '', '[]'::jsonb, TRUE)
    ON CONFLICT (phone) DO NOTHING
  `, [phone]);
  return getUser(phone);
}

async function updateUserField(phone, field, value) {
  const fields = {
    nom: "nom",
    classe: "classe",
    reve: "reve",
    historique: "historique",
    reminders_enabled: "reminders_enabled"
  };

  const safeField = fields[field];
  if (!safeField) throw new Error("Champ non autorisé");

  await pool.query(
    `UPDATE conversations SET ${safeField} = $1, updated_at = NOW() WHERE phone = $2`,
    [value, phone]
  );
}

async function appendHistorique(phone, role, content) {
  const element = {
    role,
    content: tronquerTexte(content, 2500),
    ts: new Date().toISOString()
  };

  await pool.query(`
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
    WHERE phone = $2
  `, [JSON.stringify([element]), phone]);

  const user = await getUser(phone);
  return Array.isArray(user?.historique) ? user.historique : safeJsonParse(user?.historique, []);
}

async function logUnansweredQuestion(user = {}, question = "", msgType = "text", reason = "") {
  try {
    if (!String(question || "").trim()) return;

    await pool.query(`
      INSERT INTO unanswered_questions (phone, question, msg_type, classe, nom, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      user?.phone || "",
      tronquerTexte(question, 2000),
      msgType,
      user?.classe || "",
      user?.nom || "",
      reason || ""
    ]);
  } catch (e) {
    logError("log_unanswered_question", e);
  }
}

async function getStudentAttempt(phone, sujet = "") {
  const { rows } = await pool.query(`
    SELECT *
    FROM student_attempts
    WHERE phone = $1 AND sujet = $2
    ORDER BY updated_at DESC
    LIMIT 1
  `, [phone, sujet]);

  return rows[0] || null;
}

async function saveStudentAttempt(phone, sujet = "", question = "", lastUserAnswer = "") {
  const existing = await getStudentAttempt(phone, sujet);

  if (!existing) {
    await pool.query(`
      INSERT INTO student_attempts (phone, sujet, question, attempts_count, last_user_answer, updated_at)
      VALUES ($1, $2, $3, 1, $4, NOW())
    `, [phone, sujet, question, lastUserAnswer]);

    return 1;
  }

  const nextCount = Number(existing.attempts_count || 0) + 1;

  await pool.query(`
    UPDATE student_attempts
    SET attempts_count = $1,
        question = $2,
        last_user_answer = $3,
        updated_at = NOW()
    WHERE id = $4
  `, [nextCount, question, lastUserAnswer, existing.id]);

  return nextCount;
}

async function resetStudentAttempt(phone, sujet = "") {
  await pool.query("DELETE FROM student_attempts WHERE phone = $1 AND sujet = $2", [phone, sujet]);
}

async function resetAllStudentAttempts(phone) {
  await pool.query("DELETE FROM student_attempts WHERE phone = $1", [phone]);
}

async function consulterBibliotheque(question = "", classe = "") {
  try {
    const termes = String(question || "").trim();
    if (!termes) return null;

    const { rows } = await pool.query(`
      SELECT id, titre, matiere, classe, mots_cles, contenu, commentaire_ai,
             source_type, source_url, provenance, created_at, updated_at,
             ts_rank(search_vector, plainto_tsquery('simple', unaccent($1))) AS score
      FROM bibliotheque
      WHERE search_vector @@ plainto_tsquery('simple', unaccent($1))
        AND ($2 = '' OR unaccent(lower(coalesce(classe, ''))) LIKE unaccent(lower($3)))
      ORDER BY score DESC, updated_at DESC, id DESC
      LIMIT 1
    `, [termes, classe || "", `%${classe}%`]);

    return rows[0] || null;
  } catch (e) {
    logError("consulter_bibliotheque", e);
    return null;
  }
}

/* =========================================================
   10) WHATSAPP + SÉCURITÉ
========================================================= */
function verifierSignatureMeta(req) {
  try {
    const signature = req.get("x-hub-signature-256");
    if (!APP_SECRET || !signature || !req.rawBody) return false;

    const expected = "sha256=" + crypto
      .createHmac("sha256", APP_SECRET)
      .update(req.rawBody)
      .digest("hex");

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);

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
  const mediaUrl = mediaInfo?.url;

  if (!mediaUrl) throw new Error("URL média introuvable");

  const response = await axios.get(mediaUrl, {
    responseType: "arraybuffer",
    headers: { Authorization: `Bearer ${TOKEN}` },
    timeout: 30000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    validateStatus: (s) => s >= 200 && s < 300
  });

  const mimeType = String(response.headers["content-type"] || mediaInfo?.mime_type || "application/octet-stream").toLowerCase();
  const contentLength = Number(response.headers["content-length"] || response.data?.byteLength || 0);

  if (contentLength > maxBytes) throw new Error("Fichier trop volumineux");

  return {
    buffer: Buffer.from(response.data),
    mimeType
  };
}

function estMimeImageSupporte(mimeType = "") {
  return [
    "image/jpeg", "image/jpg", "image/png", "image/webp",
    "image/gif", "image/bmp", "image/heic", "image/heif"
  ].includes(String(mimeType || "").toLowerCase());
}

function estMimeAudioSupporte(mimeType = "") {
  return [
    "audio/ogg", "audio/opus", "audio/mpeg", "audio/mp3",
    "audio/mp4", "audio/wav", "audio/x-wav", "audio/webm",
    "audio/aac", "audio/amr"
  ].includes(String(mimeType || "").toLowerCase());
}

/* =========================================================
   11) IA
========================================================= */
function estErreurQuotaGemini(err) {
  const msg = String(err?.message || "").toLowerCase();
  const data = String(err?.response?.data ? JSON.stringify(err.response.data) : "").toLowerCase();
  return msg.includes("429") || msg.includes("quota") || data.includes("429") || data.includes("quota");
}

async function attendreAvecBackoff(tentative = 0) {
  await attendre(1200 + tentative * 1200);
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

  const clean = txt
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {}

  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  return null;
}

function toGeminiContents(messages = []) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }]
    }));
}

function construireSystemPrompt(user = {}) {
  const appel = construireAppel(user);
  const classe = user?.classe ? `Classe de l'élève : ${user.classe}` : "Classe non précisée";
  const reve = user?.reve ? `Rêve de l'élève : ${user.reve}` : "Rêve non précisé";

  return `${SYSTEM_BASE}

PERSONNALISATION :
- Adresse l'élève naturellement : ${appel}
- ${classe}
- ${reve}
- Ne répète jamais le header.
- Ne génère jamais la citation finale.
- Ne génère jamais l'ouverture finale.
- Ne génère jamais le mot d'encouragement final.

COHÉRENCE :
- La consolidation reste dans la même matière que la question.
- Ne mélange pas droit, géographie, histoire, sciences, maths et français.
`;
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
    generationConfig: { temperature: 0.15 }
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

function ficheEstFaible(fiche = null) {
  if (!fiche) return true;
  const contenu = String(fiche?.contenu || "").trim();
  const commentaire = String(fiche?.commentaire_ai || "").trim();
  return !contenu && !commentaire;
}

function estQuestionGeographieRDC(question = "", fiche = null) {
  const t = `${question} ${fiche?.matiere || ""} ${fiche?.titre || ""}`.toLowerCase();
  return [
    "rdc", "congo", "province", "territoire", "territoires",
    "commune", "communes", "ville", "villes", "haut-katanga",
    "haut katanga", "géographie", "geographie"
  ].some((m) => t.includes(m));
}

function fautChercherSurWeb(question = "", fiche = null) {
  const q = String(question || "").toLowerCase().trim();
  if (!q) return false;
  if (estMessagePurementSocial(q)) return false;

  if (fiche && !ficheEstFaible(fiche) && !estQuestionGeographieRDC(question, fiche)) {
    return false;
  }

  return [
    "loi", "code", "article", "constitution", "juridique", "droit",
    "ohada", "impôt", "impot", "taxe", "tribunal",
    "géographie", "geographie", "rdc", "congo", "province",
    "territoire", "commune", "ville", "haut-katanga", "haut katanga",
    "actualité", "actualite", "récent", "recent", "actuel",
    "histoire", "date", "indépendance", "independance",
    "qui", "quand", "où", "ou", "combien"
  ].some((m) => q.includes(m));
}

async function chercherContexteWeb(question = "", user = {}, historique = []) {
  return await safeAI(
    () => appelerChatCompletion([
      { role: "system", content: construireSystemPrompt(user) },
      {
        role: "system",
        content: `
MISSION WEB :
- Utilise Google Search.
- Donne un contexte brut, court, clair et factuel.
- Pour une liste administrative, sois complet.
- Si la liste n'est pas certaine, écris : Liste à confirmer.
- Pas de structure pédagogique.
`
      },
      ...historique.slice(-4),
      { role: "user", content: `QUESTION :\n${question}` }
    ]),
    ""
  );
}

async function detecterIntentionIA(user, texte = "", historique = []) {
  const fallback = {
    intention: "question_normale",
    matiere: detecterMatiereScientifique(texte),
    sujet: extraireSujetMemoire(texte) || "general",
    besoinCorrectionRenforcee: false
  };

  try {
    const parsed = await appelerJsonStrict({
      systemInstruction: `${construireSystemPrompt(user)}
MODE CLASSIFICATION :
Réponds uniquement en JSON.
intentions possibles : salutation, remerciement, question_normale, exercice, soumission_reponse, audio, image, juridique, geographie_rdc.`,
      prompt: `Classe ce message :\n${texte}`,
      schema: JSON_SCHEMA_INTENTION,
      history: historique.slice(-3)
    });

    if (!parsed || typeof parsed !== "object") return fallback;

    return {
      intention: String(parsed.intention || fallback.intention),
      matiere: String(parsed.matiere || fallback.matiere),
      sujet: String(parsed.sujet || fallback.sujet),
      besoinCorrectionRenforcee: Boolean(parsed.besoinCorrectionRenforcee)
    };
  } catch (e) {
    logError("detecter_intention_ia", e);
    return fallback;
  }
}

async function construireConsigneAntiBoucle(user, texteUtilisateur = "", historique = []) {
  const sujet = extraireSujetMemoire(texteUtilisateur) || "general";

  if (!estSoumissionReponse(texteUtilisateur)) {
    return { sujet, tentative: 0, consigne: "" };
  }

  const tentative = await saveStudentAttempt(user.phone, sujet, texteUtilisateur, texteUtilisateur);

  if (tentative < 3) {
    return {
      sujet,
      tentative,
      consigne: "L'élève propose une réponse. Corrige avec douceur, sans donner toute la solution d'un coup."
    };
  }

  return {
    sujet,
    tentative,
    consigne: "L'élève s'est probablement trompé plusieurs fois. Découpe davantage et donne un indice plus fort."
  };
}

function construireConsignePedagogique(texte = "", type = "text") {
  if (type === "audio") {
    return `
MODE AUDIO :
- Si c'est social, réponse courte naturelle.
- Sinon, commence par dire que tu as bien reçu l'audio.
- Réponds avec chaleur et pédagogie.
`;
  }

  if (type === "image") {
    return `
MODE IMAGE :
- Dis que tu as reçu l'image.
- Recopie ce qui est visible.
- Si c'est flou, dis-le.
- Explique sans faire tout à la place de l'élève.
`;
  }

  if (estSoumissionReponse(texte)) {
    return `
MODE CORRECTION :
- L'élève soumet sa réponse.
- Corrige avec douceur.
- Ne dis bravo que si c'est réellement juste.
`;
  }

  if (estQuestionTechnique(texte)) {
    return `
MODE EXERCICE :
- Méthode d'abord.
- Guidage pas à pas.
- Ne donne pas toute la réponse finale d'un coup.
`;
  }

  return "MODE NORMAL : réponds naturellement, clairement et brièvement.";
}

async function construireReponseDbWebIa(user, questionEleve, historique = [], fiche = null, consignePedagogique = "") {
  let contexteWeb = "";

  if (fautChercherSurWeb(questionEleve, fiche)) {
    contexteWeb = await chercherContexteWeb(questionEleve, user, historique);
  }

  const blocWeb = contexteWeb
    ? `CONTEXTE WEB :\n${contexteWeb}`
    : "CONTEXTE WEB : Aucun contexte web utile.";

  const blocDB = fiche
    ? `CONTEXTE DB :
Titre : ${fiche.titre || ""}
Matière : ${fiche.matiere || ""}
Classe : ${fiche.classe || ""}
Contenu :
${fiche.contenu || ""}
Commentaire :
${fiche.commentaire_ai || ""}`
    : "CONTEXTE DB : Aucune fiche locale.";

  return await safeAI(
    () => appelerChatCompletion([
      { role: "system", content: construireSystemPrompt(user) },
      {
        role: "system",
        content: `
RÈGLE FONDAMENTALE :
- Utilise le web si disponible.
- Utilise la DB comme appui.
- N'invente jamais.
- Réponds comme un précepteur, pas comme un moteur de recherche.
- La consolidation reste dans la même matière.
`
      },
      { role: "system", content: consignePedagogique },
      ...historique.slice(-5),
      {
        role: "user",
        content: `QUESTION :
${questionEleve}

${blocWeb}

${blocDB}

Donne la réponse finale pédagogique de Mwalimu.`
      }
    ]),
    `🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Je n'ai pas encore pu produire une réponse claire.
🔴 [INSPIRATION] : Ce n'est pas un problème ; nous pouvons reprendre plus simplement.
❓ [CONSOLIDATION] : Reformule ta question en une seule phrase.`
  );
}

/* =========================================================
   12) AUDIO + IMAGE
========================================================= */
async function analyserAudioCourt(user, audioBuffer, mimeType, historique = []) {
  try {
    const parsed = await appelerJsonStrict({
      systemInstruction: `${construireSystemPrompt(user)}
Analyse l'audio et réponds uniquement en JSON.
type possible : social, pedagogique, incompris.`,
      prompt: "Analyse cet audio.",
      schema: JSON_SCHEMA_AUDIO,
      history: historique.slice(-2),
      inlineParts: [
        { inlineData: { mimeType, data: audioBuffer.toString("base64") } }
      ]
    });

    if (!parsed || typeof parsed !== "object") {
      return { transcription: "", type: "incompris" };
    }

    return {
      transcription: String(parsed.transcription || "").trim(),
      type: String(parsed.type || "incompris").toLowerCase().trim()
    };
  } catch (e) {
    logError("analyser_audio_court", e);
    return { transcription: "", type: "incompris" };
  }
}

async function reponseAudioUneSeulePasse(user, audioBuffer, mimeType, historique = []) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${construireSystemPrompt(user)}
MODE AUDIO :
- Si c'est social, réponds en une phrase naturelle.
- Sinon, commence par : "J'ai bien reçu ton audio."
- Sois pédagogique, bref et clair.
- Ne génère pas header, citation, ouverture ou encouragement final.`,
    tools: [{ googleSearch: {} }]
  });

  const formattedHistory = historique.slice(-4).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }]
  }));

  return await safeAI(async () => {
    const r = await genererAvecRetry(model, {
      contents: [
        ...formattedHistory,
        {
          role: "user",
          parts: [
            { text: construireConsignePedagogique("", "audio") },
            { inlineData: { mimeType, data: audioBuffer.toString("base64") } }
          ]
        }
      ],
      generationConfig: { temperature: 0.2 }
    });

    return r.response.text();
  }, "");
}

async function expliquerImageAvecIA(user, base64Image, mimeType, historique = []) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${construireSystemPrompt(user)}
MODE IMAGE :
- Commence par : "J'ai bien reçu ton image."
- Recopie ce qui est visible.
- Si c'est flou, dis-le.
- Explique brièvement.
- Ne génère pas header, citation, ouverture ou encouragement final.`,
    tools: [{ googleSearch: {} }]
  });

  const contents = [
    ...historique.slice(-4).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }]
    })),
    {
      role: "user",
      parts: [
        { text: "Analyse cette image et aide l'élève." },
        { inlineData: { mimeType, data: base64Image } }
      ]
    }
  ];

  return await safeAI(async () => {
    const r = await genererAvecRetry(model, {
      contents,
      generationConfig: { temperature: 0.2 }
    });

    return r.response.text();
  }, "");
}

/* =========================================================
   13) TRAITEMENT
========================================================= */
async function traiterTexte(user, texteUtilisateur, historique = []) {
  if (estMessagePurementSocial(texteUtilisateur)) {
    const simple = construireReponseHumaineSimple(user, texteUtilisateur, historique);
    if (simple) return { reponse: simple, fiche: null, bypassFormat: true };
  }

  const conversationAcademique = historique.some((m) => m.role === "user" && estQuestionAcademique(m.content || ""));

  if (!conversationAcademique && !estQuestionAcademique(texteUtilisateur)) {
    const prenom = premierPrenom(user?.nom || "");
    return {
      reponse: pick([
        `Je suis là pour t'aider **${prenom}** 😊 Quelle matière ou quel exercice veux-tu travailler ?`,
        `**${prenom}**, envoie-moi une question, une leçon ou un exercice, et je vais t'accompagner.`,
        `D'accord **${prenom}**. Dis-moi maintenant ce que tu veux comprendre.`
      ]),
      fiche: null,
      bypassFormat: true
    };
  }

  const cacheKey = makeCacheKey(user, texteUtilisateur);
  const cached = cache.get(cacheKey);

  if (cached) {
    logInfo("cache_hit", { phone: user?.phone || "", cacheKey });
    return { reponse: cached, fiche: null, bypassFormat: false };
  }

  const fiche = await consulterBibliotheque(texteUtilisateur, user.classe || "");
  const analyse = await detecterIntentionIA(user, texteUtilisateur, historique);
  const antiBoucle = await construireConsigneAntiBoucle(user, texteUtilisateur, historique);

  let consigne = construireConsignePedagogique(texteUtilisateur, "text");

  if (analyse.intention === "juridique") {
    consigne += "\nLe message semble juridique. Ne cite un article que si tu es fiable.";
  }

  if (analyse.intention === "geographie_rdc" || estQuestionGeographieRDC(texteUtilisateur, fiche)) {
    consigne += "\nQuestion géographique/administrative : sois précis et complet.";
  }

  if (antiBoucle.consigne) consigne += `\n${antiBoucle.consigne}`;

  const reponse = await construireReponseDbWebIa(user, texteUtilisateur, historique, fiche, consigne);

  if (reponse && String(reponse).trim()) {
    cache.set(cacheKey, reponse);
  } else {
    await logUnansweredQuestion(user, texteUtilisateur, "text", "traiterTexte_empty");
  }

  if (!estSoumissionReponse(texteUtilisateur)) {
    await resetStudentAttempt(user.phone, antiBoucle.sujet || analyse.sujet || "general");
  }

  return { reponse, fiche: fiche || null, bypassFormat: false };
}

async function traiterAudio(user, msg, historique = []) {
  const audioId = msg.audio?.id;

  if (!audioId) {
    return { reponse: "Je n'arrive pas à lire ton audio.", fiche: null, bypassFormat: true };
  }

  const { buffer, mimeType } = await telechargerMedia(audioId);
  logInfo("audio_received", { phone: user?.phone || "", mimeType });

  if (!estMimeAudioSupporte(mimeType)) {
    return { reponse: "Format audio non supporté.", fiche: null, bypassFormat: true };
  }

  const analyse = await analyserAudioCourt(user, buffer, mimeType, historique);
  const transcription = analyse.transcription || "";
  const transcriptionNormale = normaliserTexteRelationnel(transcription);

  if (transcriptionNormale && estMessagePurementSocial(transcriptionNormale)) {
    const simple = construireReponseHumaineSimple(user, transcriptionNormale, historique);
    if (simple) return { reponse: simple, fiche: null, bypassFormat: true };
  }

  if (analyse.type === "social") {
    const simple = construireReponseHumaineSimple(user, transcription || "merci", historique);
    return { reponse: simple || "Avec plaisir 😊", fiche: null, bypassFormat: true };
  }

  let reponse = await reponseAudioUneSeulePasse(user, buffer, mimeType, historique);

  if (!reponse || !reponse.trim()) {
    reponse = "Je n'arrive pas encore à analyser ton audio correctement.";
    return { reponse, fiche: null, bypassFormat: true };
  }

  return {
    reponse,
    fiche: null,
    bypassFormat: estMessagePurementSocial(reponse) && reponse.length < 180
  };
}

async function traiterImage(user, msg, historique = []) {
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

  const { buffer, mimeType } = await telechargerMedia(imageId);
  logInfo("image_received", { phone: user?.phone || "", mimeType });

  if (!estMimeImageSupporte(mimeType)) {
    return {
      reponse: `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Le format d'image n'est pas encore supporté.
🔴 [INSPIRATION] : Ce n'est pas grave.
❓ [CONSOLIDATION] : Envoie-moi une image JPG, PNG, WEBP, GIF, BMP, HEIC ou HEIF.`,
      fiche: null,
      bypassFormat: false
    };
  }

  const base64Image = buffer.toString("base64");
  let reponse = await expliquerImageAvecIA(user, base64Image, mimeType, historique);

  if (!reponse || !reponse.trim()) {
    reponse = `🔵 [VÉCU] : J'ai bien reçu ton image.
🟡 [SAVOIR] : Je n'arrive pas encore à l'analyser correctement.
🔴 [INSPIRATION] : Nous pouvons reprendre calmement.
❓ [CONSOLIDATION] : Envoie-moi une image plus nette ou mieux cadrée.`;
  }

  return { reponse, fiche: null, bypassFormat: false };
}

/* =========================================================
   14) COMMANDES + CRON
========================================================= */
async function traiterCommandeTexte(from, _user, texteUtilisateur) {
  const cmd = String(texteUtilisateur || "").trim().toLowerCase();

  if (cmd === "/aide") {
    await envoyerWhatsApp(from, `${HEADER_MWALIMU}
📘 *Commandes disponibles*
/aide → voir les commandes
/profil → refaire ton profil
/reset → vider l'historique
/stop → arrêter les rappels du matin
/start → réactiver les rappels du matin`);
    return true;
  }

  if (cmd === "/stop") {
    await updateUserField(from, "reminders_enabled", false);
    await envoyerWhatsApp(from, `${HEADER_MWALIMU}
${SEPARATOR}
🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Les rappels du matin sont arrêtés.
🔴 [INSPIRATION] : Tu gardes le contrôle de ton rythme.
❓ [CONSOLIDATION] : Pour les réactiver, envoie /start.`);
    return true;
  }

  if (cmd === "/start") {
    await updateUserField(from, "reminders_enabled", true);
    await envoyerWhatsApp(from, `${HEADER_MWALIMU}
${SEPARATOR}
🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Les rappels du matin sont réactivés.
🔴 [INSPIRATION] : La régularité aide à progresser.
❓ [CONSOLIDATION] : Nous continuerons ensemble pas à pas.`);
    return true;
  }

  if (cmd === "/reset") {
    await updateUserField(from, "historique", JSON.stringify([]));
    await resetAllStudentAttempts(from);
    await envoyerWhatsApp(from, `${HEADER_MWALIMU}
${SEPARATOR}
🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : L'historique a été remis à zéro.
🔴 [INSPIRATION] : Repartir proprement peut aider.
❓ [CONSOLIDATION] : Envoie-moi maintenant ta question.`);
    return true;
  }

  if (cmd === "/profil") {
    await pool.query(
      "UPDATE conversations SET nom = '', classe = '', reve = '', historique = '[]'::jsonb, updated_at = NOW() WHERE phone = $1",
      [from]
    );
    await resetAllStudentAttempts(from);
    await envoyerWhatsApp(from, `${HEADER_MWALIMU}
${SEPARATOR}
🔄 *Mise à jour du profil*
🟡 Quel est ton *prénom* ?`);
    return true;
  }

  return false;
}

function messageSecours(user, msgType = "message") {
  const appel = construireAppel(user);

  return `${HEADER_MWALIMU}
${SEPARATOR}
🔵 [VÉCU] : J'ai bien reçu ${messageTypeLisible(msgType)}, ${appel}.
🟡 [SAVOIR] : Je rencontre un petit souci technique maintenant.
🔴 [INSPIRATION] : Ce contretemps n'empêche pas notre progression.
❓ [CONSOLIDATION] : Réessaie dans un instant ou reformule plus simplement.
👉 Je reste à tes côtés.
🌟 Mot d'encouragement : Nous pouvons reprendre calmement.
${pick(CITATIONS.general)}`.replace(/\n{3,}/g, "\n\n").trim();
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
        const appel = `${genreEleve(eleve.nom)} **${premierPrenom(eleve.nom)}**`;
        const message = `${HEADER_MWALIMU}
${SEPARATOR}
🔵 [VÉCU] : Bonjour ${appel}.
🟡 [SAVOIR] : Petit rappel du matin : avance aujourd'hui avec calme et sérieux.
🔴 [INSPIRATION] : Ton objectif n'est pas d'aller vite, mais de bien comprendre.
❓ [CONSOLIDATION] : Quelle matière veux-tu travailler aujourd'hui ?
👉 Je reste à tes côtés.
🌟 Mot d'encouragement : Un élève constant progresse.
${pick(CITATIONS.patriotisme)}`;

        await envoyerWhatsApp(eleve.phone, message);
        await attendre(800);
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
   15) PIPELINE
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

    await envoyerWhatsApp(from, `${HEADER_MWALIMU}
${SEPARATOR}
🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.
🟡 Quel est ton *prénom* ?`);
    return;
  }

  if (msgType === "text") {
    const commandeTraitee = await traiterCommandeTexte(from, user, texteUtilisateur);
    if (commandeTraitee) return;
  }

  if (!user.nom) {
    const nom = normaliserNom(nettoyer(texteUtilisateur));

    if (!nom) {
      await envoyerWhatsApp(from, `${HEADER_MWALIMU}
${SEPARATOR}
🟡 Donne-moi simplement ton *prénom*, s'il te plaît.`);
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

    await envoyerWhatsApp(from, `✨ *Quelle ambition magnifique !*
🔴 Devenir *${rv}* est un rêve noble.
🔵 *Pour commencer notre parcours ensemble :*
👉 Quelle matière ou quel chapitre te pose problème en ce moment ?`);
    return;
  }

  let historique = Array.isArray(user.historique)
    ? user.historique
    : safeJsonParse(user.historique, []);

  let contenuUtilisateurPourMemoire = texteUtilisateur || `[message ${msgType}]`;

  if (msgType === "text" && texteUtilisateur) {
    await appendHistorique(from, "user", texteUtilisateur);
    const fresh = await getUser(from);
    historique = Array.isArray(fresh?.historique)
      ? fresh.historique
      : safeJsonParse(fresh?.historique, []);
    user = fresh || user;
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
    reponseBrute = `🔵 [VÉCU] : J'ai bien reçu ton fichier.
🟡 [SAVOIR] : Je ne peux pas encore analyser ce type de format.
🔴 [INSPIRATION] : Ce n'est pas grave, nous pouvons utiliser le texte, l'audio ou les images.
❓ [CONSOLIDATION] : Envoie-moi plutôt ton exercice par écrit ou en photo lisible.`;
  }

  const messageFinal = bypassFormat
    ? reponseBrute
    : construireMessageFinal(
        { ...user, phone: from },
        reponseBrute,
        historique,
        texteUtilisateur || contenuUtilisateurPourMemoire,
        ficheContexte
      );

  const safeFinal = messageFinal && messageFinal.trim()
    ? messageFinal
    : messageSecours({ ...user, phone: from }, msgType);

  await appendHistorique(from, "assistant", safeFinal);
  await envoyerWhatsApp(from, safeFinal);

  logInfo("message_processed_success", {
    phone: from,
    msgId,
    msgType,
    durationMs: nowMs() - startedAt
  });
}

/* =========================================================
   16) ROUTES
========================================================= */
app.get("/", (_req, res) => {
  res.send("Mwalimu EdTech Server: OK");
});

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    return res.status(200).json({
      status: "healthy",
      timestamp: horodatage()
    });
  } catch (e) {
    return res.status(500).json({
      status: "unhealthy",
      error: e.message
    });
  }
});

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
    } catch (err) {
      logError("pipeline_processing_failure", err, {
        phone: from,
        msgId: msg.id
      });

      try {
        const fallback = messageSecours({ phone: from }, typeMessage(msg));
        await envoyerWhatsApp(from, fallback);
      } catch (sendErr) {
        logError("critical_fallback_send_failure", sendErr);
      }
    }
  }).catch((err) => {
    logError("queue_error", err, { phone: from });
  });
});

/* =========================================================
   17) START
========================================================= */
(async () => {
  try {
    logInfo("api_starting");
    await initDB();

    app.listen(PORT, () => {
      logInfo("server_listening", { port: PORT });
      console.log(`✅ Mwalimu en marche sur le port ${PORT}`);
    });
  } catch (e) {
    logError("startup_failed", e);
    process.exit(1);
  }
})();
