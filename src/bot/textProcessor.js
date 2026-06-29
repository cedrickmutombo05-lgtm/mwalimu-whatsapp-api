

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
    .replace(/\bmwalimu edtech\b/gi, " ")
    .replace(/\bmwalimu\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contientMatiereScientifiqueRenforcee(texte = "") {
  const t = String(texte || "").toLowerCase();

  return (
    t.includes("chimie") ||
    t.includes("chimique") ||
    t.includes("réaction chimique") ||
    t.includes("reaction chimique") ||
    t.includes("atome") ||
    t.includes("atomes") ||
    t.includes("molécule") ||
    t.includes("molecule") ||
    t.includes("molécules") ||
    t.includes("molecules") ||
    t.includes("mélange") ||
    t.includes("melange") ||
    t.includes("corps pur") ||
    t.includes("acide") ||
    t.includes("base") ||

    t.includes("physique") ||
    t.includes("force") ||
    t.includes("forces") ||
    t.includes("mouvement") ||
    t.includes("énergie") ||
    t.includes("energie") ||
    t.includes("chaleur") ||
    t.includes("lumière") ||
    t.includes("lumiere") ||

    t.includes("électricité") ||
    t.includes("electricite") ||
    t.includes("courant") ||
    t.includes("courant électrique") ||
    t.includes("courant electrique") ||
    t.includes("tension") ||
    t.includes("résistance") ||
    t.includes("resistance") ||
    t.includes("circuit") ||
    t.includes("circuit électrique") ||
    t.includes("circuit electrique") ||

    t.includes("mécanique") ||
    t.includes("mecanique") ||
    t.includes("vitesse") ||
    t.includes("travail") ||
    t.includes("levier") ||
    t.includes("poulie") ||
    t.includes("machine simple") ||
    t.includes("machines simples")
  );
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
    const reponse =
      construireReponseChoixMatiere(user, texteUtilisateur) ||
      construireReponseChoixMatiere(user, textePourSocial);

    return {
      reponse,
      fiche: null,
      bypassFormat: true
    };
  }

  // 4. Réponse après une question de bien-être
  if (estSecondTourSalutation(historique, textePourSocial)) {
    const reponse = genererRepriseApresBienEtre(user, historique);

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

  const questionScientifiqueRenforcee =
    contientMatiereScientifiqueRenforcee(texteUtilisateur);

  if (
    !conversationDemarree &&
    !estQuestionAcademique(texteUtilisateur) &&
    !questionScientifiqueRenforcee
  ) {
    const relances = [
      `Je suis là pour t'aider **${prenomActuel}** 😊 Dis-moi, quelle matière ou quel exercice veux-tu travailler ?`,
      `N'hésite pas **${prenomActuel}** ! Tu peux me parler de maths, français, histoire, géographie, sciences, chimie, physique, électricité, mécanique, civisme ou droit. Qu'est-ce qui t'intéresse ?`,
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
    contientMatiereScientifiqueRenforcee(texteUtilisateur) ||

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

    texteMin.includes("chimie") ||
    texteMin.includes("chimique") ||
    texteMin.includes("atome") ||
    texteMin.includes("molécule") ||
    texteMin.includes("molecule") ||
    texteMin.includes("réaction chimique") ||
    texteMin.includes("reaction chimique") ||

    texteMin.includes("physique") ||
    texteMin.includes("force") ||
    texteMin.includes("mouvement") ||
    texteMin.includes("énergie") ||
    texteMin.includes("energie") ||
    texteMin.includes("chaleur") ||
    texteMin.includes("lumière") ||
    texteMin.includes("lumiere") ||

    texteMin.includes("électricité") ||
    texteMin.includes("electricite") ||
    texteMin.includes("courant") ||
    texteMin.includes("tension") ||
    texteMin.includes("résistance") ||
    texteMin.includes("resistance") ||
    texteMin.includes("circuit") ||

    texteMin.includes("mécanique") ||
    texteMin.includes("mecanique") ||
    texteMin.includes("vitesse") ||
    texteMin.includes("travail") ||
    texteMin.includes("levier") ||
    texteMin.includes("poulie") ||

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

  if (contientMatiereScientifiqueRenforcee(texteUtilisateur)) {
    consigneFinale += `\nLe message concerne une matière scientifique comme chimie, physique, électricité ou mécanique. Réponds avec rigueur, simplement, selon le niveau de l'élève.`;
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
  nettoyerNomBot,
  contientMatiereScientifiqueRenforcee
};
