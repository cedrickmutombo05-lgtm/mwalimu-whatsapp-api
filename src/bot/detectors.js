

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

function estQuestionJuridique(texte = "") {
  const t = String(texte || "").toLowerCase();

  return (
    /\bdroit\b/i.test(t) ||
    /\bdroits\b/i.test(t) ||
    /\bjuridique\b/i.test(t) ||
    /\bloi\b/i.test(t) ||
    /\bcode\b/i.test(t) ||
    /\barticle\b/i.test(t) ||
    /\btribunal\b/i.test(t) ||
    /\bprocédure\b/i.test(t) ||
    /\bprocedure\b/i.test(t) ||
    /\bohada\b/i.test(t) ||
    /\bconstitution\b/i.test(t) ||
    /\bjugement\b/i.test(t) ||
    /\bassignation\b/i.test(t) ||
    /\bappel\b/i.test(t)
  );
}

function estMatiereSeuleAcademique(texte = "") {
  const t = normaliserTexteMemoire(texte);

  const matieres = [
    "math", "maths", "mathematiques", "geometrie", "forme geometrique",
    "formes geometriques", "triangle", "carre", "rectangle", "cercle",
    "systeme metrique", "mesures", "unites de mesure", "problemes",
    "probleme", "etude du milieu", "milieu", "civisme",
    "education a la citoyennete", "citoyennete", "biologie",
    "microbiologie", "sciences", "physique", "chimie", "francais",
    "grammaire", "conjugaison", "orthographe", "histoire",
    "geographie", "droit"
  ];

  return matieres.includes(t);
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
    "calcule", "calculer", "résous", "resous", "équation", "equation",
    "fraction", "physique", "chimie", "exercice", "problème", "probleme",
    "problèmes", "problemes", "géométrie", "geometrie", "puissance",
    "racine", "math", "maths", "formule", "triangle", "angle", "côté",
    "cote", "sommet", "segment", "droite", "forme géométrique",
    "forme geometrique", "formes géométriques", "formes geometriques",
    "système métrique", "systeme metrique", "mesure", "unité", "unite"
  ];

  return mots.some((m) => t.includes(m));
}

