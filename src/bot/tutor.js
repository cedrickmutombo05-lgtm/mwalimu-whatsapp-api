

const { logError } = require("../core/logger");

const {
  appelerChatCompletion,
  appelerJsonStrict,
  construireSystemPrompt,
  safeAI
} = require("../services/geminiService");

const {
  saveStudentAttempt
} = require("../db");

const {
  JSON_SCHEMA_INTENTION
} = require("../constants/schemas");

const {
  estSoumissionReponse,
  estQuestionTechnique,
  extraireSujetMemoire,
  detecterMatiereScientifique,
  fautChercherSurWeb
} = require("./detectors");

function construireConsignePedagogique(texte = "", type = "text") {
  const t = String(texte || "");

  if (type === "image") {
    return `MODE IMAGE :
- Commence par dire que tu as bien reçu l'image
- Recopie d'abord ce qui est visible
- Si une partie est floue, dis-le honnêtement
- Explique la démarche
- Ne résous pas tout à la place de l'élève
- Sois bref et clair`;
  }

  if (type === "audio") {
    return `MODE AUDIO :
- Si c'est un simple remerciement, une simple salutation ou un court message social, réponds en une phrase courte naturelle sans structure
- Sinon, commence par dire que tu as bien reçu l'audio
- Réponds avec chaleur et pédagogie
- Sois bref et clair`;
  }

  if (estSoumissionReponse(t)) {
    return `MODE CORRECTION :
- L'élève soumet probablement sa réponse
- Corrige avec douceur
- N'écris pas "bravo" sauf si la réponse est réellement correcte
- Sois bref et clair`;
  }

  if (estQuestionTechnique(t)) {
    return `MODE EXERCICE :
- Explique la méthode
- Montre le démarrage utile
- Ne donne pas toute la réponse finale d'un coup
- Sois bref et clair`;
  }

  return `MODE NORMAL :
- Réponds naturellement
- Sois humain, utile et succinct`;
}

async function chercherContexteWeb(question = "", user = {}) {
  const system = construireSystemPrompt(user);

  const reponse = await safeAI(
    () => appelerChatCompletion([
      { role: "system", content: system },
      {
        role: "system",
        content: `MISSION WEB :
- Utilise Google Search
- Réponds uniquement à la QUESTION ACTUELLE
- Ignore toute ancienne conversation
- Donne un CONTEXTE WEB BRUT, court, clair et factuel
- Si la question concerne une province, une commune, une ville, un territoire ou une subdivision administrative, donne la liste complète trouvée
- Pour une liste administrative, n'omets aucun élément trouvé
- Si tu n'es pas sûr que la liste soit exhaustive, dis exactement : "Liste à confirmer"
- Pas de structure VÉCU/SAVOIR/INSPIRATION/CONSOLIDATION
- Pas de citation finale
- Pas d'encouragement`
      },
      {
        role: "user",
        content: `QUESTION ACTUELLE UNIQUEMENT :
${question}

Donne un contexte web brut, précis et exhaustif si la question demande une liste.`
      }
    ]),
    ""
  );

  return String(reponse || "").trim();
}

async function detecterIntentionIA(user, texte = "") {
  const system = `${construireSystemPrompt(user)}
MODE CLASSIFICATION STRICTE :
- Réponds uniquement en JSON valide
- Analyse seulement le MESSAGE ACTUEL
- Ignore les anciennes questions
- intention possible : salutation, remerciement, question_normale, exercice, soumission_reponse, audio, image, juridique, geographie_rdc
- matiere possible : math, physique, chimie, general
- besoinCorrectionRenforcee doit être true ou false
- sujet doit être court`;

  const fallback = {
    intention: "question_normale",
    matiere: detecterMatiereScientifique(texte, "", null),
    besoinCorrectionRenforcee: false,
    sujet: extraireSujetMemoire(texte) || "general"
  };

  try {
    const parsed = await appelerJsonStrict({
      systemInstruction: system,
      prompt: `Analyse uniquement ce message et classe-le.

MESSAGE ACTUEL :
${texte}`,
      schema: JSON_SCHEMA_INTENTION,
      history: []
    });

    if (!parsed || typeof parsed !== "object") return fallback;

    return {
      intention: String(parsed.intention || fallback.intention),
      matiere: String(parsed.matiere || fallback.matiere),
      besoinCorrectionRenforcee: Boolean(parsed.besoinCorrectionRenforcee),
      sujet: String(parsed.sujet || fallback.sujet)
    };
  } catch (e) {
    logError("detecter_intention_ia", e);
    return fallback;
  }
}

