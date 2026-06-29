

const { logInfo } = require("../core/logger");

const {
  pick,
  premierPrenom,
  cache
} = require("../core");

const {
  consulterBibliotheque,
  resetStudentAttempt,
  logUnansweredQuestion
} = require("../db");

const {
  estChoixMatiere,
  construireReponseChoixMatiere,
  estMessagePurementSocial,
  estSecondTourSalutation,
  genererRepriseApresBienEtre,
  construireReponseHumaineSimple
} = require("./social");

const {
  estSoumissionReponse,
  estQuestionTechnique,
  extraireSujetMemoire,
  detecterMatiereScientifique,
  estQuestionGeographieRDC,
  estQuestionAcademique
} = require("./detectors");

const {
  construireConsignePedagogique,
  detecterIntentionIA,
  construireConsigneAntiBoucle,
  construireReponseDbWebIa
} = require("./tutor");

function makeLocalCacheKey(user = {}, texte = "") {
  const nom = String(user?.nom || "").toLowerCase().trim();
  const classe = String(user?.classe || "").toLowerCase().trim();
  const q = String(texte || "").toLowerCase().trim();

  return `${nom}|${classe}|${q}`;
}

function getLocalCache(key) {
  return cache?.get ? cache.get(key) : null;
}

function setLocalCache(key, value) {
  if (cache?.set) cache.set(key, value);
}

function classeEstInvalide(classe = "") {
  const c = String(classe || "").trim().toLowerCase();

  const invalides = [
    "",
    "en",
    "fatigue",
    "fatiguee",
    "fatigué",
    "fatiguée",
    "je suis fatigue",
    "je suis fatiguee",
    "je suis fatigué",
    "je suis fatiguée"
  ];

  return invalides.includes(c);
}

