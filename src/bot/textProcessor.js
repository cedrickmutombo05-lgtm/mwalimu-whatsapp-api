

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
  estMessagePurementSocial,
  estSecondTourSalutation,
  genererRepriseApresBienEtre,
  construireReponseHumaineSimple,
  normaliserSocial,
  estMessageRemerciement,
  estMessageSalutation,
  estMessageCourtHumain,
  estMessageRetourTravail
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

  return [
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
  ].includes(c);
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
    t.includes("molécule") ||
    t.includes("mélange") ||
    t.includes("melange") ||
    t.includes("corps pur") ||
    t.includes("acide") ||
    t.includes("base") ||
    t.includes("physique") ||
    t.includes("force") ||
    t.includes("mouvement") ||
    t.includes("énergie") ||
    t.includes("energie") ||
    t.includes("chaleur") ||
    t.includes("lumière") ||
    t.includes("lumiere") ||
    t.includes("électricité") ||
    t.includes("electricite") ||
    t.includes("courant") ||
    t.includes("tension") ||
    t.includes("résistance") ||
    t.includes("resistance") ||
    t.includes("circuit") ||
    t.includes("mécanique") ||
    t.includes("mecanique") ||
    t.includes("vitesse") ||
    t.includes("travail") ||
    t.includes("levier") ||
    t.includes("poulie")
  );
}

function estPhraseInterneIA(texte = "") {
  const t = String(texte || "").toLowerCase();

  return (
    t.includes("tool_code") ||
    t.includes("google_search") ||
    t.includes("queries=") ||
    t.includes("thought") ||
    t.includes("here's a plan") ||
    t.includes("heres a plan") ||
    t.includes("the user wants") ||
    t.includes("i need to") ||
    t.includes("i will") ||
    t.includes("i should") ||
    t.includes("provided context") ||
    t.includes("mwalimu edtech persona") ||
    t.includes("ask one or two") ||
    t.includes("dora's understanding") ||
    t.includes("core concepts") ||
    t.includes("start with") ||
    t.includes("include") ||
    t.includes("for a student")
  );
}

function estAccuseReceptionSimple(texte = "") {
  const t = normaliserSocial(texte);

  if (!t) return false;
  if (t.includes("?")) return false;

  const mots = t.split(/\s+/).filter(Boolean);

  if (mots.length > 5) return false;

  return (
    /^(ok|okay|d accord|daccord|compris|bien compris|entendu|parfait|cool|merci|noté|note)$/.test(t) ||
    t.includes("message recu") ||
    t.includes("message reçu") ||
    t.includes("bien recu") ||
    t.includes("bien reçu") ||
    t.includes("c est bon") ||
    t.includes("cest bon") ||
    t.includes("ca marche") ||
    t.includes("ça marche") ||
    t.includes("c est clair") ||
    t.includes("cest clair") ||
    t.includes("c est compris") ||
    t.includes("cest compris")
  );
}

function estIntentionApprendre(texte = "") {
  const t = normaliserSocial(texte);

  if (!t) return false;

  return (
    /\b(apprendre|etudier|étudier|travailler|revoir|commencer|continuer|faire|pratiquer|exercer|choisir|prendre|reprendre)\b/.test(t) ||
    /\b(je veux|je voudrais|j aimerais|je souhaite|on commence|commencons|commençons|on fait|faisons|je choisis|je prends)\b/.test(t)
  );
}

