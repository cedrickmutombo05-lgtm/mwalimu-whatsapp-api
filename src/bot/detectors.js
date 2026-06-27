
const {
  normaliserTexteRelationnel,
  normaliserTexteMemoire
} = require("../core");

const {
  MATIERE_MATH,
  MATIERE_PHYSIQUE,
  MATIERE_CHIMIE,
  MATIERE_GENERAL
} = require("../constants/prompts");

const {
  estMessageRelationnelSimple,
  estMessagePurementSocial
} = require("./social");

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

    if (
      ancien &&
      (ancien === actuel || String(item.content || "").toLowerCase().includes(actuel))
    ) {
      return ancien;
    }
  }

  return "";
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

  ajouter("droit", ["droit", "droit positif", "loi", "code", "article", "juridique", "tribunal", "ohada", "constitution"], ["droit", "loi", "code", "article", "juridique", "tribunal", "ohada", "constitution"]);
  ajouter("geographie", ["géographie", "geographie", "province", "territoire", "commune", "ville", "secteur", "chefferie", "subdivision administrative"], ["géographie", "geographie", "province", "territoire", "commune", "ville", "secteur", "chefferie"]);
  ajouter("histoire", ["histoire", "passé", "passe", "événement passé", "evenement passe", "colonisation", "indépendance", "independance", "royaume", "date historique"], ["histoire", "passé", "passe", "colonisation", "indépendance", "independance", "royaume", "date"]);
  ajouter("math", ["math", "maths", "équation", "equation", "fraction", "calcul", "racine", "puissance", "géométrie", "geometrie"], ["math", "maths", "équation", "equation", "fraction", "calcul", "racine", "puissance"]);
  ajouter("physique", ["physique", "force", "vitesse", "énergie", "energie", "masse", "pression", "mouvement"], ["physique", "force", "vitesse", "énergie", "energie", "masse", "pression", "mouvement"]);
  ajouter("chimie", ["chimie", "molécule", "molecule", "atome", "acide", "base", "solution", "réaction", "reaction"], ["chimie", "molécule", "molecule", "atome", "acide", "base", "solution", "réaction", "reaction"]);
  ajouter("francais", ["français", "francais", "grammaire", "orthographe", "conjugaison", "verbe", "phrase"], ["français", "francais", "grammaire", "orthographe", "conjugaison", "verbe", "phrase"]);

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

function detecterMatiereScientifique(question = "", reponse = "", fiche = null) {
  const base = [
    String(question || ""),
    String(reponse || ""),
    String(fiche?.matiere || ""),
    String(fiche?.titre || ""),
    String(fiche?.contenu || "").slice(0, 1200),
    String(fiche?.commentaire_ai || "").slice(0, 1200)
  ].join(" ").toLowerCase();

  const score = {
    math: 0,
    physique: 0,
    chimie: 0
  };

  ["math", "maths", "équation", "equation", "fraction", "racine", "calcul"].forEach((m) => {
    if (base.includes(m)) score.math += 2;
  });

  ["physique", "force", "vitesse", "énergie", "energie", "masse", "distance", "temps"].forEach((m) => {
    if (base.includes(m)) score.physique += 2;
  });

  ["chimie", "mol", "solution", "acide", "base", "h2o", "co2", "o2", "nacl"].forEach((m) => {
    if (base.includes(m)) score.chimie += 2;
  });

  const maxScore = Math.max(score.math, score.physique, score.chimie);

  if (maxScore <= 0) return MATIERE_GENERAL;
  if (score.chimie === maxScore) return MATIERE_CHIMIE;
  if (score.physique === maxScore) return MATIERE_PHYSIQUE;
  if (score.math === maxScore) return MATIERE_MATH;

  return MATIERE_GENERAL;
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
    "explique-moi", "explique moi", "c quoi"
  ];

  return motsAcademiques.some((mot) => t.includes(mot));
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

module.exports = {
  estSoumissionReponse,
  estQuestionTechnique,
  extraireSujetMemoire,
  retrouverSujetProche,
  detecterMatierePrincipale,
  detecterMatiereScientifique,
  estMimeImageSupporte,
  estMimeAudioSupporte,
  ficheEstFaible,
  estQuestionGeographieRDC,
  fautChercherSurWeb,
  estQuestionAcademique,
  typeMessage,
  messageTypeLisible
};
