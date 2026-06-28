

const { HEADER_MWALIMU, CITATIONS } = require("../constants/messages");

const {
  REGEX_HEADER_MWALIMU,
  REGEX_BLOC_CONSOLIDATION,
  REGEX_VECU,
  REGEX_SAVOIR,
  REGEX_INSPIRATION,
  REGEX_CONSOLIDATION
} = require("../constants/regex");

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

const { estMessageRelationnelSimple } = require("./social");

const {
  extraireSujetMemoire,
  retrouverSujetProche,
  detecterMatierePrincipale,
  detecterMatiereScientifique,
  messageTypeLisible
} = require("./detectors");

function supprimerDoublonsLignes(texte = "") {
  const lignes = String(texte || "").split("\n").map((l) => l.trimEnd());
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

function normaliserBalisesMwalimu(texte = "") {
  let t = String(texte || "");

  t = t
    .replace(/🔵\s*\*?\*?\[?\s*VÉCU\s*\]?\*?\*?\s*:?\s*/gi, "\n🔵 [VÉCU]\n")
    .replace(/🟡\s*\*?\*?\[?\s*SAVOIR\s*\]?\*?\*?\s*:?\s*/gi, "\n🟡 [SAVOIR]\n")
    .replace(/🔴\s*\*?\*?\[?\s*INSPIRATION\s*\]?\*?\*?\s*:?\s*/gi, "\n🔴 [INSPIRATION]\n")
    .replace(/❓\s*\*?\*?\[?\s*CONSOLIDATION\s*\]?\*?\*?\s*:?\s*/gi, "\n❓ [CONSOLIDATION]\n");

  const lignes = t.split("\n");
  const resultat = [];

  const vus = {
    vecu: false,
    savoir: false,
    inspiration: false,
    consolidation: false
  };

  function traiterTag(cle, tag, contenu = "") {
    if (!vus[cle]) {
      resultat.push(tag);
      vus[cle] = true;
    }

    if (contenu && contenu.trim()) {
      resultat.push(contenu.trim());
    }
  }

  for (const ligneBrute of lignes) {
    const ligne = ligneBrute.trim();
    if (!ligne) continue;

    if (/^🔵\s*\[VÉCU\]$/i.test(ligne)) {
      traiterTag("vecu", "🔵 [VÉCU]");
      continue;
    }

    if (/^🟡\s*\[SAVOIR\]$/i.test(ligne)) {
      traiterTag("savoir", "🟡 [SAVOIR]");
      continue;
    }

    if (/^🔴\s*\[INSPIRATION\]$/i.test(ligne)) {
      traiterTag("inspiration", "🔴 [INSPIRATION]");
      continue;
    }

    if (/^❓\s*\[CONSOLIDATION\]$/i.test(ligne)) {
      traiterTag("consolidation", "❓ [CONSOLIDATION]");
      continue;
    }

    const vecuSimple = ligne.match(/^🔵\s+(.*)$/i);
    if (vecuSimple) {
      traiterTag("vecu", "🔵 [VÉCU]", vecuSimple[1]);
      continue;
    }

    const savoirSimple = ligne.match(/^🟡\s+(.*)$/i);
    if (savoirSimple) {
      traiterTag("savoir", "🟡 [SAVOIR]", savoirSimple[1]);
      continue;
    }

    const inspirationSimple = ligne.match(/^🔴\s+(.*)$/i);
    if (inspirationSimple) {
      traiterTag("inspiration", "🔴 [INSPIRATION]", inspirationSimple[1]);
      continue;
    }

    const consolidationSimple = ligne.match(/^❓\s+(.*)$/i);
    if (consolidationSimple) {
      if (!vus.consolidation) {
        traiterTag("consolidation", "❓ [CONSOLIDATION]", consolidationSimple[1]);
      }
      continue;
    }

    resultat.push(ligne);
  }

  return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function supprimerBlocsAutomatiquesFaibles(texte = "") {
  return String(texte || "")
    .replace(/🟡\s*\[SAVOIR\]\s*\n?Voici l'idée essentielle\.?/gi, "")
    .replace(/🔴\s*\[INSPIRATION\]\s*\n?Une notion bien comprise te rend plus solide\.?/gi, "")
    .replace(/❓\s*\[CONSOLIDATION\]\s*\n?Dis-moi maintenant ce que tu retiens\.?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function supprimerIntroAvantPremierBloc(texte = "") {
  const t = String(texte || "").trim();

  const positions = [
    t.search(/🔵\s*\[VÉCU\]/i),
    t.search(/🟡\s*\[SAVOIR\]/i),
    t.search(/🔴\s*\[INSPIRATION\]/i),
    t.search(/❓\s*\[CONSOLIDATION\]/i)
  ].filter((i) => i >= 0);

  if (!positions.length) return t;

  const premierBloc = Math.min(...positions);

  return t.slice(premierBloc).trim();
}
function nettoyerReponseIA(texte = "") {
  let t = String(texte || "");

  t = t.replace(REGEX_HEADER_MWALIMU, "");
  t = t.replace(/^[-─]{5,}$/gm, "");
  t = t.replace(/^\s*🌟\s*Mot d['’]encouragement\s*:\s*.*$/gim, "");
  t = t.replace(/^\s*👉\s*Je reste disponible.*$/gim, "");
  t = t.replace(/^\s*👉\s*Continue à me parler.*$/gim, "");
  t = t.replace(/^\s*👉\s*Si tu veux.*$/gim, "");
  t = t.replace(/^\s*\*\*\*«[^»]+»\*\*\*\s*$/gm, "");

 
t = normaliserBalisesMwalimu(t);
t = supprimerIntroAvantPremierBloc(t);
t = supprimerBlocsAutomatiquesFaibles(t); 

  return supprimerDoublonsLignes(t);
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
  const b = String(bloc || "").trim();

  if (!b.includes("?")) return false;
  if (b.length < 25) return false;
  if (/le\/la\s+tu peux me donner/i.test(b)) return false;
  if (/règle de image/i.test(b)) return false;
  if (/lié à province/i.test(b) && !/province/i.test(b)) return false;

  return true;
}

function construireQuestionsConsolidationCiblee(question = "", corps = "", sujet = "") {
  const matiere = detecterMatierePrincipale(question, corps);
  const notion = sujet && sujet.length > 3 ? sujet : "cette notion";

  const modeles = {
    droit: `Explique avec tes mots l'idée juridique principale de ${notion}.`,
    geographie: `Donne un exemple concret lié à ${notion}.`,
    histoire: `Quelle idée importante retiens-tu de ${notion} ?`,
    math: `Quelle est la première étape à suivre pour résoudre ou comprendre ${notion} ?`,
    physique: `Quelle grandeur ou quelle formule faut-il d'abord identifier ?`,
    chimie: `Quelle idée essentielle faut-il retenir ici ?`,
    francais: `Donne un autre exemple simple qui illustre cette notion.`,
    sciences: `Quelle idée importante retiens-tu sur le vivant ou la nature ?`,
    biologie: `Explique avec tes mots ce que tu retiens de cette notion de biologie.`,
    microbiologie: `Cite un exemple simple lié aux microbes, aux bactéries ou aux virus.`,
    civisme: `Quel comportement citoyen peut-on retenir de cette leçon ?`,
    etude_milieu: `Donne un exemple simple tiré de ton milieu de vie.`,
    general: `Résume l'idée principale avec tes propres mots.`
  };

  return `❓ [CONSOLIDATION]
${modeles[matiere] || modeles.general}`;
}

function remplacerBlocConsolidation(corps = "", question = "", sujet = "") {
  let t = String(corps || "").trim();

  const existingBloc = t.match(REGEX_BLOC_CONSOLIDATION)?.[0] || "";

  if (existingBloc && blocEstPertinent(existingBloc)) {
    return t;
  }

  const nouveauBloc = construireQuestionsConsolidationCiblee(question, t, sujet);

  if (existingBloc) {
    t = t.replace(REGEX_BLOC_CONSOLIDATION, nouveauBloc);
  } else {
    t = `${t}\n\n${nouveauBloc}`;
  }

  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function choisirCitationFinale(question = "", corps = "") {
  const matiere = detecterMatierePrincipale(question, corps);

  if (matiere === "droit") {
    return "***« Un droit compris est un droit mieux défendu, pour soi et pour la nation. »***";
  }

  if (matiere === "geographie") return pick(CITATIONS.geographie);
  if (matiere === "histoire") return pick(CITATIONS.histoire);
  if (matiere === "math") return pick(CITATIONS.mathematiques);
  if (matiere === "physique" || matiere === "chimie") return pick(CITATIONS.sciences);
  if (matiere === "francais") return pick(CITATIONS.francais);
  if (matiere === "sciences" || matiere === "biologie" || matiere === "microbiologie") return pick(CITATIONS.sciences);
  if (matiere === "civisme") return pick(CITATIONS.civisme);

  if (matiere === "etude_milieu") {
    return "***« Observer son milieu, c'est apprendre à mieux vivre et mieux servir sa communauté. »***";
  }

  return pick(CITATIONS.general);
}

function construireVecuNaturel(user = {}, question = "", historique = []) {
  const prenom = premierPrenom(user?.nom || "");
  const sujetMemoire = retrouverSujetProche(historique, question);
  const matiere = detecterMatierePrincipale(question, "");

  if (estMessageRelationnelSimple(question)) {
    return `🔵 [VÉCU]
Je te lis, ${prenom}.`;
  }

  if (sujetMemoire) {
    return `🔵 [VÉCU]
D'accord ${prenom}, reprenons cela calmement.`;
  }

  if (matiere === "droit") {
    return `🔵 [VÉCU]
D'accord ${prenom}, regardons cette notion de droit simplement.`;
  }

  if (matiere === "geographie") {
    return `🔵 [VÉCU]
D'accord ${prenom}, regardons ce point de géographie calmement.`;
  }

  if (matiere === "histoire") {
    return `🔵 [VÉCU]
D'accord ${prenom}, prenons ce sujet d'histoire simplement.`;
  }

  if (matiere === "math") {
    return `🔵 [VÉCU]
D'accord ${prenom}, regardons cette notion de mathématiques pas à pas.`;
  }

  if (matiere === "biologie") {
    return `🔵 [VÉCU]
D'accord ${prenom}, observons cette notion du vivant simplement.`;
  }

  if (matiere === "microbiologie") {
    return `🔵 [VÉCU]
D'accord ${prenom}, regardons cette notion de microbiologie avec calme.`;
  }

  if (matiere === "civisme") {
    return `🔵 [VÉCU]
D'accord ${prenom}, voyons cette leçon de civisme avec des exemples simples.`;
  }

  if (matiere === "etude_milieu") {
    return `🔵 [VÉCU]
D'accord ${prenom}, partons de ton milieu de vie pour comprendre.`;
  }

  return `🔵 [VÉCU]
D'accord ${prenom}, voyons cela simplement.`;
}

function verifierStructureMwalimu(corps = "", user = {}, historique = [], question = "") {
  let t = normaliserBalisesMwalimu(corps);

  const aVecu = REGEX_VECU.test(t);
  const aSavoir = REGEX_SAVOIR.test(t);
  const aInspiration = REGEX_INSPIRATION.test(t);
  const aConsolidation = REGEX_CONSOLIDATION.test(t);

  if (aVecu && aSavoir && aInspiration && aConsolidation) {
    return t;
  }

  const morceaux = [];

  if (!aVecu) morceaux.push(construireVecuNaturel(user, question, historique));

  morceaux.push(t);

  if (!aSavoir) morceaux.push("🟡 [SAVOIR]\nVoici l'idée essentielle.");
  if (!aInspiration) morceaux.push("🔴 [INSPIRATION]\nUne notion bien comprise te rend plus solide.");
  if (!aConsolidation) morceaux.push("❓ [CONSOLIDATION]\nDis-moi ce que tu retiens en une phrase simple.");

  return morceaux.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function choisirOuvertureContextuelle(reponse = "", _user = {}, question = "") {
  const matiere = detecterMatierePrincipale(question, reponse);

  if (estMessageRelationnelSimple(question)) return "";
  if (matiere === "droit") return "👉 Si tu veux, nous pouvons revoir un autre terme juridique ensuite.";
  if (matiere === "geographie") return "👉 Si tu veux, nous pouvons continuer avec une autre petite question de géographie.";
  if (matiere === "histoire") return "👉 Si tu veux, nous pouvons prendre un autre point d'histoire ensuite.";
  if (matiere === "math") return "👉 Envoie-moi un petit exercice, et nous allons le résoudre étape par étape.";
  if (matiere === "physique" || matiere === "chimie") return "👉 Essaie maintenant de reformuler l'idée ou de faire une étape, puis envoie-moi ta réponse.";
  if (matiere === "biologie") return "👉 Si tu veux, nous pouvons continuer avec une autre notion de biologie.";
  if (matiere === "microbiologie") return "👉 Si tu veux, nous pouvons revoir un exemple de microbe, de bactérie ou de virus.";
  if (matiere === "civisme") return "👉 Si tu veux, nous pouvons continuer avec un exemple concret de citoyenneté.";
  if (matiere === "etude_milieu") return "👉 Si tu veux, nous pouvons prendre un exemple dans ton quartier, ton école ou ta famille.";

  return "👉 Dis-moi maintenant ce que tu retiens en une phrase simple.";
}

function choisirEncouragementContextuel(reponse = "", question = "") {
  const corps = String(reponse || "").toLowerCase();
  const q = String(question || "").toLowerCase();

  if (estMessageRelationnelSimple(question)) return "";

  const vraieReussite =
    q.includes("voici ma réponse") ||
    q.includes("ma réponse") ||
    q.includes("j'ai trouvé") ||
    q.includes("j'ai obtenu") ||
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
      normalisee.startsWith("🔴🟡🔵") ||
      normalisee.startsWith("────────────────") ||
      normalisee.startsWith("👉 ") ||
      normalisee.startsWith("🌟 mot d'encouragement") ||
      normalisee.startsWith("***«");

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

  corps = remplacerBlocConsolidation(corps, question, extraireSujetMemoire(question));

  corps = corps.replace(REGEX_HEADER_MWALIMU, "");
  corps = corps.replace(/^[-─]{5,}$/gm, "");
  corps = corps.replace(/^\s*\*\*\*«[^»]+»\*\*\*\s*$/gm, "");
  corps = corps.replace(/^👉\s*.*$/gim, "");
  corps = corps.replace(/^🌟\s*Mot d['’]encouragement\s*:.*$/gim, "");
  corps = supprimerBlocsAutomatiquesFaibles(corps);
  
corps = normaliserBalisesMwalimu(corps);
corps = supprimerIntroAvantPremierBloc(corps);

  const citationUnique = choisirCitationFinale(question, corps);
  const ouverture = choisirOuvertureContextuelle(corps, user, question);
  const encouragement = choisirEncouragementContextuel(corps, question);

  return dedupeBlocFinal([
    HEADER_MWALIMU,
    "────────────────",
    corps,
    citationUnique,
    ouverture,
    encouragement
  ].filter(Boolean).join("\n"));
}

function messageSecours(user, msgType = "message") {
  const appel = construireAppel({ nom: user?.nom || "élève" });

  return `${HEADER_MWALIMU}
────────────────
🔵 [VÉCU]
J'ai bien reçu ${messageTypeLisible(msgType)}, ${appel}.

🟡 [SAVOIR]
Je rencontre un petit souci technique pour traiter ta demande correctement maintenant.

🔴 [INSPIRATION]
Même quand cela bloque un peu, on peut reprendre avec calme et méthode.

❓ [CONSOLIDATION]
Réessaie dans un instant, ou reformule ta question plus simplement.

${pick(CITATIONS.general)}
👉 Je reste à tes côtés.
🌟 Mot d'encouragement : Nous pouvons reprendre calmement.`;
}

module.exports = {
  supprimerDoublonsLignes,
  normaliserBalisesMwalimu,
  supprimerBlocsAutomatiquesFaibles,
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
