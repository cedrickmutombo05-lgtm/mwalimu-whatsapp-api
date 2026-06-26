

// =========================================================
// IA – GEMINI, PROMPTS, CLASSIFICATION, AUDIO, IMAGE
// =========================================================

const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GEMINI_API_KEY } = require("./config");

const {
  HEADER_MWALIMU,
  SEPARATOR,
  SYSTEM_BASE,
  JSON_SCHEMA_INTENTION,
  JSON_SCHEMA_AUDIO,
  CITATIONS,
  OUVERTURES,
  MATIERE_MATH,
  MATIERE_PHYSIQUE,
  MATIERE_CHIMIE,
  MATIERE_GENERAL
} = require("./constants");

const {
  logError,
  tronquerTexte,
  pick,
  attendre,
  normaliserTexteRelationnel,
  premierPrenom,
  supprimerDoublonsLignes,
  simplifierNotationMath
} = require("./utils");

const { estMessagePurementSocial } = require("./social");

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// =========================================================
// HELPERS GEMINI
// =========================================================

function estErreurQuotaGemini(err) {
  const msg = String(err?.message || "").toLowerCase();
  const data = String(err?.response?.data ? JSON.stringify(err.response.data) : "").toLowerCase();
  return msg.includes("429") || msg.includes("quota") || data.includes("429") || data.includes("quota");
}

async function attendreAvecBackoff(tentative = 0) {
  await attendre(1200 + tentative * 1200);
}

async function genererAvecRetry(model, payload, maxRetries = 2) {
  let lastError = null;

  for (let tentative = 0; tentative <= maxRetries; tentative++) {
    try {
      await attendreAvecBackoff(tentative);
      return await model.generateContent(payload);
    } catch (e) {
      lastError = e;

      logError("gemini_retry", e, {
        tentative: tentative + 1,
        message: e?.message,
        data: e?.response?.data || null
      });

      if (estErreurQuotaGemini(e) && tentative < maxRetries) {
        await attendre(4000 + tentative * 3000);
        continue;
      }

      throw e;
    }
  }

  throw lastError;
}

async function safeAI(generateFn, fallbackMessage) {
  try {
    const res = await generateFn();
    if (!res || !String(res).trim()) throw new Error("Réponse vide");
    return res;
  } catch (e) {
    logError("safe_ai", e);
    return fallbackMessage;
  }
}

function extraireJsonGemini(brut = "") {
  const txt = String(brut || "").trim();
  if (!txt) return null;

  try {
    return JSON.parse(txt);
  } catch {}

  const clean = txt
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {}

  const match = clean.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  return null;
}

function toGeminiContents(messages = []) {
  return messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }]
    }));
}

// =========================================================
// PROMPT SYSTÈME
// =========================================================

function construireSystemPrompt(user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  const appel = pick([prenom, `**${prenom}**`]);

  const classe = user?.classe
    ? `Classe de l'élève : ${user.classe}`
    : "Classe non précisée";

  const reve = user?.reve
    ? `Rêve de l'élève : ${user.reve}`
    : "Rêve non précisé";

  return `${SYSTEM_BASE}

PERSONNALISATION :
- Adresse l'élève naturellement : ${appel}
- ${classe}
- ${reve}
- Ne répète jamais le header Mwalimu.
- Ne génère jamais la citation finale.
- Ne génère jamais l'ouverture finale.
- Ne génère jamais le mot d'encouragement final.

RÈGLE PÉDAGOGIQUE FONDAMENTALE :
- Mwalimu guide l'élève, il ne fait pas le devoir à sa place.
- Pour un exercice, donne la méthode, un indice ou un exemple similaire.
- Ne donne la réponse finale que si elle est nécessaire pour expliquer ou corriger.

COHÉRENCE :
- La consolidation doit rester dans la même matière que la question.
- Ne mélange pas droit, géographie, histoire, sciences, maths et français.
- Réponds comme un vrai précepteur, pas comme un moteur de recherche.

GÉOGRAPHIE RDC :
- Pour les provinces, territoires, communes, villes, secteurs et chefferies de la RDC, sois très précis.
- Ne confonds jamais chef-lieu, ville, province et territoire.
- Si l'élève demande les territoires d'une province, donne les territoires, pas seulement le chef-lieu.
`;
}

