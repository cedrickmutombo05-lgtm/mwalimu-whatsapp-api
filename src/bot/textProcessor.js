

const { logInfo } = require("../core/logger");

const {
  pick,
  premierPrenom,
  makeCacheKey,
  getCache,
  setCache
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

async function traiterTexte(user, texteUtilisateur, historique) { 
  
  const prenomActuel = premierPrenom(user?.nom || "");
  const classeActuelle = String(user?.classe || "").trim();

  if (!prenomActuel || prenomActuel === "élève") {
    return {
      reponse: `Bonsoir 😊 Avant de commencer, dis-moi ton prénom.

Exemple :
Je m'appelle Dora`,
      fiche: null,
      bypassFormat: true
    };
  }

  if (!classeActuelle) {
    return {
      reponse: `Merci **${prenomActuel}** 😊 Maintenant, dis-moi ta classe pour que je t'aide selon ton niveau.

Exemple :
Je suis en huitième`,
      fiche: null,
      bypassFormat: true
    };
  }
  // 1. Si l'élève choisit une matière, on reste en conversation sociale
  if (estChoixMatiere(texteUtilisateur)) {
    const reponse = construireReponseChoixMatiere(user, texteUtilisateur);

    return {
      reponse,
      fiche: null,
      bypassFormat: true
    };
  }

  // 2. Si Mwalimu a demandé "comment vas-tu ?" et l'élève répond, on répond humainement
  if (estSecondTourSalutation(historique, texteUtilisateur)) {
    const reponse = genererRepriseApresBienEtre(user);

    return {
      reponse,
      fiche: null,
      bypassFormat: true
    };
  }

  // 3. Messages sociaux simples : pas de VÉCU / SAVOIR / INSPIRATION / CONSOLIDATION
  if (estMessagePurementSocial(texteUtilisateur)) {
    const reponseSimple = construireReponseHumaineSimple(user, texteUtilisateur);

    if (reponseSimple) {
      return {
        reponse: reponseSimple,
        fiche: null,
        bypassFormat: true
      };
    }
  }

  // 4. Si la conversation pédagogique n'a pas encore commencé
  const conversationDemarree = historique.some((m) =>
    m.role === "user" && estQuestionAcademique(m.content || "")
  );

  if (!conversationDemarree && !estQuestionAcademique(texteUtilisateur)) {
    const prenom = premierPrenom(user?.nom || "");

    const relances = [
      `Je suis là pour t'aider **${prenom}** 😊 Dis-moi, quelle matière ou quel exercice veux-tu travailler ?`,
      `N'hésite pas **${prenom}** ! Tu peux me parler de maths, physique, histoire, géographie, droit... Qu'est-ce qui t'intéresse ?`,
      `**${prenom}**, je suis prêt à t'expliquer ce que tu veux. Quelle notion veux-tu comprendre aujourd'hui ?`,
      `Alors **${prenom}**, par quoi veux-tu commencer ? Un exercice ? Une leçon ? Dis-moi ce qui te tient à cœur.`
    ];

    return {
      reponse: pick(relances),
      fiche: null,
      bypassFormat: true
    };
  }

  // 5. Cache pédagogique
  const cacheKey = makeCacheKey(user, texteUtilisateur);
  const cached = getCache(cacheKey);

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
    texteMin.includes("formes geometriques");

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
    setCache(cacheKey, reponse);
  }

  if (!reponse || !String(reponse).trim()) {
    await logUnansweredQuestion(user, texteUtilisateur, "text", "traiterTexte_empty");
  }

  if (!estSoumissionReponse(texteUtilisateur)) {
    await resetStudentAttempt(user.phone, antiBoucle.sujet || analyse.sujet || "general");
  }

  return {
    reponse,
    fiche: fiche || null,
    bypassFormat: false
  };
}

module.exports = {
  traiterTexte
};