function extraireSujetMemoire(texte = "") {
  const t = normaliserTexteMemoire(texte);

  if (!t || estMessageRelationnelSimple(texte)) return "";

  const sujets = [
    "triangle", "angle", "droite", "segment", "geometrie",
    "forme geometrique", "formes geometriques", "systeme metrique",
    "mesure", "unite", "probleme", "problemes",
    "etude du milieu", "milieu", "civisme", "citoyennete",
    "education a la citoyennete", "biologie", "microbiologie",
    "cellule", "microbe", "bacterie", "virus", "vivant",
    "nepal", "chine", "geographie", "fleuve", "nil", "amazone",
    "math", "mathematiques", "equation", "fraction",
    "histoire", "francais", "grammaire", "impot", "taxe",
    "rdc", "congo", "province", "territoire",
    "constitution", "droit", "sciences", "physique", "chimie",
    "haut katanga", "commune", "ville"
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
  const total = `${q} ${c}`;

  const scores = {
    droit: 0,
    geographie: 0,
    histoire: 0,
    math: 0,
    physique: 0,
    chimie: 0,
    francais: 0,
    sciences: 0,
    biologie: 0,
    microbiologie: 0,
    civisme: 0,
    etude_milieu: 0,
    general: 0
  };

  if (estQuestionJuridique(q)) scores.droit += 8;
  if (estQuestionJuridique(c)) scores.droit += 2;

  if (/\bdroite\b/i.test(total) || /\bsegment\b/i.test(total) || /\btriangle\b/i.test(total)) {
    scores.droit = Math.max(0, scores.droit - 5);
    scores.math += 8;
  }

  const ajouter = (theme, motsQuestion = [], motsCorps = [], poidsQuestion = 6, poidsCorps = 1) => {
    for (const mot of motsQuestion) {
      if (q.includes(mot)) scores[theme] += poidsQuestion;
    }

    for (const mot of motsCorps) {
      if (c.includes(mot)) scores[theme] += poidsCorps;
    }
  };

  ajouter("geographie",
    ["géographie", "geographie", "province", "territoire", "commune", "ville", "secteur", "chefferie", "fleuve", "rivière", "riviere", "nil", "amazone", "lac", "montagne", "relief", "capitale"],
    ["géographie", "geographie", "province", "territoire", "commune", "ville", "secteur", "chefferie", "fleuve", "rivière", "riviere", "nil", "amazone", "lac", "montagne", "relief", "capitale"]
  );

  ajouter("histoire",
    ["histoire", "passé", "passe", "colonisation", "indépendance", "independance", "royaume", "date historique"],
    ["histoire", "passé", "passe", "colonisation", "indépendance", "independance", "royaume", "date"]
  );

  ajouter("math",
    ["math", "maths", "équation", "equation", "fraction", "calcul", "racine", "puissance", "géométrie", "geometrie", "triangle", "angle", "droite", "segment", "sommet", "sommets", "côté", "cote", "forme géométrique", "forme geometrique", "formes géométriques", "formes geometriques", "système métrique", "systeme metrique", "mesure", "unité", "unite", "problème", "probleme", "problèmes", "problemes"],
    ["math", "maths", "équation", "equation", "fraction", "calcul", "racine", "puissance", "géométrie", "geometrie", "triangle", "angle", "droite", "segment", "sommet", "sommets", "côté", "cote", "forme géométrique", "forme geometrique", "système métrique", "systeme metrique", "mesure", "unité", "unite", "problème", "probleme"]
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

  ajouter("sciences",
    ["sciences", "science", "vivant", "nature", "corps humain"],
    ["sciences", "science", "vivant", "nature", "corps humain"]
  );

  ajouter("biologie",
    ["biologie", "cellule", "organisme", "vivant", "écologie", "ecologie", "zoologie", "botanique", "génétique", "genetique"],
    ["biologie", "cellule", "organisme", "vivant", "écologie", "ecologie", "zoologie", "botanique", "génétique", "genetique"]
  );

  ajouter("microbiologie",
    ["microbiologie", "microbe", "microbes", "bactérie", "bacterie", "bactéries", "bacteries", "virus", "champignon", "micro organisme", "microorganisme"],
    ["microbiologie", "microbe", "microbes", "bactérie", "bacterie", "bactéries", "bacteries", "virus", "champignon", "micro organisme", "microorganisme"]
  );

  ajouter("civisme",
    ["civisme", "citoyenneté", "citoyennete", "éducation à la citoyenneté", "education a la citoyennete", "citoyen", "devoir civique", "droit civique", "patriotisme", "drapeau", "hymne national"],
    ["civisme", "citoyenneté", "citoyennete", "éducation à la citoyenneté", "education a la citoyennete", "citoyen", "devoir civique", "droit civique", "patriotisme", "drapeau", "hymne national"]
  );

  ajouter("etude_milieu",
    ["étude du milieu", "etude du milieu", "milieu", "environnement", "hygiène", "hygiene", "famille", "école", "ecole", "quartier", "village", "communauté", "communaute"],
    ["étude du milieu", "etude du milieu", "milieu", "environnement", "hygiène", "hygiene", "famille", "école", "ecole", "quartier", "village", "communauté", "communaute"]
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

  ["math", "maths", "équation", "equation", "fraction", "racine", "calcul", "géométrie", "geometrie", "triangle", "angle", "droite", "segment", "sommet", "côté", "cote", "forme géométrique", "forme geometrique", "système métrique", "systeme metrique"].forEach((m) => {
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
    t.includes("geographie") ||
    t.includes("fleuve") ||
    t.includes("rivière") ||
    t.includes("riviere")
  );
}

function fautChercherSurWeb(question = "", fiche = null) {
  const q = String(question || "").toLowerCase().trim();

  if (!q) return false;
  if (estMessageRelationnelSimple(q)) return false;

  if (fiche && !ficheEstFaible(fiche) && !estQuestionGeographieRDC(question, fiche)) {
    return false;
  }

  if (estQuestionJuridique(q)) return true;

  const casWeb = [
    "géographie", "geographie", "rdc", "congo",
    "province", "territoire", "territoires",
    "commune", "communes", "ville", "villes",
    "haut-katanga", "haut katanga",
    "fleuve", "rivière", "riviere", "nil", "amazone",
    "actualité", "actualite", "récent", "recent",
    "aujourd'hui", "actuel",
    "histoire", "date", "indépendance",
    "biologie", "microbiologie", "civisme",
    "citoyenneté", "citoyennete", "étude du milieu", "etude du milieu",
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

  if (!t) return false;
  if (estMessagePurementSocial(texte)) return false;
  if (estMatiereSeuleAcademique(texte)) return true;

  const motsAcademiques = [
    "explique", "c'est quoi", "qu'est-ce que", "comment", "pourquoi",
    "quand", "ou", "qui", "combien", "quelle", "quel", "quels", "quelles",
    "math", "maths", "equation", "calcul", "physique", "chimie",
    "histoire", "geographie", "francais", "grammaire", "conjugaison",
    "loi", "article", "constitution", "province", "territoire",
    "triangle", "droite", "angle", "segment", "biologie", "microbiologie",
    "civisme", "citoyennete", "citoyenneté", "etude du milieu",
    "étude du milieu", "forme geometrique", "forme géométrique",
    "systeme metrique", "système métrique", "fleuve",
    "exercice", "probleme", "problemes", "problème", "problèmes",
    "aide", "comprendre", "apprendre",
    "cours", "lecon", "chapitre", "matiere", "examen", "revision",
    "peux-tu", "peux tu", "dis-moi", "dis moi", "j'aimerais", "je voudrais",
    "explique-moi", "explique moi", "c quoi"
  ];

  if (estQuestionJuridique(t)) return true;

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
  estQuestionJuridique,
  estMatiereSeuleAcademique,
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