function retirerMotsIntentionApprendre(texte = "") {
  return normaliserSocial(texte)
    .replace(/\b(je veux|je voudrais|j aimerais|je souhaite|on veut|on peut|on va|nous allons)\b/g, " ")
    .replace(/\b(apprendre|etudier|étudier|travailler|revoir|commencer|continuer|faire|pratiquer|exercer|choisir|prendre|reprendre|commencons|commençons|faisons)\b/g, " ")
    .replace(/\b(avec|sur|le|la|les|un|une|du|de|des|ce|cette|ces|cours|matiere|matière|lecon|leçon|chapitre|theme|thème|sujet)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contientObjetApprentissage(texte = "") {
  const reste = retirerMotsIntentionApprendre(texte);
  const motsUtiles = reste
    .split(/\s+/)
    .filter((m) => m.length >= 3);

  return motsUtiles.length >= 1;
}

function estIntentionApprendreSansObjet(texte = "") {
  return estIntentionApprendre(texte) && !contientObjetApprentissage(texte);
}

function estMatiereLargeProbable(texte = "") {
  const t = normaliserSocial(texte);

  return (
    t.includes("francais") ||
    t.includes("français") ||
    t.includes("mathematique") ||
    t.includes("mathématique") ||
    t.includes("maths") ||
    t.includes("geographie") ||
    t.includes("géographie") ||
    t.includes("histoire") ||
    t.includes("biologie") ||
    t.includes("chimie") ||
    t.includes("physique") ||
    t.includes("civisme") ||
    t.includes("droit") ||
    t.includes("science") ||
    t.includes("anglais")
  );
}

function estDemandeApprentissageAvecObjetPrecis(texte = "") {
  if (!estIntentionApprendre(texte)) return false;
  if (!contientObjetApprentissage(texte)) return false;

  return !estMatiereLargeProbable(texte);
}

function estMessageCourtThemeProbable(texte = "") {
  const t = normaliserSocial(texte);

  if (!t) return false;
  if (t.includes("?")) return false;
  if (estAccuseReceptionSimple(texte)) return false;
  if (estMessageSalutation(texte)) return false;
  if (estMessageRemerciement(texte)) return false;
  if (estMessageFatigueOuPause(texte)) return false;

  const mots = t.split(/\s+/).filter(Boolean);

  return mots.length >= 1 && mots.length <= 5;
}

function estMessageVagueSansObjet(texte = "") {
  const t = normaliserSocial(texte);

  if (!t) return true;
  if (estAccuseReceptionSimple(texte)) return false;
  if (estMessageSalutation(texte)) return false;
  if (estMessageRemerciement(texte)) return false;
  if (estMessageFatigueOuPause(texte)) return false;

  if (estIntentionApprendreSansObjet(texte)) return true;

  return (
    t === "cours" ||
    t === "matiere" ||
    t === "matière" ||
    t === "lecon" ||
    t === "leçon" ||
    t === "exercice" ||
    t === "commencer" ||
    t === "on commence"
  );
}

function estRappelConsolidationAssistant(texte = "") {
  const t = normaliserSocial(texte);

  return (
    t.includes("doucement") &&
    t.includes("avant de passer") &&
    t.includes("question de consolidation")
  );
}

function estPauseAccordeeAssistant(texte = "") {
  const t = normaliserSocial(texte);

  return (
    t.includes("repose toi") &&
    t.includes("question de consolidation") &&
    (
      t.includes("quand tu seras pret") ||
      t.includes("quand tu seras prete") ||
      t.includes("quand tu seras prêt") ||
      t.includes("quand tu seras prête")
    )
  );
}

function estConfirmationPauseAccordeeAssistant(texte = "") {
  const t = normaliserSocial(texte);

  return (
    t.includes("repose toi tranquillement") &&
    t.includes("question reste simplement en attente")
  );
}

function estRepriseConsolidationAssistant(texte = "") {
  const t = normaliserSocial(texte);

  return (
    t.includes("question de consolidation") &&
    (
      t.includes("etait restee en attente") ||
      t.includes("était restée en attente") ||
      t.includes("restee en attente") ||
      t.includes("restée en attente")
    )
  );
}

function dernierMessageAssistantEstPauseAccordee(historique = []) {
  const messages = [...historique].reverse();

  for (const msg of messages) {
    if (msg?.role !== "assistant") continue;

    return (
      estPauseAccordeeAssistant(msg?.content || "") ||
      estConfirmationPauseAccordeeAssistant(msg?.content || "")
    );
  }

  return false;
}

function dernierePauseEtaitFeminine(historique = []) {
  const messages = [...historique].reverse();

  for (const msg of messages) {
    if (msg?.role !== "assistant") continue;

    const contenu = String(msg?.content || "");

    if (estPauseAccordeeAssistant(contenu)) {
      const t = normaliserSocial(contenu);
      return t.includes("seras prete") || t.includes("seras prête");
    }
  }

  return false;
}

function estQuestionConsolidationValide(texte = "") {
  const q = String(texte || "").trim();

  if (!q) return false;
  if (estPhraseInterneIA(q)) return false;
  if (q.length < 8 || q.length > 320) return false;

  return (
    q.includes("?") ||
    /^explique/i.test(q) ||
    /^dis/i.test(q) ||
    /^peux-tu/i.test(q) ||
    /^peux tu/i.test(q) ||
    /^donne/i.test(q) ||
    /^cite/i.test(q)
  );
}

function nettoyerLigneConsolidation(ligne = "") {
  return String(ligne || "")
    .replace(/^[-•👉❓\s*]+/, "")
    .replace(/^\*\*/, "")
    .replace(/\*\*$/, "")
    .trim();
}

function extraireDerniereQuestionDepuisBloc(bloc = "") {
  const lignes = String(bloc || "")
    .split("\n")
    .map(nettoyerLigneConsolidation)
    .filter(Boolean)
    .filter((l) => !estPhraseInterneIA(l))
    .filter((l) => !/^\*\*\*«/.test(l))
    .filter((l) => !/^🌟|^⭐/.test(l))
    .filter((l) => !/^mot d'encouragement/i.test(l));

  const ligneQuestion = lignes.find((l) => estQuestionConsolidationValide(l));

  if (ligneQuestion) return ligneQuestion;

  const texte = lignes.join(" ").trim();
  const matchQuestion = texte.match(/([^.!?]*\?)/);

  if (matchQuestion?.[1] && estQuestionConsolidationValide(matchQuestion[1])) {
    return matchQuestion[1].trim();
  }

  return "";
}

function extraireQuestionConsolidationDepuisTexte(texte = "") {
  const contenu = String(texte || "");

  if (!contenu) return "";

  const regexConsolidation = /(?:❓\s*)?(?:\*\*)?\[CONSOLIDATION\](?:\*\*)?/gi;
  const positions = [];
  let match;

  while ((match = regexConsolidation.exec(contenu)) !== null) {
    positions.push({
      index: match.index,
      end: regexConsolidation.lastIndex
    });
  }

  if (positions.length > 0) {
    const dernierePosition = positions[positions.length - 1];

    let bloc = contenu.slice(dernierePosition.end);

    bloc = bloc
      .split(/\n(?=\*\*\*«|🌟|⭐|🔴|🟡|🔵|Mot d'encouragement|tool_code|thought|Voici un plan|Here|🔶|✅)/i)[0]
      .trim();

    const question = extraireDerniereQuestionDepuisBloc(bloc);

    if (question) return question;
  }

  const questionsEmoji = [...contenu.matchAll(/❓\s*([\s\S]*?\?)/g)];

  if (questionsEmoji.length > 0) {
    const derniere = questionsEmoji[questionsEmoji.length - 1]?.[1]?.trim() || "";
    const question = nettoyerLigneConsolidation(derniere);

    if (estQuestionConsolidationValide(question)) {
      return question;
    }
  }

  return "";
}

function extraireQuestionDepuisLigneFleche(texte = "") {
  const lignes = String(texte || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const ligneFleche = lignes.find((l) => l.startsWith("👉"));

  if (!ligneFleche) return "";

  return nettoyerLigneConsolidation(ligneFleche);
}

function escapeRegExp(texte = "") {
  return String(texte).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function retirerPrenomInitial(texte = "", user = {}) {
  const prenom = premierPrenom(user?.nom || "");

  if (!prenom || prenom === "élève") {
    return String(texte || "").trim();
  }

  const regex = new RegExp(`^${escapeRegExp(prenom)}\\s*,\\s*`, "i");

  return String(texte || "").replace(regex, "").trim();
}

function minusculePremiereLettre(texte = "") {
  const t = String(texte || "").trim();

  if (!t) return "";

  return t.charAt(0).toLowerCase() + t.slice(1);
}

function retirerPointFinal(texte = "") {
  return String(texte || "")
    .replace(/[?.!]+\s*$/g, "")
    .trim();
}

function transformerQuestionAuFutur(question = "", user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  let q = retirerPointFinal(question);

  q = retirerPrenomInitial(q, user);

  q = q
    .replace(/^peux[-\s]?tu\s+m['’]?expliquer/gi, "tu m’expliqueras")
    .replace(/^peux[-\s]?tu\s+me\s+dire/gi, "tu me diras")
    .replace(/^peux[-\s]?tu\s+me\s+donner/gi, "tu me donneras")
    .replace(/^peux[-\s]?tu\s+me\s+citer/gi, "tu me citeras")
    .replace(/^peux[-\s]?tu\s+citer/gi, "tu citeras")
    .replace(/^explique[-\s]?moi/gi, "tu m’expliqueras")
    .replace(/^donne[-\s]?moi/gi, "tu me donneras")
    .replace(/^dis[-\s]?moi/gi, "tu me diras")
    .replace(/^cite[-\s]?moi/gi, "tu me citeras")
    .trim();

  if (
    prenom &&
    prenom !== "élève" &&
    !new RegExp(`^${escapeRegExp(prenom)}\\s*,`, "i").test(q)
  ) {
    q = `${prenom}, ${minusculePremiereLettre(q)}`;
  }

  return `${q}.`;
}

function transformerQuestionAuPresent(question = "", user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  let q = retirerPointFinal(question);

  q = retirerPrenomInitial(q, user);

  q = q
    .replace(/^tu\s+m['’]?expliqueras/gi, "peux-tu m’expliquer")
    .replace(/^tu\s+me\s+diras/gi, "peux-tu me dire")
    .replace(/^tu\s+me\s+donneras/gi, "peux-tu me donner")
    .replace(/^tu\s+me\s+citeras/gi, "peux-tu me citer")
    .replace(/^tu\s+citeras/gi, "peux-tu citer")
    .trim();

  if (!/^peux[-\s]?tu|^explique|^donne|^dis|^cite/i.test(q)) {
    q = `peux-tu me répondre à ceci : ${q}`;
  }

  if (
    prenom &&
    prenom !== "élève" &&
    !new RegExp(`^${escapeRegExp(prenom)}\\s*,`, "i").test(q)
  ) {
    q = `${prenom}, ${minusculePremiereLettre(q)}`;
  }

  return `${q} ?`;
}

function extraireQuestionDepuisPauseAccordee(texte = "", user = {}) {
  const futur = extraireQuestionDepuisLigneFleche(texte);

  if (!futur) return "";

  return transformerQuestionAuPresent(futur, user);
}

function detecterConsolidationEnAttente(historique = [], user = {}) {
  const messages = [...historique].reverse();

  for (const msg of messages) {
    if (msg?.role !== "assistant") continue;

    const contenu = String(msg?.content || "");

    if (
      /consolidation validée/i.test(contenu) ||
      /ta réponse est juste/i.test(contenu) ||
      /ta reponse est juste/i.test(contenu) ||
      /tu as compris l’essentiel/i.test(contenu) ||
      /tu as compris l'essentiel/i.test(contenu) ||
      /nous pouvons maintenant passer/i.test(contenu)
    ) {
      return null;
    }

    if (estPauseAccordeeAssistant(contenu)) {
      const questionPause = extraireQuestionDepuisPauseAccordee(contenu, user);

      if (questionPause) {
        return {
          question: questionPause,
          source: contenu,
          depuisPause: true
        };
      }

      continue;
    }

    if (estRepriseConsolidationAssistant(contenu)) {
      const questionReprise = extraireQuestionDepuisLigneFleche(contenu);

      if (questionReprise) {
        return {
          question: questionReprise,
          source: contenu,
          depuisPause: true
        };
      }

      continue;
    }

    if (estConfirmationPauseAccordeeAssistant(contenu)) {
      continue;
    }

    if (estRappelConsolidationAssistant(contenu)) {
      continue;
    }

    if (!/\[CONSOLIDATION\]|❓/i.test(contenu)) {
      continue;
    }

    const question = extraireQuestionConsolidationDepuisTexte(contenu);

    if (question) {
      return {
        question,
        source: contenu,
        depuisPause: false
      };
    }
  }

  return null;
}

function estMessageFatigueOuPause(texte = "") {
  const t = normaliserSocial(texte);

  return (
    /je suis fatigue|je suis fatiguee|je suis malade|je ne me sens pas bien/.test(t) ||
    /je dois partir|je pars|a demain|bonne nuit|on reprend demain/.test(t)
  );
}

function estFormeFeminineFatigue(texte = "") {
  const t = normaliserSocial(texte);

  return (
    t.includes("fatiguee") ||
    t.includes("fatiguée") ||
    t.includes("malade") ||
    t.includes("prete") ||
    t.includes("prête")
  );
}

function estQuestionUtilisateur(texte = "") {
  const t = normaliserSocial(texte);

  if (!t) return false;

  return (
    t.includes("?") ||
    /^(quel|quelle|quels|quelles)\s+/.test(t) ||
    /^(qui est|qui sont|ou est|où est|ou se trouve|où se trouve)/.test(t) ||
    /^(pourquoi|comment|combien|quand|que signifie|qu est ce que|c est quoi)/.test(t) ||
    /^(donne moi|explique moi|explique|parle moi|cite moi)/.test(t)
  );
}

function estNouvelleDemandePendantConsolidation(texte = "") {
  const t = normaliserSocial(texte);

  if (estChoixMatiere(texte)) return true;
  if (estQuestionUtilisateur(texte)) return true;
  if (estIntentionApprendre(texte) && contientObjetApprentissage(texte)) return true;

  return (
    /qu est ce que|c est quoi|pourquoi|comment|quels sont|quelle est|quel est|qui est|ou est|où est/.test(t)
  );
}

function estDemandeRepriseQuestionPendante(texte = "") {
  const t = normaliserSocial(texte);

  return (
    t.includes("question en attente") ||
    t.includes("question pendante") ||
    t.includes("reprenons la question") ||
    t.includes("reprendre la question") ||
    t.includes("la question d avant") ||
    t.includes("la question d'avant") ||
    t.includes("question restée") ||
    t.includes("question restee")
  );
}

function estMessageRepriseApresPause(texte = "") {
  const t = normaliserSocial(texte);

  return (
    estMessageRetourTravail(texte) ||
    t.includes("je suis de retour") ||
    t.includes("me voici") ||
    t.includes("je suis revenue") ||
    t.includes("je suis revenu") ||
    t.includes("je suis prete") ||
    t.includes("je suis prête") ||
    t.includes("je suis pret") ||
    t.includes("je suis prêt") ||
    t.includes("on reprend") ||
    t.includes("nous reprenons") ||
    t.includes("reprenons") ||
    t.includes("continuons") ||
    t.includes("bonsoir") ||
    t.includes("bonjour")
  );
}

function estTentativeReponseConsolidation(texte = "") {
  const t = normaliserSocial(texte);

  if (!t) return false;
  if (estAccuseReceptionSimple(texte)) return false;
  if (estQuestionUtilisateur(texte)) return false;
  if (estChoixMatiere(texte)) return false;
  if (estIntentionApprendre(texte) && contientObjetApprentissage(texte)) return false;
  if (estMessageRemerciement(texte)) return false;
  if (estMessageSalutation(texte)) return false;
  if (estMessageCourtHumain(texte)) return false;
  if (estMessageRetourTravail(texte)) return false;
  if (estDemandeRepriseQuestionPendante(texte)) return false;
  if (estNouvelleDemandePendantConsolidation(texte)) return false;

  return t.split(/\s+/).filter(Boolean).length >= 1;
}

function extraireContexteDerniereLecon(historique = []) {
  const messages = [...historique].reverse();

  for (const msg of messages) {
    if (msg?.role !== "assistant") continue;

    const contenu = String(msg?.content || "");

    if (estRappelConsolidationAssistant(contenu)) continue;
    if (estPauseAccordeeAssistant(contenu)) continue;
    if (estConfirmationPauseAccordeeAssistant(contenu)) continue;
    if (estRepriseConsolidationAssistant(contenu)) continue;
    if (/consolidation validée/i.test(contenu)) continue;

    if (/\[VÉCU\]|\[SAVOIR\]|\[CONSOLIDATION\]|❓/i.test(contenu)) {
      return contenu.slice(0, 4000);
    }
  }

  return "";
}

function extraireJsonDepuisTexte(texte = "") {
  const brut = String(texte || "").trim();

  try {
    return JSON.parse(brut);
  } catch (_) {
    // on continue
  }

  const match = brut.match(/\{[\s\S]*\}/);

  if (!match?.[0]) return null;

  try {
    return JSON.parse(match[0]);
  } catch (_) {
    return null;
  }
}

function normaliserStatutEvaluation(statut = "") {
  const s = normaliserSocial(statut);

  if (s.includes("correct") && !s.includes("incorrect")) return "correct";
  if (s.includes("partiel")) return "partiel";
  if (s.includes("hors")) return "hors_sujet";
  if (s.includes("incorrect") || s.includes("faux")) return "incorrect";

  return "incorrect";
}

function evaluationLocaleSecours(question = "", reponse = "") {
  const r = normaliserSocial(reponse);

  if (!r) {
    return {
      statut: "incorrect",
      explication: "La réponse est vide.",
      reponse_attendue: "",
      question_a_reposer: question
    };
  }

  if (estAccuseReceptionSimple(reponse)) {
    return {
      statut: "hors_sujet",
      explication: "Ce message est seulement un accusé de réception, pas une réponse au fond.",
      reponse_attendue: "",
      question_a_reposer: question
    };
  }

  if (
    /je ne sais pas|j ai oublie|j'ai oublié|aucune idee|aucune idée|je n ai pas compris|je n'ai pas compris/.test(r)
  ) {
    return {
      statut: "incorrect",
      explication: "L’élève reconnaît qu’il n’a pas encore compris.",
      reponse_attendue: "",
      question_a_reposer: question
    };
  }

  return {
    statut: "incorrect",
    explication: "La réponse doit être vérifiée par le correcteur pédagogique avant validation.",
    reponse_attendue: "",
    question_a_reposer: question
  };
}

async function evaluerConsolidationAvecIA(user = {}, question = "", reponseEleve = "", historique = []) {
  const lecon = extraireContexteDerniereLecon(historique);
  const prenom = premierPrenom(user?.nom || "") || "l’élève";
  const classe = user?.classe || "non précisée";

  const consigne = `
Tu es le correcteur pédagogique strict de Mwalimu EdTech.

Mission :
Évaluer uniquement la réponse de l'élève à la question de consolidation.

Règles absolues :
1. Ne valide jamais une réponse fausse.
2. Si la question demande une liste ou plusieurs éléments, vérifie toute la réponse.
3. Une liste incomplète ou contenant un élément faux ne doit pas être validée.
4. Si la question demande un fait précis, vérifie avec rigueur.
5. Si la question porte sur la compréhension, accepte les propres mots de l'élève si l'idée est correcte.
6. Une réponse courte peut être correcte.
7. Une réponse longue peut être fausse.
8. Un accusé de réception n'est pas une réponse au fond.
9. Ne pose aucune nouvelle question.
10. Ne change jamais la question de consolidation.
11. Retourne uniquement un JSON valide, sans Markdown, sans explication hors JSON.

Statuts autorisés :
- "correct"
- "partiel"
- "incorrect"
- "hors_sujet"

Format JSON obligatoire :
{
  "statut": "correct|partiel|incorrect|hors_sujet",
  "explication": "explication courte, tendre et pédagogique",
  "reponse_attendue": "réponse attendue ou idée attendue",
  "question_a_reposer": "la même question de consolidation"
}
`;

  const prompt = `
Élève : ${prenom}
Classe : ${classe}

LEÇON DONNÉE AVANT LA CONSOLIDATION :
${lecon || "Aucune leçon disponible. Évalue alors avec tes connaissances pédagogiques fiables."}

QUESTION DE CONSOLIDATION EXACTE :
${question}

RÉPONSE DE L'ÉLÈVE :
${reponseEleve}

Évalue la réponse.
Retourne uniquement le JSON demandé.
`;

  try {
    const brut = await construireReponseDbWebIa(
      user,
      prompt,
      historique.slice(-8),
      null,
      consigne
    );

    const json = extraireJsonDepuisTexte(brut);

    if (!json) {
      return evaluationLocaleSecours(question, reponseEleve);
    }

    const statut = normaliserStatutEvaluation(json.statut);

    return {
      statut,
      explication: String(json.explication || "").trim(),
      reponse_attendue: String(json.reponse_attendue || "").trim(),
      question_a_reposer: String(json.question_a_reposer || question).trim() || question
    };
  } catch (error) {
    logInfo("evaluation_consolidation_ia_error", {
      error: error?.message || String(error)
    });

    return evaluationLocaleSecours(question, reponseEleve);
  }
}

function construireRappelConsolidation(user = {}, question = "") {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom && prenom !== "élève" ? `**${prenom}**` : "toi";

  return `Doucement ${appel} 😊

Avant de passer à autre chose, répondons d'abord à la petite question de consolidation.

C'est important pour vérifier que tu as vraiment compris. Je te le demande comme un précepteur qui veut te voir progresser avec sérénité.

👉 ${question}`;
}

function construireRepriseApresPauseAvecConsolidation(user = {}, question = "") {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom && prenom !== "élève" ? `**${prenom}**` : "toi";

  return `Bon retour ${appel} 😊

Nous reprenons calmement là où nous nous étions arrêtés.

La petite question de consolidation était restée en attente :

👉 ${question}`;
}

function construireReponsePauseAvecConsolidation(user = {}, question = "", texteUtilisateur = "") {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom && prenom !== "élève" ? `**${prenom}**` : "toi";
  const pret = estFormeFeminineFatigue(texteUtilisateur) ? "prête" : "prêt";
  const questionFuture = transformerQuestionAuFutur(question, user);

  return `Je comprends ${appel} 😊 Repose-toi un peu.

Quand tu seras ${pret}, on reprendra calmement. Nous commencerons par la petite question de consolidation restée en attente :

👉 ${questionFuture}`;
}

function construireConfirmationPauseAccordee(user = {}, historique = []) {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom && prenom !== "élève" ? `**${prenom}**` : "toi";
  const pret = dernierePauseEtaitFeminine(historique) ? "prête" : "prêt";

  return `Parfait ${appel} 😊

Repose-toi tranquillement. La question reste simplement en attente, et nous la reprendrons quand tu seras ${pret}.`;
}

async function construireFeedbackConsolidation(user = {}, question = "", reponseEleve = "", historique = []) {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom && prenom !== "élève" ? `**${prenom}**` : "toi";

  const evaluation = await evaluerConsolidationAvecIA(
    user,
    question,
    reponseEleve,
    historique
  );

  const questionAReposer = evaluation.question_a_reposer || question;
  const explication = evaluation.explication || "L’idée n’est pas encore suffisamment correcte.";
  const attendue = evaluation.reponse_attendue
    ? `\n\nÀ retenir : **${evaluation.reponse_attendue}**`
    : "";

  if (evaluation.statut === "correct") {
    return `✅ Consolidation validée.

Très bien ${appel} 😊
Ta réponse est juste. Elle peut être courte ou formulée avec tes propres mots : l’essentiel, c’est que l’idée soit correcte.

Nous pouvons maintenant passer à autre chose ou continuer le même sujet.

Quelle matière veux-tu travailler maintenant ?`;
  }

  if (evaluation.statut === "partiel") {
    return `C’est partiellement juste ${appel} 😊

Tu as compris une partie de l’idée, et c’est déjà un bon progrès.

${explication}${attendue}

Reprenons calmement la même question :

👉 ${questionAReposer}`;
  }

  if (evaluation.statut === "hors_sujet") {
    return `Pas encore ${appel} 😊

Ta réponse ne répond pas encore au fond de la question.

${explication}${attendue}

Reprenons calmement :

👉 ${questionAReposer}`;
  }

  return `Pas encore exactement ${appel} 😊

Tu as fait l’effort de répondre, et c’est déjà bien. Mais ici, l’idée n’est pas encore correcte.

${explication}${attendue}

Reprenons calmement :

👉 ${questionAReposer}`;
}

function estDemandeContinuerMemeSujet(texte = "") {
  const t = normaliserSocial(texte);

  return (
    t.includes("meme sujet") ||
    t.includes("même sujet") ||
    t.includes("continuer avec le meme") ||
    t.includes("continuer avec le même") ||
    t.includes("on continue") ||
    t.includes("continuons") ||
    t.includes("nous pouvons continuer") ||
    t.includes("poursuivons") ||
    t.includes("allons plus loin") ||
    t.includes("explique encore") ||
    t.includes("continue l explication") ||
    t.includes("continue l'explication") ||
    t.includes("reprends le sujet") ||
    t.includes("on peut continuer")
  );
}

function nettoyerSujetPedagogique(sujet = "") {
  return String(sujet || "")
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deduireSujetDepuisQuestion(question = "") {
  let q = String(question || "").trim();

  q = q
    .replace(/^avec tes propres mots,\s*/i, "")
    .replace(/^peux-tu\s+/i, "")
    .replace(/^peux tu\s+/i, "")
    .replace(/^m['’]?expliquer\s+/i, "")
    .replace(/^me dire\s+/i, "")
    .replace(/^explique\s+/i, "")
    .replace(/^donne\s+/i, "")
    .replace(/^cite\s+/i, "")
    .trim();

  const difference = q.match(/diff[eé]rence\s+entre\s+(.+?)\s+et\s+(.+?)\s*\?/i);
  if (difference?.[1] && difference?.[2]) {
    return nettoyerSujetPedagogique(`${difference[1]} et ${difference[2]}`);
  }

  const transformation = q.match(/ce qui se passe quand\s+(.+?)\s*\?/i);
  if (transformation?.[1]) {
    return nettoyerSujetPedagogique(transformation[1]);
  }

  const questCeQue = q.match(/qu['’]?est[-\s]?ce\s+qu['’]?(?:une|un|la|le|les)?\s*(.+?)\s*\?/i);
  if (questCeQue?.[1]) {
    return nettoyerSujetPedagogique(questCeQue[1]);
  }

  q = q
    .replace(/^(la|le|les|un|une)\s+/i, "")
    .replace(/\?$/g, "")
    .trim();

  if (q.length > 90) {
    q = q.slice(0, 90).trim();
  }

  return nettoyerSujetPedagogique(q);
}

function retrouverDernierSujetPedagogique(historique = []) {
  const messages = [...historique].reverse();

  for (const msg of messages) {
    if (msg?.role !== "assistant") continue;

    const contenu = String(msg?.content || "");

    if (estRappelConsolidationAssistant(contenu)) continue;
    if (estPauseAccordeeAssistant(contenu)) continue;
    if (estConfirmationPauseAccordeeAssistant(contenu)) continue;
    if (estRepriseConsolidationAssistant(contenu)) continue;

    const question = extraireQuestionConsolidationDepuisTexte(contenu);

    if (question) {
      const sujet = deduireSujetDepuisQuestion(question);

      if (sujet) return sujet;
    }
  }

  for (const msg of messages) {
    const contenu = String(msg?.content || "");

    if (msg?.role === "user" && estQuestionUtilisateur(contenu)) {
      const sujet = deduireSujetDepuisQuestion(contenu);
      if (sujet) return sujet;
    }

    if (msg?.role === "assistant") {
      const match = contenu.match(/Nous allons travailler\s+\*{1,2}([^*]+)\*{1,2}/i);
      if (match?.[1]) return nettoyerSujetPedagogique(match[1]);
    }
  }

  return "";
}

function construireQuestionContinuationSujet(sujet = "") {
  const s = nettoyerSujetPedagogique(sujet);

  return `Continue l'explication pédagogique sur : ${s}. Ajoute un exemple simple, puis pose une seule question de consolidation claire à l'élève.`;
}

function construireQuestionMatiereChoisie(texteUtilisateur = "") {
  return `L'élève vient de choisir cette matière, ce domaine ou ce thème : ${texteUtilisateur}

MISSION PÉDAGOGIQUE :
- Ne propose pas une liste préfabriquée venant d'un menu enregistré.
- Ne dépends pas d'une liste codée dans le programme.
- Agis comme un vrai enseignant capable d'organiser lui-même son cours.
- Analyse la matière choisie selon sa logique scolaire correcte.
- Distingue clairement : matière, branche, domaine, objet d'étude et notion.
- Si la matière contient plusieurs domaines, présente-les avec précision sans confondre les branches avec les objets étudiés.
- Choisis ensuite une entrée simple, adaptée au niveau de l'élève.
- Commence directement l'enseignement.
- Termine par une seule vraie question de consolidation liée à ce que tu viens d'enseigner.`;
}

async function traiterTexte(user, texteUtilisateur, historique = []) {
  const texteSocial = nettoyerNomBot(texteUtilisateur);
  const textePourSocial = texteSocial || texteUtilisateur;

  const prenomActuel = premierPrenom(user?.nom || "");
  const classeActuelle = String(user?.classe || "").trim();

  let questionPedagogique = texteUtilisateur;
  let prefixeContinuation = "";

  if (!user?.nom || !prenomActuel || prenomActuel === "élève") {
    return {
      reponse: `Bonsoir 😊 Avant de commencer, quel est ton prénom ?`,
      fiche: null,
      bypassFormat: true
    };
  }

  if (classeEstInvalide(classeActuelle)) {
    return {
      reponse: `Merci **${prenomActuel}** 😊 Maintenant, dis-moi ta classe pour que je t'aide selon ton niveau.`,
      fiche: null,
      bypassFormat: true
    };
  }

  const consolidation = detecterConsolidationEnAttente(historique, user);

  if (consolidation?.question) {
    if (
      dernierMessageAssistantEstPauseAccordee(historique) &&
      estAccuseReceptionSimple(textePourSocial)
    ) {
      return {
        reponse: construireConfirmationPauseAccordee(user, historique),
        fiche: null,
        bypassFormat: true
      };
    }

    if (
      consolidation.depuisPause &&
      (
        estMessageRepriseApresPause(textePourSocial) ||
        estDemandeRepriseQuestionPendante(textePourSocial)
      )
    ) {
      return {
        reponse: construireRepriseApresPauseAvecConsolidation(
          user,
          consolidation.question
        ),
        fiche: null,
        bypassFormat: true
      };
    }

    if (estMessageFatigueOuPause(textePourSocial)) {
      return {
        reponse: construireReponsePauseAvecConsolidation(
          user,
          consolidation.question,
          textePourSocial
        ),
        fiche: null,
        bypassFormat: true
      };
    }

    if (estAccuseReceptionSimple(textePourSocial)) {
      return {
        reponse: construireRappelConsolidation(user, consolidation.question),
        fiche: null,
        bypassFormat: true
      };
    }

    if (
      estDemandeRepriseQuestionPendante(textePourSocial) ||
      estMessageRetourTravail(textePourSocial)
    ) {
      return {
        reponse: construireRepriseApresPauseAvecConsolidation(
          user,
          consolidation.question
        ),
        fiche: null,
        bypassFormat: true
      };
    }

    if (
      estMessageRemerciement(textePourSocial) ||
      estMessageSalutation(textePourSocial) ||
      estMessageCourtHumain(textePourSocial) ||
      estNouvelleDemandePendantConsolidation(textePourSocial)
    ) {
      return {
        reponse: construireRappelConsolidation(user, consolidation.question),
        fiche: null,
        bypassFormat: true
      };
    }

    if (estTentativeReponseConsolidation(textePourSocial)) {
      const feedback = await construireFeedbackConsolidation(
        user,
        consolidation.question,
        textePourSocial,
        historique
      );

      return {
        reponse: feedback,
        fiche: null,
        bypassFormat: true
      };
    }

    return {
      reponse: construireRappelConsolidation(user, consolidation.question),
      fiche: null,
      bypassFormat: true
    };
  }

  if (
    dernierMessageAssistantEstPauseAccordee(historique) &&
    estAccuseReceptionSimple(textePourSocial)
  ) {
    return {
      reponse: construireConfirmationPauseAccordee(user, historique),
      fiche: null,
      bypassFormat: true
    };
  }

  if (estDemandeContinuerMemeSujet(textePourSocial)) {
    const dernierSujet = retrouverDernierSujetPedagogique(historique);

    if (dernierSujet) {
      questionPedagogique = construireQuestionContinuationSujet(dernierSujet);

      prefixeContinuation = `Très bien **${prenomActuel}** 😊
Nous continuons avec le même sujet : **${dernierSujet}**.

`;
    } else {
      return {
        reponse: `D'accord **${prenomActuel}** 😊 Nous pouvons continuer, mais rappelle-moi simplement le sujet que tu veux reprendre.`,
        fiche: null,
        bypassFormat: true
      };
    }
  }

  if (
    !prefixeContinuation &&
    estIntentionApprendreSansObjet(textePourSocial)
  ) {
    return {
      reponse: `Très bien **${prenomActuel}** 😊

Dis-moi simplement la matière, la leçon ou la notion que tu veux commencer, et je t’enseigne directement.`,
      fiche: null,
      bypassFormat: true
    };
  }

  if (
    !prefixeContinuation &&
    estChoixMatiere(texteUtilisateur)
  ) {
    questionPedagogique = construireQuestionMatiereChoisie(texteUtilisateur);
  }

  if (!prefixeContinuation && estSecondTourSalutation(historique, textePourSocial)) {
    const reponse = genererRepriseApresBienEtre(user, historique);

    return {
      reponse,
      fiche: null,
      bypassFormat: true
    };
  }

  if (
    !prefixeContinuation &&
    (
      estMessagePurementSocial(texteUtilisateur) ||
      estMessagePurementSocial(textePourSocial)
    )
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

  if (!prefixeContinuation && estMessageVagueSansObjet(textePourSocial)) {
    const relances = [
      `Je suis là pour t'aider **${prenomActuel}** 😊 Donne-moi simplement la matière ou la notion que tu veux apprendre.`,
      `Très bien **${prenomActuel}**. Écris seulement le nom de la leçon ou du thème, et je commence l’explication.`,
      `D'accord **${prenomActuel}** 😊 Quelle notion veux-tu travailler maintenant ?`
    ];

    return {
      reponse: pick(relances),
      fiche: null,
      bypassFormat: true
    };
  }

  if (
    !prefixeContinuation &&
    estMessageCourtThemeProbable(textePourSocial) &&
    !estMatiereLargeProbable(textePourSocial)
  ) {
    questionPedagogique = `Enseigne directement cette notion ou ce sous-thème choisi par l'élève : ${texteUtilisateur}`;
  }

  const cacheKey = makeLocalCacheKey(user, questionPedagogique);
  const cached = getLocalCache(cacheKey);

  if (cached) {
    logInfo("cache_hit", {
      phone: user?.phone || "",
      cacheKey
    });

    const reponseCachee = prefixeContinuation
      ? `${prefixeContinuation}${cached}`
      : cached;

    return {
      reponse: reponseCachee,
      fiche: null,
      bypassFormat: false
    };
  }

  let analyse = {
    intention: "question_normale",
    matiere: detecterMatiereScientifique(questionPedagogique, "", null),
    besoinCorrectionRenforcee: false,
    sujet: extraireSujetMemoire(questionPedagogique) || "general"
  };

  const texteMin = String(questionPedagogique || "").toLowerCase();

  const besoinAnalyseIA =
    estSoumissionReponse(questionPedagogique) ||
    estQuestionTechnique(questionPedagogique) ||
    contientMatiereScientifiqueRenforcee(questionPedagogique) ||
    estIntentionApprendre(questionPedagogique) ||
    estMessageCourtThemeProbable(questionPedagogique) ||
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
    analyse = await detecterIntentionIA(user, questionPedagogique, historique);
  }

  const fiche = await consulterBibliotheque(questionPedagogique, user.classe || "");
  const consigneBase = construireConsignePedagogique(questionPedagogique, "text");
  const antiBoucle = await construireConsigneAntiBoucle(
    user,
    questionPedagogique,
    historique
  );

  let consigneFinale = consigneBase;

  if (analyse.intention === "juridique") {
    consigneFinale += `\nLe message semble juridique. Si c'est un article, recopie-le exactement seulement s'il est fiable.`;
  }

  if (
    analyse.intention === "geographie_rdc" ||
    estQuestionGeographieRDC(questionPedagogique, fiche)
  ) {
    consigneFinale += `\nLe message concerne probablement une subdivision administrative. Si une liste complète est demandée, donne la liste complète trouvée.`;
  }

  if (contientMatiereScientifiqueRenforcee(questionPedagogique)) {
    consigneFinale += `\nLe message concerne une matière scientifique. Réponds avec rigueur, simplement, selon le niveau de l'élève.`;
  }

  if (prefixeContinuation) {
    consigneFinale += `\nL'élève veut continuer le même sujet. Ne dis pas que tu as oublié. Continue directement l'explication du sujet indiqué.`;
  }

  consigneFinale += `\nSi le message de l'élève exprime une intention d'apprendre, de commencer, de travailler ou de choisir une notion, commence directement l'enseignement de cette notion. Ne demande pas à l'élève d'utiliser une formule précise.`;
  consigneFinale += `\nSi l'élève choisit une matière large, organise toi-même cette matière avec intelligence pédagogique. Ne fais pas appel à une liste préfabriquée.`;
  consigneFinale += `\nDistingue toujours matière, branche, domaine, objet d'étude et notion. Ne confonds pas un objet étudié avec une branche scientifique.`;
  consigneFinale += `\nLa consolidation, la citation finale et l'ouverture finale doivent rester dans la matière principale de la question.`;
  consigneFinale += `\nÀ la fin de l'explication, pose toujours une seule vraie question de consolidation claire. Utilise le format exact : ❓ [CONSOLIDATION]. L'élève devra y répondre avant de passer à autre chose.`;

  if (antiBoucle.consigne) {
    consigneFinale += `\n${antiBoucle.consigne}`;
  }

  const reponseIA = await construireReponseDbWebIa(
    user,
    questionPedagogique,
    historique,
    fiche,
    consigneFinale
  );

  if (reponseIA && String(reponseIA).trim()) {
    setLocalCache(cacheKey, reponseIA);
  }

  if (!reponseIA || !String(reponseIA).trim()) {
    await logUnansweredQuestion(
      user,
      questionPedagogique,
      "text",
      "traiterTexte_empty"
    );
  }

  if (!estSoumissionReponse(questionPedagogique)) {
    await resetStudentAttempt(
      user.phone,
      antiBoucle.sujet || analyse.sujet || "general"
    );
  }

  return {
    reponse: prefixeContinuation ? `${prefixeContinuation}${reponseIA}` : reponseIA,
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
  contientMatiereScientifiqueRenforcee,
  extraireQuestionConsolidationDepuisTexte,
  detecterConsolidationEnAttente,
  construireRappelConsolidation,
  construireReponsePauseAvecConsolidation,
  construireConfirmationPauseAccordee,
  construireRepriseApresPauseAvecConsolidation,
  construireFeedbackConsolidation,
  evaluerConsolidationAvecIA,
  estAccuseReceptionSimple,
  estIntentionApprendre,
  estQuestionUtilisateur,
  estNouvelleDemandePendantConsolidation,
  estDemandeContinuerMemeSujet,
  retrouverDernierSujetPedagogique,
  deduireSujetDepuisQuestion
};