// =========================================================
// DÉTECTION ACADÉMIQUE
// =========================================================

function estSoumissionReponse(texte = "") {
  const t = String(texte || "").toLowerCase().trim();

  const indices = [
    "ma réponse", "ma reponse", "j'ai trouvé", "jai trouvé",
    "voici ma réponse", "voici ma reponse", "mon résultat", "mon resultat",
    "j'obtiens", "j'ai obtenu", "le résultat est", "le resultat est",
    "ça donne", "ca donne"
  ];

  if (indices.some((i) => t.includes(i))) return true;
  if (/^[0-9xXyYzZ\s=+\-÷/*().,]+$/.test(t) && t.length <= 80) return true;

  return false;
}

function estQuestionTechnique(texte = "") {
  const t = String(texte || "").toLowerCase();

  return [
    "calcule", "calculer", "résous", "resous", "équation", "equation",
    "fraction", "physique", "chimie", "exercice", "problème", "probleme",
    "géométrie", "geometrie", "puissance", "racine", "math", "maths", "formule"
  ].some((m) => t.includes(m));
}

function estQuestionAcademique(texte = "") {
  const t = normaliserTexteRelationnel(texte);

  if (!t || t.length < 4) return false;
  if (estMessagePurementSocial(t)) return false;

  return [
    "explique", "c est quoi", "qu est ce que", "comment", "pourquoi",
    "quand", "ou", "qui", "combien", "quelle", "quel", "quels", "quelles",
    "math", "maths", "equation", "calcul", "physique", "chimie",
    "histoire", "geographie", "francais", "grammaire", "conjugaison",
    "droit", "loi", "article", "constitution", "province", "territoire",
    "commune", "ville", "secteur", "chefferie", "exercice", "probleme",
    "aide", "comprendre", "apprendre", "cours", "lecon", "chapitre",
    "matiere", "examen", "revision", "peux tu", "dis moi", "je voudrais",
    "explique moi"
  ].some((mot) => t.includes(mot));
}

function extraireSujetMemoire(texte = "") {
  const t = normaliserTexteRelationnel(texte);

  if (!t || estMessagePurementSocial(t)) return "";

  const sujets = [
    "math", "mathematiques", "equation", "fraction", "histoire",
    "geographie", "francais", "grammaire", "droit", "loi", "article",
    "rdc", "congo", "province", "territoire", "commune", "ville",
    "secteur", "chefferie", "physique", "chimie"
  ];

  for (const s of sujets) {
    if (t.includes(s)) return s;
  }

  return t.split(" ").slice(0, 4).join(" ");
}

function detecterMatierePrincipale(question = "", corps = "") {
  const q = normaliserTexteRelationnel(question);
  const c = normaliserTexteRelationnel(corps);
  const base = `${q} ${c}`;

  const scores = {
    droit: 0,
    geographie: 0,
    histoire: 0,
    math: 0,
    physique: 0,
    chimie: 0,
    francais: 0,
    general: 0
  };

  const add = (theme, mots, poids = 1) => {
    for (const mot of mots) {
      if (base.includes(mot)) scores[theme] += poids;
    }
  };

  add("droit", ["droit", "loi", "code", "article", "juridique", "tribunal", "ohada", "constitution"], 4);
  add("geographie", ["geographie", "province", "territoire", "commune", "ville", "secteur", "chefferie", "rdc", "congo"], 5);
  add("histoire", ["histoire", "passe", "colonisation", "independance", "royaume", "date historique"], 4);
  add("math", ["math", "maths", "equation", "fraction", "calcul", "racine", "puissance", "geometrie"], 4);
  add("physique", ["physique", "force", "vitesse", "energie", "masse", "pression", "mouvement"], 4);
  add("chimie", ["chimie", "molecule", "atome", "acide", "base", "solution", "reaction"], 4);
  add("francais", ["francais", "grammaire", "orthographe", "conjugaison", "verbe", "phrase"], 4);

  let best = "general";
  let score = 0;

  for (const [k, v] of Object.entries(scores)) {
    if (v > score) {
      best = k;
      score = v;
    }
  }

  return score > 0 ? best : "general";
}

function detecterMatiereScientifique(question = "", reponse = "", fiche = null) {
  const base = [
    question,
    reponse,
    fiche?.matiere || "",
    fiche?.titre || "",
    fiche?.contenu || ""
  ].join(" ").toLowerCase();

  const score = {
    math: 0,
    physique: 0,
    chimie: 0
  };

  ["math", "maths", "équation", "equation", "fraction", "racine", "calcul"].forEach((m) => {
    if (base.includes(m)) score.math += 2;
  });

  ["physique", "force", "vitesse", "énergie", "energie", "masse", "distance", "temps"].forEach((m) => {
    if (base.includes(m)) score.physique += 2;
  });

  ["chimie", "mol", "solution", "acide", "base", "h2o", "co2", "o2", "nacl"].forEach((m) => {
    if (base.includes(m)) score.chimie += 2;
  });

  const max = Math.max(score.math, score.physique, score.chimie);

  if (max <= 0) return MATIERE_GENERAL;
  if (score.chimie === max) return MATIERE_CHIMIE;
  if (score.physique === max) return MATIERE_PHYSIQUE;

  return MATIERE_MATH;
}

// =========================================================
// WEB / DB
// =========================================================

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

  return [
    "rdc", "congo", "province", "provinces", "territoire", "territoires",
    "commune", "communes", "ville", "villes", "secteur", "secteurs",
    "chefferie", "chefferies", "haut-katanga", "haut katanga",
    "kasaï", "kasai", "géographie", "geographie"
  ].some((m) => t.includes(m));
}

function questionDemandeListeAdministrative(question = "") {
  const t = String(question || "").toLowerCase();

  return (
    t.includes("quels sont les territoires") ||
    t.includes("quelles sont les communes") ||
    t.includes("liste des territoires") ||
    t.includes("liste des communes") ||
    t.includes("territoires de") ||
    t.includes("communes de") ||
    t.includes("secteurs de") ||
    t.includes("chefferies de")
  );
}

function fautChercherSurWeb(question = "", fiche = null) {
  const q = String(question || "").toLowerCase().trim();

  if (!q) return false;
  if (estMessagePurementSocial(q)) return false;

  if (estQuestionGeographieRDC(question, fiche)) return true;
  if (questionDemandeListeAdministrative(question)) return true;

  if (fiche && !ficheEstFaible(fiche)) {
    return false;
  }

  return [
    "loi", "code", "article", "constitution", "juridique", "droit",
    "ohada", "impôt", "impot", "taxe", "tribunal",
    "actualité", "actualite", "récent", "recent", "actuel",
    "histoire", "date", "indépendance", "independance",
    "qui", "quand", "où", "ou", "combien"
  ].some((m) => q.includes(m));
}

// =========================================================
// APPELS IA
// =========================================================

async function appelerChatCompletion(messages) {
  const systemMessages = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = toGeminiContents(messages);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemMessages,
    tools: [{ googleSearch: {} }]
  });

  const result = await genererAvecRetry(model, {
    contents,
    generationConfig: { temperature: 0.1 }
  });

  return result.response.text();
}

async function appelerJsonStrict({
  systemInstruction = "",
  prompt = "",
  schema = null,
  history = [],
  inlineParts = []
}) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction
  });

  const result = await genererAvecRetry(model, {
    contents: [
      ...toGeminiContents(history),
      {
        role: "user",
        parts: [
          { text: prompt },
          ...inlineParts
        ]
      }
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      ...(schema ? { responseSchema: schema } : {})
    }
  });

  return extraireJsonGemini(result.response.text());
}

async function chercherContexteWeb(question = "", user = {}, historique = []) {
  return await safeAI(
    () => appelerChatCompletion([
      { role: "system", content: construireSystemPrompt(user) },
      {
        role: "system",
        content: `
MISSION WEB :
- Utilise obligatoirement Google Search.
- Pour les provinces, territoires, communes, villes, secteurs et chefferies de la RDC, le WEB est la SOURCE PRINCIPALE.
- Si la question demande les territoires d'une province, donne uniquement la liste complète des territoires trouvés.
- Ne donne jamais seulement le chef-lieu si l'élève demande les territoires.
- Ne confonds jamais chef-lieu, province, ville, territoire, commune, secteur et chefferie.
- Si une liste administrative est demandée, donne la liste complète trouvée.
- Si la liste n'est pas certaine, écris exactement : Liste à confirmer.
- Pas de structure VÉCU/SAVOIR/INSPIRATION/CONSOLIDATION.
- Pas de citation finale.
`
      },
      ...historique.slice(-4),
      { role: "user", content: `QUESTION :\n${question}` }
    ]),
    ""
  );
}

async function detecterIntentionIA(user, texte = "", historique = []) {
  const fallback = {
    intention: "question_normale",
    matiere: detecterMatiereScientifique(texte),
    sujet: extraireSujetMemoire(texte) || "general",
    besoinCorrectionRenforcee: false
  };

  try {
    const parsed = await appelerJsonStrict({
      systemInstruction: `${construireSystemPrompt(user)}
MODE CLASSIFICATION :
Réponds uniquement en JSON.
intentions possibles : salutation, remerciement, question_normale, exercice, soumission_reponse, audio, image, juridique, geographie_rdc.`,
      prompt: `Classe ce message :\n${texte}`,
      schema: JSON_SCHEMA_INTENTION,
      history: historique.slice(-3)
    });

    if (!parsed || typeof parsed !== "object") return fallback;

    return {
      intention: String(parsed.intention || fallback.intention),
      matiere: String(parsed.matiere || fallback.matiere),
      sujet: String(parsed.sujet || fallback.sujet),
      besoinCorrectionRenforcee: Boolean(parsed.besoinCorrectionRenforcee)
    };
  } catch (e) {
    logError("detecter_intention_ia", e);
    return fallback;
  }
}

// =========================================================
// CONSIGNES
// =========================================================

function construireConsignePedagogique(texte = "", type = "text") {
  if (type === "audio") {
    return `MODE AUDIO :
- Si c'est social, réponse courte naturelle.
- Sinon, commence par dire que tu as bien reçu l'audio.
- Réponds avec chaleur et pédagogie.`;
  }

  if (type === "image") {
    return `MODE IMAGE :
- Dis que tu as reçu l'image.
- Recopie ce qui est visible.
- Si c'est flou, dis-le.
- Explique sans faire tout à la place de l'élève.`;
  }

  if (estSoumissionReponse(texte)) {
    return `MODE CORRECTION :
- L'élève soumet sa réponse.
- Corrige avec douceur.
- Ne dis bravo que si c'est réellement juste.`;
  }

  if (estQuestionTechnique(texte)) {
    return `MODE EXERCICE :
- Méthode d'abord.
- Guidage pas à pas.
- Ne donne pas toute la réponse finale d'un coup.`;
  }

  return "MODE NORMAL : réponds naturellement, clairement et brièvement.";
}

async function construireConsigneAntiBoucle(user, texteUtilisateur = "", historique = [], saveAttemptFn) {
  const sujet = extraireSujetMemoire(texteUtilisateur) || "general";

  if (!estSoumissionReponse(texteUtilisateur)) {
    return { sujet, tentative: 0, consigne: "" };
  }

  const tentative = await saveAttemptFn(user.phone, sujet, texteUtilisateur, texteUtilisateur);

  if (tentative < 3) {
    return {
      sujet,
      tentative,
      consigne: "L'élève propose une réponse. Corrige avec douceur, sans donner toute la solution d'un coup."
    };
  }

  return {
    sujet,
    tentative,
    consigne: "L'élève s'est probablement trompé plusieurs fois. Découpe davantage et donne un indice plus fort."
  };
}

// =========================================================
// MESSAGE FINAL
// =========================================================

function construireQuestionConsolidation(question = "", corps = "") {
  const matiere = detecterMatierePrincipale(question, corps);
  const sujet = extraireSujetMemoire(question) || "cette notion";

  const modeles = {
    droit: `❓ [CONSOLIDATION] : Explique avec tes mots l'idée juridique principale de ${sujet}.`,
    geographie: `❓ [CONSOLIDATION] : Cite un élément important que tu retiens sur ${sujet}.`,
    histoire: `❓ [CONSOLIDATION] : Quelle idée importante retiens-tu de ${sujet} ?`,
    math: `❓ [CONSOLIDATION] : Reprends la méthode en une phrase, puis essaie une étape.`,
    physique: `❓ [CONSOLIDATION] : Quelle unité ou formule principale dois-tu retenir ici ?`,
    chimie: `❓ [CONSOLIDATION] : Quelle erreur faut-il éviter dans cette notion ?`,
    francais: `❓ [CONSOLIDATION] : Donne un autre exemple avec tes propres mots.`,
    general: `❓ [CONSOLIDATION] : Résume l'idée principale avec tes mots.`
  };

  return modeles[matiere] || modeles.general;
}

function verifierStructureMwalimu(corps = "", user = {}, question = "") {
  let t = String(corps || "").trim();

  const aVecu = /🔵\s*VÉCU/i.test(t);
  const aSavoir = /🟡\s*SAVOIR/i.test(t);
  const aInspiration = /🔴\s*INSPIRATION/i.test(t);
  const aConsolidation = /❓\s*CONSOLIDATION/i.test(t);

  if (aVecu && aSavoir && aInspiration && aConsolidation) return t;

  const prenom = premierPrenom(user?.nom || "");

  const vecu = aVecu
    ? ""
    : pick([
      `🔵 [VÉCU] : D'accord ${prenom}, regardons cela calmement.`,
      `🔵 [VÉCU] : Très bien ${prenom}, allons à l'essentiel.`,
      `🔵 [VÉCU] : Je t'accompagne ${prenom}, prenons cela pas à pas.`
    ]);

  const savoir = aSavoir ? "" : "🟡 [SAVOIR] : Voici l'idée essentielle à retenir.";
  const inspiration = aInspiration ? "" : "🔴 [INSPIRATION] : Une notion bien comprise te rend plus solide.";
  const consolidation = aConsolidation ? "" : construireQuestionConsolidation(question, t);

  const blocs = [];
  if (!aVecu) blocs.push(vecu);
  blocs.push(t);
  if (!aSavoir) blocs.push(savoir);
  if (!aInspiration) blocs.push(inspiration);
  if (!aConsolidation) blocs.push(consolidation);

  return blocs.filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function blocEstPertinent(bloc = "") {
  return String(bloc || "").includes("?") && String(bloc || "").length > 20;
}

function remplacerBlocConsolidation(corps = "", question = "") {
  const regex = /❓\s*CONSOLIDATION[\s\S]*?(?=\n👉|\n🌟|\n\*\*\*«|$)/i;
  const found = String(corps || "").match(regex)?.[0] || "";

  if (found && blocEstPertinent(found)) return corps;

  const bloc = construireQuestionConsolidation(question, corps);

  if (found) return corps.replace(regex, bloc).trim();

  return `${corps}\n\n${bloc}`.trim();
}

function nettoyerReponseIA(texte = "") {
  let t = String(texte || "");

  t = t.replace(/🔴🟡🔵\s*\*?Mwalimu EdTech\s*:\s*Ton Mentor pour l'Excellence\*?\s*🇨🇩/gi, "");
  t = t.replace(/^🌟\s*Mot d['’]encouragement\s*:.*$/gim, "");
  t = t.replace(/^👉\s*Je reste disponible.*$/gim, "");
  t = t.replace(/^👉\s*Continue à me parler.*$/gim, "");
  t = t.replace(/\bfuture avocate\b/gi, "future professionnelle");
  t = t.replace(/\bfutur avocat\b/gi, "futur professionnel");
  t = t.replace(/\bmon élève\b/gi, "élève");

  return supprimerDoublonsLignes(t);
}

function choisirCitationFinale(question = "", corps = "") {
  const matiere = detecterMatierePrincipale(question, corps);

  if (matiere === "droit") return pick(CITATIONS.civisme);
  if (matiere === "geographie") return pick(CITATIONS.geographie);
  if (matiere === "histoire") return pick(CITATIONS.histoire);
  if (matiere === "math") return pick(CITATIONS.mathematiques);
  if (matiere === "physique" || matiere === "chimie") return pick(CITATIONS.sciences);
  if (matiere === "francais") return pick(CITATIONS.francais);

  return pick(CITATIONS.general);
}

function choisirOuverture(question = "", corps = "") {
  const matiere = detecterMatierePrincipale(question, corps);

  if (OUVERTURES && OUVERTURES[matiere]) return pick(OUVERTURES[matiere]);

  return OUVERTURES?.general
    ? pick(OUVERTURES.general)
    : "👉 Nous pouvons continuer avec une autre petite question.";
}

function choisirEncouragement(question = "", corps = "") {
  const q = String(question || "").toLowerCase();
  const c = String(corps || "").toLowerCase();

  if (estMessagePurementSocial(question)) return "";

  if (
    c.includes("je n'arrive pas") ||
    c.includes("souci technique") ||
    c.includes("réessaie") ||
    c.includes("reessaie")
  ) {
    return "🌟 Mot d'encouragement : Ne te décourage pas ; nous pouvons reprendre calmement.";
  }

  if (
    estSoumissionReponse(q) &&
    (c.includes("bonne réponse") || c.includes("correct") || c.includes("juste") || c.includes("exact"))
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

    const unique =
      normalisee.startsWith("👉 ") ||
      normalisee.startsWith("🌟 mot d'encouragement") ||
      normalisee.startsWith("***«") ||
      normalisee === "────────────────";

    if (unique) {
      if (uniques.has(normalisee)) continue;
      uniques.add(normalisee);
    }

    resultat.push(ligne);
  }

  return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function construireMessageFinal(user, reponseBrute, historique = [], question = "", fiche = null) {
  let corps = nettoyerReponseIA(reponseBrute);

  corps = simplifierNotationMath(corps);
  corps = verifierStructureMwalimu(corps, user, question);
  corps = remplacerBlocConsolidation(corps, question);

  corps = corps.replace(/^\s*\*\*\*«[^»]+»\*\*\*\s*$/gm, "");
  corps = corps.replace(/^🌟\s*Mot d['’]encouragement\s*:.*$/gim, "");
  corps = corps.replace(/^👉\s*Je reste disponible.*$/gim, "");
  corps = corps.replace(/\n{3,}/g, "\n\n").trim();

  const citation = choisirCitationFinale(question, corps);
  const ouverture = choisirOuverture(question, corps);
  const encouragement = choisirEncouragement(question, corps);

  return dedupeBlocFinal([
    HEADER_MWALIMU,
    SEPARATOR,
    corps,
    citation,
    ouverture,
    encouragement
  ].filter(Boolean).join("\n"));
}

// =========================================================
// AUDIO / IMAGE
// =========================================================

async function analyserAudioCourt(user, audioBuffer, mimeType, historique = []) {
  try {
    const parsed = await appelerJsonStrict({
      systemInstruction: `${construireSystemPrompt(user)}
Analyse l'audio et réponds uniquement en JSON.
type possible : social, pedagogique, incompris.`,
      prompt: "Analyse cet audio.",
      schema: JSON_SCHEMA_AUDIO,
      history: historique.slice(-2),
      inlineParts: [
        {
          inlineData: {
            mimeType,
            data: audioBuffer.toString("base64")
          }
        }
      ]
    });

    if (!parsed || typeof parsed !== "object") {
      return { transcription: "", type: "incompris" };
    }

    return {
      transcription: String(parsed.transcription || "").trim(),
      type: String(parsed.type || "incompris").toLowerCase().trim()
    };
  } catch (e) {
    logError("analyser_audio_court", e);
    return { transcription: "", type: "incompris" };
  }
}

async function reponseAudioUneSeulePasse(user, audioBuffer, mimeType, historique = []) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${construireSystemPrompt(user)}
MODE AUDIO :
- Si c'est social, réponds en une phrase naturelle.
- Sinon, commence par : "J'ai bien reçu ton audio."
- Sois pédagogique, bref et clair.
- Ne génère pas header, citation, ouverture ou encouragement final.`,
    tools: [{ googleSearch: {} }]
  });

  const formattedHistory = historique.slice(-4).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }]
  }));

  return await safeAI(async () => {
    const r = await genererAvecRetry(model, {
      contents: [
        ...formattedHistory,
        {
          role: "user",
          parts: [
            { text: construireConsignePedagogique("", "audio") },
            {
              inlineData: {
                mimeType,
                data: audioBuffer.toString("base64")
              }
            }
          ]
        }
      ],
      generationConfig: { temperature: 0.2 }
    });

    return r.response.text();
  }, "");
}

async function expliquerImageAvecIA(user, base64Image, mimeType, historique = []) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: `${construireSystemPrompt(user)}
MODE IMAGE :
- Commence par : "J'ai bien reçu ton image."
- Recopie ce qui est visible.
- Si c'est flou, dis-le.
- Explique brièvement.
- Ne génère pas header, citation, ouverture ou encouragement final.`,
    tools: [{ googleSearch: {} }]
  });

  const contents = [
    ...historique.slice(-4).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }]
    })),
    {
      role: "user",
      parts: [
        { text: "Analyse cette image et aide l'élève." },
        {
          inlineData: {
            mimeType,
            data: base64Image
          }
        }
      ]
    }
  ];

  return await safeAI(async () => {
    const r = await genererAvecRetry(model, {
      contents,
      generationConfig: { temperature: 0.2 }
    });

    return r.response.text();
  }, "");
}

// =========================================================
// RÉPONSE DB + WEB + IA
// =========================================================

async function construireReponseDbWebIa(user, questionEleve, historique = [], fiche = null, consignePedagogique = "") {
  let contexteWeb = "";

  if (fautChercherSurWeb(questionEleve, fiche)) {
    contexteWeb = await chercherContexteWeb(questionEleve, user, historique);
  }

  const blocWeb = contexteWeb
    ? `CONTEXTE WEB — SOURCE PRINCIPALE :
${contexteWeb}`
    : "CONTEXTE WEB : Aucun contexte web utile.";

  const blocDB = fiche
    ? `CONTEXTE DB — SOURCE SECONDAIRE :
Titre : ${fiche.titre || ""}
Matière : ${fiche.matiere || ""}
Classe : ${fiche.classe || ""}
Contenu :
${tronquerTexte(fiche.contenu || "", 3000)}
Commentaire :
${tronquerTexte(fiche.commentaire_ai || "", 1200)}`
    : "CONTEXTE DB : Aucune fiche locale.";

  return await safeAI(
    () => appelerChatCompletion([
      { role: "system", content: construireSystemPrompt(user) },
      {
        role: "system",
        content: `
RÈGLE FONDAMENTALE :
- Pour les questions administratives RDC, utilise le WEB comme source principale.
- La DB est seulement un appui secondaire.
- Si le WEB donne une liste et la DB donne seulement un chef-lieu, réponds avec la liste WEB.
- Ne confonds jamais chef-lieu, ville, province, territoire, commune, secteur et chefferie.
- Si l'élève demande les territoires d'une province, donne d'abord la liste des territoires.
- Si l'information n'est pas certaine, écris clairement : Liste à confirmer.
- Réponds comme un précepteur, pas comme un moteur de recherche.
- La consolidation reste dans la même matière.
`
      },
      { role: "system", content: consignePedagogique },
      ...historique.slice(-5),
      {
        role: "user",
        content: `QUESTION :
${questionEleve}

${blocWeb}

${blocDB}

Donne la réponse finale pédagogique de Mwalimu.`
      }
    ]),
    `🔵 [VÉCU] : J'ai bien reçu ta demande.
🟡 [SAVOIR] : Je n'ai pas encore pu produire une réponse claire.
🔴 [INSPIRATION] : Ce n'est pas un problème ; nous pouvons reprendre plus simplement.
❓ [CONSOLIDATION] : Reformule ta question en une seule phrase.`
  );
}

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  genAI,
  estErreurQuotaGemini,
  genererAvecRetry,
  safeAI,
  extraireJsonGemini,
  toGeminiContents,
  construireSystemPrompt,
  estSoumissionReponse,
  estQuestionTechnique,
  estQuestionAcademique,
  extraireSujetMemoire,
  detecterMatierePrincipale,
  detecterMatiereScientifique,
  ficheEstFaible,
  estQuestionGeographieRDC,
  questionDemandeListeAdministrative,
  fautChercherSurWeb,
  appelerChatCompletion,
  appelerJsonStrict,
  chercherContexteWeb,
  detecterIntentionIA,
  construireConsignePedagogique,
  construireConsigneAntiBoucle,
  construireQuestionConsolidation,
  verifierStructureMwalimu,
  blocEstPertinent,
  remplacerBlocConsolidation,
  nettoyerReponseIA,
  choisirCitationFinale,
  choisirOuverture,
  choisirEncouragement,
  dedupeBlocFinal,
  construireMessageFinal,
  analyserAudioCourt,
  reponseAudioUneSeulePasse,
  expliquerImageAvecIA,
  construireReponseDbWebIa
};
