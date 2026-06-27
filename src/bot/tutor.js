
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
  estQuestionGeographieRDC,
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

async function chercherContexteWeb(question = "", user = {}, historique = []) {
  const system = construireSystemPrompt(user);

  const reponse = await safeAI(
    () => appelerChatCompletion([
      { role: "system", content: system },
      {
        role: "system",
        content: `MISSION WEB :
- Utilise Google Search
- Donne un CONTEXTE WEB BRUT, court, clair et factuel
- Si la question concerne une province, une commune, une ville, un territoire ou une subdivision administrative, donne la liste complète trouvée
- Pour une liste administrative, n'omets aucun élément trouvé
- Si tu n'es pas sûr que la liste soit exhaustive, dis exactement : "Liste à confirmer"
- Pas de structure VÉCU/SAVOIR/INSPIRATION/CONSOLIDATION
- Pas de citation finale
- Pas d'encouragement`
      },
      ...historique.slice(-4),
      {
        role: "user",
        content: `QUESTION :
${question}
Donne un contexte web brut, précis et exhaustif si la question demande une liste.`
      }
    ]),
    ""
  );

  return String(reponse || "").trim();
}

async function detecterIntentionIA(user, texte = "", historique = []) {
  const system = `${construireSystemPrompt(user)}
MODE CLASSIFICATION STRICTE :
- Réponds uniquement en JSON valide
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
      prompt: `Analyse ce message et classe-le.

MESSAGE :
${texte}`,
      schema: JSON_SCHEMA_INTENTION,
      history: historique.slice(-3)
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
  const analyse = await detecterIntentionIA(user, texteUtilisateur, historique);
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
    contexteWeb = await chercherContexteWeb(questionEleve, user, historique);
  }

  const blocWeb = contexteWeb
    ? `CONTEXTE WEB (SOURCE PRINCIPALE) :
${contexteWeb}`
    : `CONTEXTE WEB :
Aucune information web utile trouvée.`;

  const blocDB = fiche
    ? `CONTEXTE DB (SECONDAIRE) :
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
- Utilise d'abord le WEB si disponible
- Utilise la DB comme appui
- Ne réponds jamais comme un moteur de recherche
- Si la question demande une liste administrative complète, recopie la liste complète trouvée
- Si tu n'es pas sûr d'une liste complète, dis-le honnêtement
- N'invente jamais un territoire, une commune, une ville ou un article
- La matière de la CONSOLIDATION doit être strictement la même que celle de la question principale
- La citation finale doit être strictement liée à la même matière
- L'ouverture finale doit être strictement liée à la même matière
- Interdiction de mélanger histoire, géographie, droit, sciences, mathématiques ou français dans la même consolidation`
      },
      {
        role: "system",
        content: consignePedagogique || "Sois pédagogique et clair."
      },
      ...historique.slice(-5),
      {
        role: "user",
        content: `QUESTION :
${questionEleve}
${blocWeb}
${blocDB}
Donne maintenant la réponse finale de Mwalimu.`
      }
    ]),
    `🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Je n'ai pas encore pu produire une réponse claire.
🔴 [INSPIRATION] : Ce n'est pas un problème ; nous pouvons reprendre plus simplement.
❓ [CONSOLIDATION] : Reformule ta question en une seule phrase.`
  );
}

module.exports = {
  construireConsignePedagogique,
  chercherContexteWeb,
  detecterIntentionIA,
  construireConsigneAntiBoucle,
  construireReponseDbWebIa
};
