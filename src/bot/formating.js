
const { HEADER_MWALIMU, CITATIONS } = require("../constants/messages");
const { REGEX_HEADER_MWALIMU, REGEX_BLOC_CONSOLIDATION } = require("../constants/regex");

const {
  MATIERE_MATH,
  MATIERE_PHYSIQUE,
  MATIERE_CHIMIE,
  MATIERE_GENERAL
} = require("../constants/prompts");

const {
  pick,
  premierPrenom,
  construireAppel,
  supprimerFormulesLourdesDAppel,
  simplifierNotationMath,
  simplifierPresentationScientifique
} = require("../core");

const {
  estMessageRelationnelSimple
} = require("./social");

const {
  extraireSujetMemoire,
  retrouverSujetProche,
  detecterMatierePrincipale,
  detecterMatiereScientifique,
  messageTypeLisible
} = require("./detectors");

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

  t = t.replace(REGEX_HEADER_MWALIMU, "");
  t = t.replace(/^\s*🌟\s*Mot d['']encouragement\s*:\s*.*$/gim, "");
  t = t.replace(/^\s*👉\s*Je reste disponible.*$/gim, "");
  t = t.replace(/^\s*👉\s*Continue à me parler.*$/gim, "");

  return supprimerDoublonsLignes(t).replace(/\n{3,}/g, "\n\n").trim();
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
  const lignes = bloc.split("\n").map((l) => l.trim());
  const nbQuestions = lignes.filter((l) => l.endsWith("?")).length;

  if (nbQuestions === 0) return false;

  const lignesSignificatives = lignes.filter((l) => l && !l.startsWith("A.") && !l.startsWith("B."));
  return lignesSignificatives.some((l) => l.length > 5);
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

function remplacerBlocConsolidation(corps = "", question = "", sujet = "") {
  let t = String(corps || "").trim();

  if (!t) return t;

  const existingBloc = t.match(REGEX_BLOC_CONSOLIDATION)?.[0] || "";

  if (existingBloc && blocEstPertinent(existingBloc)) {
    return t;
  }

  const newBloc = construireQuestionsConsolidationCiblee(question, t, sujet);

  if (existingBloc) {
    t = t.replace(REGEX_BLOC_CONSOLIDATION, newBloc);
  } else {
    t = `${t}\n\n${newBloc}`;
  }

  return t.replace(/\n{3,}/g, "\n\n").trim();
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

function verifierStructureMwalimu(corps = "", user = {}, historique = [], question = "") {
  let t = String(corps || "").trim();

  const aVecu = /🔵\s*\[VÉCU\]/i.test(t);
  const aSavoir = /🟡\s*\[SAVOIR\]/i.test(t);
  const aInspiration = /🔴\s*\[INSPIRATION\]/i.test(t);
  const aConsolidation = /❓\s*\[CONSOLIDATION\]/i.test(t);

  if (aVecu && aSavoir && aInspiration && aConsolidation) return t;

  const morceaux = [];

  if (!aVecu) morceaux.push(construireVecuNaturel(user, question, historique));

  morceaux.push(t);

  if (!aSavoir) morceaux.push("🟡 [SAVOIR] : Voici l'idée essentielle à retenir.");
  if (!aInspiration) morceaux.push("🔴 [INSPIRATION] : Une notion bien comprise te rend plus solide.");
  if (!aConsolidation) morceaux.push("❓ [CONSOLIDATION] : Dis-moi maintenant ce que tu retiens.");

  return morceaux.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function choisirOuvertureContextuelle(reponse = "", _user = {}, question = "") {
  const matiere = detecterMatierePrincipale(question, reponse);
  const q = String(question || "").toLowerCase();

  if (estMessageRelationnelSimple(q)) return "";
  if (matiere === "droit") return "👉 Si tu veux, nous pouvons revoir un autre terme juridique ensuite.";
  if (matiere === "geographie") return "👉 Si tu veux, nous pouvons continuer avec une autre petite question de géographie.";
  if (matiere === "histoire") return "👉 Si tu veux, nous pouvons prendre un autre point d'histoire ensuite.";
  if (matiere === "math" || matiere === "physique" || matiere === "chimie") {
    return "👉 Essaie maintenant de reformuler l'idée ou de faire une étape, puis envoie-moi ta réponse.";
  }

  return "👉 Dis-moi maintenant ce que tu retiens en une phrase simple.";
}

function choisirEncouragementContextuel(reponse = "", question = "") {
  const corps = String(reponse || "").toLowerCase();
  const q = String(question || "").toLowerCase();

  if (estMessageRelationnelSimple(question)) return "";

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
    (corps.includes("bonne réponse") ||
      corps.includes("réponse correcte") ||
      corps.includes("exact") ||
      corps.includes("juste"))
  ) {
    return "🌟 Mot d'encouragement : Bon travail ; continue avec cette rigueur.";
  }

  if (corps.includes("méthode") || corps.includes("explication") || corps.includes("à retenir")) {
    return "🌟 Mot d'encouragement : Relis doucement ; une idée bien comprise reste mieux.";
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

function construireMessageFinal(user, reponseBrute, historique = [], question = "", fiche = null) {
  const reponseNettoyee = nettoyerReponseIA(reponseBrute);
  const reponseSansAppelsLourds = supprimerFormulesLourdesDAppel(reponseNettoyee, user);

  const sortieScientifique = appliquerLes4EtapesScientifiques(
    reponseSansAppelsLourds,
    question,
    fiche
  );

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

  const parties = [
    HEADER_MWALIMU,
    "────────────────",
    corps,
    citationUnique,
    ouverture,
    encouragement
  ].filter((part) => part && part.trim() !== "");

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

module.exports = {
  supprimerDoublonsLignes,
  nettoyerReponseIA,
  nettoyerSelonMatiere,
  reformaterFinalSelonMatiere,
  appliquerLes4EtapesScientifiques,
  blocEstPertinent,
  construireQuestionsConsolidationCiblee,
  remplacerBlocConsolidation,
  choisirCitationFinale,
  construireVecuNaturel,
  verifierStructureMwalimu,
  choisirOuvertureContextuelle,
  choisirEncouragementContextuel,
  dedupeBlocFinal,
  construireMessageFinal,
  messageSecours
};