function nettoyerNomBot(texte = "") {
  return String(texte || "")
    .replace(/\bmwalimu\b/gi, " ")
    .replace(/\bmwalimu edtech\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function traiterTexte(user, texteUtilisateur, historique = []) {
  const texteSocial = nettoyerNomBot(texteUtilisateur);
  const textePourSocial = texteSocial || texteUtilisateur;

  const prenomActuel = premierPrenom(user?.nom || "");
  const classeActuelle = String(user?.classe || "").trim();

  // 1. Sécurité profil : prénom obligatoire
  if (!user?.nom || !prenomActuel || prenomActuel === "élève") {
    return {
      reponse: `Bonsoir 😊 Avant de commencer, quel est ton prénom ?`,
      fiche: null,
      bypassFormat: true
    };
  }

  // 2. Sécurité profil : classe obligatoire
  if (classeEstInvalide(classeActuelle)) {
    return {
      reponse: `Merci **${prenomActuel}** 😊 Maintenant, dis-moi ta classe pour que je t'aide selon ton niveau.`,
      fiche: null,
      bypassFormat: true
    };
  }

  // 3. Choix de matière : orientation sociale, pas de pédagogie directe
  if (estChoixMatiere(texteUtilisateur) || estChoixMatiere(textePourSocial)) {
    const reponse = construireReponseChoixMatiere(user, texteUtilisateur)
      || construireReponseChoixMatiere(user, textePourSocial);

    return {
      reponse,
      fiche: null,
      bypassFormat: true
    };
  }

  // 4. Réponse après une question de bien-être
  if (estSecondTourSalutation(historique, textePourSocial)) {
    const reponse = genererRepriseApresBienEtre(user);

    return {
      reponse,
      fiche: null,
      bypassFormat: true
    };
  }

  // 5. Messages sociaux simples : pas de VÉCU/SAVOIR/INSPIRATION/CONSOLIDATION
  if (
    estMessagePurementSocial(texteUtilisateur) ||
    estMessagePurementSocial(textePourSocial)
  ) {
    const reponseSimple = construireReponseHumaineSimple(
      user,
      textePourSocial,
      historique
    );

    if (reponseSimple) {
      return {
        reponse: reponseSimple,
        fiche: null,
        bypassFormat: true
      };
    }
  }

  // 6. Si l’élève parle sans poser encore une vraie question académique
  const conversationDemarree = historique.some((m) =>
    m.role === "user" && estQuestionAcademique(m.content || "")
  );

  if (!conversationDemarree && !estQuestionAcademique(texteUtilisateur)) {
    const relances = [
      `Je suis là pour t'aider **${prenomActuel}** 😊 Dis-moi, quelle matière ou quel exercice veux-tu travailler ?`,
      `N'hésite pas **${prenomActuel}** ! Tu peux me parler de maths, français, histoire, géographie, sciences, civisme ou droit. Qu'est-ce qui t'intéresse ?`,
      `**${prenomActuel}**, je suis prêt à t'expliquer ce que tu veux. Quelle notion veux-tu comprendre aujourd'hui ?`,
      `Alors **${prenomActuel}**, par quoi veux-tu commencer ? Un exercice, une leçon ou une matière précise ?`
    ];

    return {
      reponse: pick(relances),
      fiche: null,
      bypassFormat: true
    };
  }

  // 7. Cache pédagogique
  const cacheKey = makeLocalCacheKey(user, texteUtilisateur);
  const cached = getLocalCache(cacheKey);

  if (cached) {
    logInfo("cache_hit", {
      phone: user?.phone || "",
      cacheKey
    });

    return {
      reponse: cached,
      fiche: null,
      bypassFormat: false
    };
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
    texteMin.includes("colonisation") ||
    texteMin.includes("biologie") ||
    texteMin.includes("microbiologie") ||
    texteMin.includes("civisme") ||
    texteMin.includes("citoyenneté") ||
    texteMin.includes("citoyennete") ||
    texteMin.includes("étude du milieu") ||
    texteMin.includes("etude du milieu") ||
    texteMin.includes("système métrique") ||
    texteMin.includes("systeme metrique") ||
    texteMin.includes("formes géométriques") ||
    texteMin.includes("formes geometriques") ||
    texteMin.includes("mer") ||
    texteMin.includes("mers") ||
    texteMin.includes("océan") ||
    texteMin.includes("ocean") ||
    texteMin.includes("océans") ||
    texteMin.includes("oceans");

  if (besoinAnalyseIA) {
    analyse = await detecterIntentionIA(user, texteUtilisateur, historique);
  }

  const fiche = await consulterBibliotheque(texteUtilisateur, user.classe || "");
  const consigneBase = construireConsignePedagogique(texteUtilisateur, "text");
  const antiBoucle = await construireConsigneAntiBoucle(
    user,
    texteUtilisateur,
    historique
  );

  let consigneFinale = consigneBase;

  if (analyse.intention === "juridique") {
    consigneFinale += `\nLe message semble juridique. Si c'est un article, recopie-le exactement seulement s'il est fiable.`;
  }

  if (
    analyse.intention === "geographie_rdc" ||
    estQuestionGeographieRDC(texteUtilisateur, fiche)
  ) {
    consigneFinale += `\nLe message concerne probablement une subdivision administrative. Si une liste complète est demandée, donne la liste complète trouvée.`;
  }

  consigneFinale += `\nLa consolidation, la citation finale et l'ouverture finale doivent rester dans la matière principale de la question.`;

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
    setLocalCache(cacheKey, reponse);
  }

  if (!reponse || !String(reponse).trim()) {
    await logUnansweredQuestion(
      user,
      texteUtilisateur,
      "text",
      "traiterTexte_empty"
    );
  }

  if (!estSoumissionReponse(texteUtilisateur)) {
    await resetStudentAttempt(
      user.phone,
      antiBoucle.sujet || analyse.sujet || "general"
    );
  }

  return {
    reponse,
    fiche: fiche || null,
    bypassFormat: false
  };
}

module.exports = {
  traiterTexte,
  makeLocalCacheKey,
  getLocalCache,
  setLocalCache,
  classeEstInvalide,
  nettoyerNomBot
};