async function construireConsigneAntiBoucle(user, texteUtilisateur = "", historique = []) {
  const analyse = await detecterIntentionIA(user, texteUtilisateur);
  const sujet = analyse.sujet || extraireSujetMemoire(texteUtilisateur) || "general";

  if (analyse.intention !== "soumission_reponse" && !estSoumissionReponse(texteUtilisateur)) {
    return {
      sujet,
      tentative: 0,
      consigne: ""
    };
  }

  const tentative = await saveStudentAttempt(
    user.phone,
    sujet,
    texteUtilisateur,
    texteUtilisateur
  );

  if (tentative < 3) {
    return {
      sujet,
      tentative,
      consigne: "L'élève a proposé une réponse. Corrige avec douceur sans donner tout de suite la solution complète."
    };
  }

  return {
    sujet,
    tentative,
    consigne: "L'élève s'est probablement trompé plusieurs fois. Simplifie davantage, découpe en très petites étapes et donne un indice plus fort."
  };
}

async function construireReponseDbWebIa(
  user,
  questionEleve,
  historique = [],
  fiche = null,
  consignePedagogique = ""
) {
  let contexteWeb = "";

  const utiliserWeb = fautChercherSurWeb(questionEleve, fiche);

  if (utiliserWeb) {
    contexteWeb = await chercherContexteWeb(questionEleve, user);
  }

  const blocWeb = contexteWeb
    ? `CONTEXTE WEB POUR LA QUESTION ACTUELLE :
${contexteWeb}`
    : `CONTEXTE WEB :
Aucune information web utile trouvée.`;

  const blocDB = fiche
    ? `CONTEXTE DB POUR LA QUESTION ACTUELLE :
Titre : ${fiche?.titre || "Sans titre"}
Matière : ${fiche?.matiere || "Non précisée"}
Classe : ${fiche?.classe || "Non précisée"}
Contenu :
${fiche?.contenu || ""}
Commentaire IA :
${fiche?.commentaire_ai || ""}`
    : `CONTEXTE DB :
Aucune fiche locale disponible.`;

  return await safeAI(
    () => appelerChatCompletion([
      { role: "system", content: construireSystemPrompt(user) },
      {
        role: "system",
        content: `RÈGLE FONDAMENTALE :
- Réponds uniquement à la QUESTION ACTUELLE
- Ignore totalement les anciennes questions de l'élève
- Ne mélange jamais deux sujets différents
- Si la question actuelle parle de droit, reste en droit
- Si la question actuelle parle de géographie, reste en géographie
- Si la question actuelle parle d'image, analyse seulement l'image
- Utilise d'abord le WEB si disponible
- Utilise la DB comme appui
- Ne réponds jamais comme un moteur de recherche
- Si la question demande une liste administrative complète, recopie la liste complète trouvée
- Si tu n'es pas sûr d'une liste complète, dis-le honnêtement
- N'invente jamais un territoire, une commune, une ville ou un article
- La CONSOLIDATION doit porter uniquement sur la question actuelle
- La citation finale doit être liée à la matière actuelle
- L'ouverture finale doit être liée à la matière actuelle`
      },
      {
        role: "system",
        content: consignePedagogique || "Sois pédagogique et clair."
      },
      {
        role: "user",
        content: `QUESTION ACTUELLE :
${questionEleve}

${blocWeb}

${blocDB}

Donne maintenant la réponse finale de Mwalimu uniquement sur cette question.`
      }
    ]),
    `🔵 [VÉCU]
J'ai bien reçu ta demande.

🟡 [SAVOIR]
Je n'ai pas encore pu produire une réponse claire.

🔴 [INSPIRATION]
Ce n'est pas un problème ; nous pouvons reprendre plus simplement.

❓ [CONSOLIDATION]
Reformule ta question en une seule phrase.`
  );
}

module.exports = {
  construireConsignePedagogique,
  chercherContexteWeb,
  detecterIntentionIA,
  construireConsigneAntiBoucle,
  construireReponseDbWebIa
};
