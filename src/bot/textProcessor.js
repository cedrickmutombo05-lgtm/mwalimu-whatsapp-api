

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
    t.includes("for a student") ||
    t.includes("bonjour dora,")
  );
}

function estQuestionConsolidationValide(texte = "") {
  const q = String(texte || "").trim();

  if (!q) return false;
  if (estPhraseInterneIA(q)) return false;
  if (q.length < 10 || q.length > 280) return false;

  return (
    q.includes("?") ||
    /^explique/i.test(q) ||
    /^dis/i.test(q) ||
    /^peux-tu/i.test(q) ||
    /^donne/i.test(q)
  );
}

function nettoyerLigneConsolidation(ligne = "") {
  return String(ligne || "")
    .replace(/^[-•👉\s*]+/, "")
    .replace(/^\*\*/, "")
    .replace(/\*\*$/, "")
    .trim();
}

function extraireDerniereQuestionDepuisBlocConsolidation(bloc = "") {
  const lignes = String(bloc || "")
    .split("\n")
    .map(nettoyerLigneConsolidation)
    .filter(Boolean)
    .filter((l) => !estPhraseInterneIA(l))
    .filter((l) => !/^\*\*\*«/.test(l))
    .filter((l) => !/^🌟|^⭐/.test(l))
    .filter((l) => !/^mot d'encouragement/i.test(l));

  const ligneQuestion = lignes.find((l) => estQuestionConsolidationValide(l));

  if (ligneQuestion) {
    return ligneQuestion;
  }

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

  if (positions.length === 0) {
    return "";
  }

  const dernierePosition = positions[positions.length - 1];

  let bloc = contenu.slice(dernierePosition.end);

  bloc = bloc
    .split(/\n(?=\*\*\*«|🌟|⭐|🔴|🟡|🔵|Mot d'encouragement|tool_code|thought|Voici un plan|Here|🔶|✅)/i)[0]
    .trim();

  return extraireDerniereQuestionDepuisBlocConsolidation(bloc);
}

function detecterConsolidationEnAttente(historique = []) {
  const messages = [...historique].reverse();

  for (const msg of messages) {
    if (msg?.role !== "assistant") continue;

    const contenu = String(msg?.content || "");

    if (
      /consolidation validée/i.test(contenu) ||
      /tu as compris l’essentiel/i.test(contenu) ||
      /tu as compris l'essentiel/i.test(contenu) ||
      /nous pouvons maintenant passer/i.test(contenu)
    ) {
      return null;
    }

    if (!/\[CONSOLIDATION\]/i.test(contenu)) {
      continue;
    }

    const question = extraireQuestionConsolidationDepuisTexte(contenu);

    if (question) {
      return {
        question,
        source: contenu
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

  return (
    /^(je veux|je voudrais|j aimerais|je souhaite|explique|donne moi|parle moi|on fait|on peut faire)/.test(t) ||
    /qu est ce que|c est quoi|pourquoi|comment|quels sont|quelle est|quel est|qui est|ou est|où est|quel pays|quelle ville|quel territoire/.test(t)
  );
}

function estTentativeReponseConsolidation(texte = "") {
  const t = normaliserSocial(texte);

  if (!t) return false;
  if (estQuestionUtilisateur(texte)) return false;
  if (estChoixMatiere(texte)) return false;
  if (estMessageRemerciement(texte)) return false;
  if (estMessageSalutation(texte)) return false;
  if (estMessageCourtHumain(texte)) return false;
  if (estMessageRetourTravail(texte)) return false;
  if (estNouvelleDemandePendantConsolidation(texte)) return false;

  // Réponse courte acceptée comme tentative : "Acide.", "Basique.", "Le noyau."
  return t.split(/\s+/).filter(Boolean).length >= 1;
}

function contientMot(texte = "", mots = []) {
  const t = normaliserSocial(texte);

  return mots.some((mot) => t.includes(normaliserSocial(mot)));
}

function affirmationAcideOuBasique(reponse = "") {
  const r = normaliserSocial(reponse);

  const ditAcide =
    r.includes("acide") &&
    !/pas acide|non acide|n est pas acide|nest pas acide/.test(r);

  const ditBasique =
    r.includes("basique") &&
    !/pas basique|non basique|n est pas basique|nest pas basique/.test(r);

  return {
    ditAcide,
    ditBasique
  };
}

function evaluerCasSpecifiqueConsolidation(question = "", reponse = "") {
  const q = normaliserSocial(question);
  const r = normaliserSocial(reponse);
  const qRaw = String(question || "").toLowerCase();

  // 1. Acide / basique selon H+ et OH-
  const parleIonsAcideBase =
    (
      q.includes("h") ||
      qRaw.includes("h+")
    ) &&
    (
      q.includes("oh") ||
      qRaw.includes("oh-")
    ) &&
    q.includes("acide") &&
    q.includes("basique");

  if (parleIonsAcideBase) {
    const beaucoupH =
      /beaucoup[^.!?]*(h\s*\+)/i.test(qRaw) ||
      q.includes("beaucoup d ions h") ||
      q.includes("beaucoup ions h");

    const beaucoupOH =
      /beaucoup[^.!?]*(oh\s*-)/i.test(qRaw) ||
      q.includes("beaucoup d ions oh") ||
      q.includes("beaucoup ions oh");

    const { ditAcide, ditBasique } = affirmationAcideOuBasique(reponse);

    if (beaucoupH) {
      if (ditAcide && !ditBasique) {
        return {
          traite: true,
          ok: true,
          correction: ""
        };
      }

      if (ditBasique && !ditAcide) {
        return {
          traite: true,
          ok: false,
          correction:
            "Ici, une solution qui contient beaucoup d’ions H+ et très peu d’ions OH- est **acide**, et non basique."
        };
      }

      return {
        traite: true,
        ok: false,
        correction:
          "Ici, il faut retenir ceci : beaucoup d’ions H+ indique une solution **acide**."
      };
    }

    if (beaucoupOH) {
      if (ditBasique && !ditAcide) {
        return {
          traite: true,
          ok: true,
          correction: ""
        };
      }

      if (ditAcide && !ditBasique) {
        return {
          traite: true,
          ok: false,
          correction:
            "Ici, une solution qui contient beaucoup d’ions OH- est **basique**, et non acide."
        };
      }

      return {
        traite: true,
        ok: false,
        correction:
          "Ici, il faut retenir ceci : beaucoup d’ions OH- indique une solution **basique**."
      };
    }
  }

  // 2. Différence procaryote / eucaryote
  if (
    q.includes("procaryote") &&
    q.includes("eucaryote") &&
    (q.includes("difference") || q.includes("différence"))
  ) {
    const parleNoyau = r.includes("noyau");
    const parleProc = r.includes("procaryote");
    const parleEuc = r.includes("eucaryote");

    const ideeCorrecte =
      parleNoyau &&
      (
        r.includes("sans noyau") ||
        r.includes("pas de noyau") ||
        r.includes("n a pas de noyau") ||
        r.includes("na pas de noyau") ||
        r.includes("n ont pas de noyau") ||
        r.includes("non") ||
        r.includes("absence")
      ) &&
      parleEuc;

    if (ideeCorrecte || (parleNoyau && parleProc && parleEuc)) {
      return {
        traite: true,
        ok: true,
        correction: ""
      };
    }

    return {
      traite: true,
      ok: false,
      correction:
        "La différence essentielle est que la cellule eucaryote possède un noyau, tandis que la cellule procaryote n’a pas de vrai noyau."
    };
  }

  // 3. Réaction chimique / changement physique
  if (
    q.includes("reaction chimique") &&
    q.includes("changement physique")
  ) {
    const ideeReaction =
      r.includes("nouveau produit") ||
      r.includes("nouveaux produits") ||
      r.includes("nouvelle substance") ||
      r.includes("nouvelles substances") ||
      r.includes("transformation des reactifs") ||
      r.includes("réactifs se transforment") ||
      r.includes("reactifs se transforment");

    const ideePhysique =
      r.includes("pas de nouvelle substance") ||
      r.includes("ne cree pas") ||
      r.includes("ne crée pas") ||
      r.includes("forme change") ||
      r.includes("etat change") ||
      r.includes("état change");

    if (ideeReaction || ideePhysique) {
      return {
        traite: true,
        ok: true,
        correction: ""
      };
    }

    return {
      traite: true,
      ok: false,
      correction:
        "La réaction chimique forme de nouvelles substances, tandis qu’un changement physique change surtout l’état ou la forme sans créer une nouvelle substance."
    };
  }

  // 4. Réactifs vers produits
  if (
    q.includes("reactifs") &&
    q.includes("produits")
  ) {
    if (
      r.includes("produit") ||
      r.includes("produits") ||
      r.includes("nouvelle substance") ||
      r.includes("nouvelles substances") ||
      r.includes("transforment") ||
      r.includes("transformation")
    ) {
      return {
        traite: true,
        ok: true,
        correction: ""
      };
    }

    return {
      traite: true,
      ok: false,
      correction:
        "Quand des réactifs se transforment, ils donnent de nouveaux produits : c’est le signe d’une réaction chimique."
    };
  }

  // 5. Définition simple de la cellule
  if (
    q.includes("cellule") &&
    (
      q.includes("qu est ce") ||
      q.includes("definition") ||
      q.includes("définition") ||
      q.includes("explique")
    )
  ) {
    const ideeCellule =
      r.includes("cellule") ||
      (
        (r.includes("unite") || r.includes("unité") || r.includes("base")) &&
        (r.includes("vivant") || r.includes("vie") || r.includes("etre vivant") || r.includes("être vivant"))
      );

    if (ideeCellule) {
      return {
        traite: true,
        ok: true,
        correction: ""
      };
    }

    return {
      traite: true,
      ok: false,
      correction:
        "Une cellule est la plus petite unité de base du vivant."
    };
  }

  return {
    traite: false,
    ok: false,
    correction: ""
  };
}

function evaluerReponseConsolidation(question = "", reponse = "") {
  const t = normaliserSocial(reponse);

  if (!t) {
    return {
      ok: false,
      raison: "vide",
      correction: ""
    };
  }

  if (
    /je ne sais pas|j ai oublie|j'ai oublié|aucune idee|aucune idée|je n ai pas compris|je n'ai pas compris/.test(t)
  ) {
    return {
      ok: false,
      raison: "aveu_incomprehension",
      correction:
        "Ce n’est pas grave. On va reprendre doucement l’idée avant de continuer."
    };
  }

  const specifique = evaluerCasSpecifiqueConsolidation(question, reponse);

  if (specifique.traite) {
    return {
      ok: specifique.ok,
      raison: specifique.ok ? "bonne_reponse_specifique" : "erreur_specifique",
      correction: specifique.correction || ""
    };
  }

  const mots = t.split(/\s+/).filter((m) => m.length > 2);

  if (mots.length === 0) {
    return {
      ok: false,
      raison: "trop_vague",
      correction: ""
    };
  }

  const questionNorm = normaliserSocial(question);

  const motsQuestion = questionNorm
    .split(/\s+/)
    .filter((m) => m.length >= 5)
    .filter((m) => ![
      "explique",
      "donne",
      "avec",
      "mots",
      "quelle",
      "quelles",
      "quels",
      "pourquoi",
      "comment",
      "consolidation",
      "principale",
      "difference",
      "différence",
      "peux",
      "dire"
    ].includes(m));

  const score = motsQuestion.filter((mot) => t.includes(mot)).length;

  // Réponse courte mais pertinente : acceptée.
  if (score >= 1 && mots.length >= 1) {
    return {
      ok: true,
      raison: "courte_mais_pertinente",
      correction: ""
    };
  }

  // Réponse longue mais hors sujet : refusée.
  if (motsQuestion.length >= 2 && score === 0) {
    return {
      ok: false,
      raison: "hors_sujet_possible",
      correction:
        "Ta réponse semble s’éloigner de la question posée. Revenons à la question précise."
    };
  }

  // Si la réponse est compréhensible et non hors sujet évident, on accepte avec souplesse.
  if (mots.length >= 3) {
    return {
      ok: true,
      raison: "suffisant",
      correction: ""
    };
  }

  return {
    ok: false,
    raison: "trop_vague",
    correction:
      "Ta réponse est encore un peu trop vague. Essaie de donner l’idée principale en quelques mots simples."
  };
}

function construireRappelConsolidation(user = {}, question = "") {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom && prenom !== "élève" ? `**${prenom}**` : "toi";

  return `Doucement ${appel} 😊

Avant de passer à autre chose, répondons d'abord à la petite question de consolidation.

C'est important pour vérifier que tu as vraiment compris. Je te le demande comme un grand frère qui veut te voir progresser avec sérénité.

👉 ${question}`;
}

function construireReponsePauseAvecConsolidation(user = {}, question = "") {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom && prenom !== "élève" ? `**${prenom}**` : "toi";

  return `Je comprends ${appel} 😊 Repose-toi un peu.

Quand tu seras prêt, on reprendra calmement, mais on commencera d'abord par répondre à la petite question de consolidation restée en attente :

👉 ${question}`;
}

function construireFeedbackConsolidation(user = {}, question = "", reponseEleve = "") {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom && prenom !== "élève" ? `**${prenom}**` : "toi";

  const evaluation = evaluerReponseConsolidation(question, reponseEleve);

  if (evaluation.ok) {
    return `✅ Consolidation validée.

Très bien ${appel} 😊
Ta réponse est juste. Elle peut être courte ou longue : l'essentiel, c'est que l'idée soit correcte.

Nous pouvons maintenant passer à autre chose ou continuer le même sujet.

Quelle matière veux-tu travailler maintenant ?`;
  }

  const correction = evaluation.correction
    ? `\n\n${evaluation.correction}`
    : "";

  return `Pas encore exactement ${appel} 😊

Tu as fait l'effort de répondre, et c'est déjà bien. Mais ici, l'idée n'est pas encore correcte.${correction}

Reprenons calmement :

👉 ${question}`;
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

  const consolidation = detecterConsolidationEnAttente(historique);

  if (consolidation?.question) {
    if (estMessageFatigueOuPause(textePourSocial)) {
      return {
        reponse: construireReponsePauseAvecConsolidation(user, consolidation.question),
        fiche: null,
        bypassFormat: true
      };
    }

    if (
      estMessageRemerciement(textePourSocial) ||
      estMessageSalutation(textePourSocial) ||
      estMessageRetourTravail(textePourSocial) ||
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
      return {
        reponse: construireFeedbackConsolidation(
          user,
          consolidation.question,
          textePourSocial
        ),
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
    (estChoixMatiere(texteUtilisateur) || estChoixMatiere(textePourSocial))
  ) {
    const reponse =
      construireReponseChoixMatiere(user, texteUtilisateur) ||
      construireReponseChoixMatiere(user, textePourSocial);

    return {
      reponse,
      fiche: null,
      bypassFormat: true
    };
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

  const conversationDemarree = historique.some((m) =>
    m.role === "user" && estQuestionAcademique(m.content || "")
  );

  const questionScientifiqueRenforcee =
    contientMatiereScientifiqueRenforcee(questionPedagogique);

  if (
    !prefixeContinuation &&
    !conversationDemarree &&
    !estQuestionAcademique(questionPedagogique) &&
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
    consigneFinale += `\nLe message concerne une matière scientifique comme chimie, physique, électricité ou mécanique. Réponds avec rigueur, simplement, selon le niveau de l'élève.`;
  }

  if (prefixeContinuation) {
    consigneFinale += `\nL'élève veut continuer le même sujet. Ne dis pas que tu as oublié. Continue directement l'explication du sujet indiqué.`;
  }

  consigneFinale += `\nLa consolidation, la citation finale et l'ouverture finale doivent rester dans la matière principale de la question.`;
  consigneFinale += `\nÀ la fin de l'explication, pose toujours une seule question de consolidation claire. L'élève devra y répondre avant de passer à autre chose.`;

  if (antiBoucle.consigne) {
    consigneFinale += `\n${antiBoucle.consigne}`;
  }

  let reponse = await construireReponseDbWebIa(
    user,
    questionPedagogique,
    historique,
    fiche,
    consigneFinale
  );

  if (reponse && String(reponse).trim()) {
    reponse = prefixeContinuation ? `${prefixeContinuation}${reponse}` : reponse;
    setLocalCache(cacheKey, reponse);
  }

  if (!reponse || !String(reponse).trim()) {
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
  contientMatiereScientifiqueRenforcee,
  extraireQuestionConsolidationDepuisTexte,
  detecterConsolidationEnAttente,
  construireRappelConsolidation,
  construireFeedbackConsolidation,
  evaluerReponseConsolidation,
  estQuestionUtilisateur,
  estNouvelleDemandePendantConsolidation,
  estDemandeContinuerMemeSujet,
  retrouverDernierSujetPedagogique,
  deduireSujetDepuisQuestion
};
