
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const app = express();
app.set("trust proxy", 1);

/* =========================================================
   1) CONFIG & GARDE-FOUS
========================================================= */

function requireEnv(name) {
    if (!process.env[name] || !String(process.env[name]).trim()) {
        throw new Error(`Variable d'environnement manquante : ${name}`);
    }
    return process.env[name];
}

const PORT = process.env.PORT || 10000;
const OPENAI_API_KEY = requireEnv("OPENAI_API_KEY");
const DATABASE_URL = requireEnv("DATABASE_URL");
const TOKEN = requireEnv("TOKEN");
const PHONE_NUMBER_ID = requireEnv("PHONE_NUMBER_ID");
const VERIFY_TOKEN = requireEnv("VERIFY_TOKEN");
const APP_SECRET = requireEnv("APP_SECRET");

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests"
});

app.use("/webhook", webhookLimiter);

/* =========================================================
   2) CONSTANTES MWALIMU
========================================================= */

const HEADER_MWALIMU = "🔴🟡🔵 **Mwalimu EdTech : Ton Mentor pour l'Excellence** 🇨🇩";

const CITATIONS = {
    patriotisme: [
        "***« Aimer sa patrie, c’est la servir avec intelligence, honnêteté et discipline. »***",
        "***« Un bon élève d’aujourd’hui peut devenir un grand bâtisseur du Congo de demain. »***",
        "***« Le vrai savoir ne sert pas seulement à réussir sa vie, mais aussi à relever sa nation. »***",
        "***« Le Congo a besoin d’enfants instruits, responsables et fiers de leur pays. »***",
        "***« Aimer le Congo, c’est apprendre, travailler avec droiture et contribuer au bien commun. »***",
        "***« Payer l’impôt et la taxe avec honnêteté, c’est aussi participer au développement de la nation. »***"
    ],
    geographie: [
        "***« Connaître les pays et les peuples aide à mieux comprendre le monde et à mieux servir sa patrie. »***",
        "***« La géographie apprend à situer le monde, mais aussi à mieux situer son devoir envers la nation. »***"
    ],
    mathematiques: [
        "***« La rigueur dans le calcul forme aussi la rigueur dans la vie et dans le service du pays. »***",
        "***« Un esprit qui raisonne bien peut mieux construire l’avenir de sa nation. »***"
    ],
    histoire: [
        "***« Comprendre l’histoire aide à aimer sa patrie avec plus de conscience et de responsabilité. »***",
        "***« Un peuple qui connaît son histoire se prépare mieux à bâtir son avenir. »***"
    ],
    francais: [
        "***« Bien parler et bien écrire, c’est aussi mieux servir sa communauté et sa patrie. »***",
        "***« La maîtrise des mots donne de la force à la pensée et de la dignité au citoyen. »***"
    ],
    sciences: [
        "***« La science bien apprise peut aider à résoudre les vrais problèmes du pays. »***",
        "***« Étudier les sciences, c’est se préparer à être utile à sa nation. »***"
    ],
    civisme: [
        "***« Respecter la loi, la taxe et l’impôt, c’est participer avec dignité à la vie de la nation. »***",
        "***« Le civisme commence par de petits actes honnêtes qui fortifient la patrie. »***"
    ],
    relationnel: [
        "***« La politesse, le respect et l’amour du prochain élèvent aussi la nation. »***",
        "***« Un cœur reconnaissant et discipliné honore sa famille, son école et sa patrie. »***"
    ],
    general: [
        "***« Apprendre avec sérieux aujourd’hui, c’est mieux servir le Congo demain. »***",
        "***« Le savoir, la discipline et l’amour du pays font grandir la nation. »***"
    ]
};

const OUVERTURES = [
    "👉 Continue à me parler librement, je suis là pour t'aider.",
    "👉 Nous avançons ensemble, pas à pas.",
    "👉 Tu peux m'envoyer ta réponse, et je vais la vérifier avec toi.",
    "👉 Garde confiance, nous allons comprendre cela ensemble."
];

const ACCUEILS = [
    "Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.",
    "Mbote ! Je suis Mwalimu EdTech, heureux de t'accompagner dans tes études.",
    "Mbote ! Je suis Mwalimu EdTech, ton précepteur numérique bienveillant."
];

const MOTS_ENCOURAGEMENT = [
    "🌟 Mot d'encouragement : Continue avec calme et confiance ; comprendre pas à pas est déjà une vraie victoire.",
    "🌟 Mot d'encouragement : Tu avances bien quand tu prends le temps de réfléchir sérieusement.",
    "🌟 Mot d'encouragement : Ne te décourage pas ; chaque bonne question t’aide à grandir.",
    "🌟 Mot d'encouragement : Avec de la patience et de l’attention, tu peux aller très loin."
];

const REGLE_FORMAT_MATH = `
FORMAT OBLIGATOIRE D'ÉCRITURE MATHÉMATIQUE (WhatsApp) :
- Utilise des écritures simples, propres et lisibles sur WhatsApp
- Puissance → x², x³, a², b² (jamais x^2, a^2)
- Multiplication → × (jamais *)
- Division → ÷ ou / selon ce qui est le plus clair
- Parenthèses → ( ) uniquement
- Évite { } et [ ] sauf nécessité absolue
- Pas de LaTeX : jamais \\frac, \\sqrt, ^{}, \\left, \\right
- Pour une racine, écris : √9 ou racine carrée de 9
- Pour une fraction simple, écris : 3/4
- Pour une équation, garde une présentation aérée et propre
`;

const REGLE_CALCUL_INTELLIGENT = `
RÈGLES SPÉCIALES POUR LES CALCULS ET EXERCICES DE MATHÉMATIQUES :
- Tu dois être extrêmement rigoureux dans les calculs
- Tu vérifies chaque étape avant de l'écrire
- Tu avances ligne par ligne, sans sauter d'étape importante
- Tu expliques la logique avant le résultat
- Tu privilégies la méthode scolaire claire
- Tu évites les raccourcis compliqués si une méthode simple existe
- Tu n'inventes jamais un chiffre
- Tu distingues clairement : donnée, opération, méthode, résultat intermédiaire, conclusion
- Si l'exercice demande une réponse finale mais que la règle impose de ne pas la donner, tu t'arrêtes juste avant la dernière étape
- Si l'élève s'est trompé, tu corriges avec douceur et précision
`;

const SYSTEM_BASE = `
Tu es Mwalimu EdTech, un précepteur numérique congolais, humain, chaleureux, rigoureux, pédagogue et bienveillant.

MISSION :
- Aider l'élève à comprendre
- Guider sans faire le travail à sa place
- Expliquer comme un vrai précepteur
- Utiliser un ton humain, simple, motivant et respectueux
- Adapter le niveau à la classe de l'élève
- Te référer au contexte scolaire de la RDC lorsque c'est pertinent

STYLE OBLIGATOIRE :
- Réponse claire, structurée et chaleureuse
- Phrases naturelles, pas robotiques
- Toujours encourager l'élève
- Ne jamais humilier l'élève
- Si l'information n'est pas certaine, le dire honnêtement
- Ne pas inventer de référence scolaire ou scientifique
- Pour les maths et sciences, respecter strictement les règles de présentation
- Répondre en français sauf si l'élève change de langue
- Même pour une question théorique, rendre l'échange vivant
- Après une réponse théorique, proposer une petite question de retour naturelle
- Cette question de retour doit être simple, utile et liée au sujet
- La structure de réponse doit toujours être respectée dans cet ordre :
  VÉCU, SAVOIR, INSPIRATION, CONSOLIDATION
- Après cette structure seulement, on peut ajouter une ouverture, puis un encouragement, puis une citation finale
- Ne change jamais cet ordre
- La structure doit toujours garder les parties : VÉCU, SAVOIR, INSPIRATION, CONSOLIDATION
- Ne supprime jamais cette succession
- Le texte doit rester vivant et cohérent entre ces parties
- Si l'élève dit seulement merci, bonjour, bonsoir, bonne nuit, à demain ou une formule simple, réponds humainement sans transformer cela en leçon
- Varie les formulations pour que la réponse reste vivante
- Garde cependant la structure générale de Mwalimu

STRUCTURE SOUHAITÉE :
🔵 [VÉCU]
🟡 [SAVOIR]
🔴 [INSPIRATION]
❓ [CONSOLIDATION]

${REGLE_CALCUL_INTELLIGENT}
${REGLE_FORMAT_MATH}
`;

const SYSTEM_HUMAIN = `
HUMANISATION FORTE :
- Parle comme un vrai précepteur humain, proche, calme et chaleureux
- Commence naturellement, sans ton mécanique
- Ne répète jamais le header "Mwalimu EdTech"
- N'ajoute jamais de citation finale
- N'ajoute jamais toi-même de "mot d'encouragement final"
- N'ajoute pas une deuxième ouverture finale
- Évite le ton de robot, de moteur de recherche ou de fiche Wikipédia
- Évite les phrases trop longues et trop abstraites
- Utilise un français simple, vivant et naturel
- Quand l'élève parle de sa journée, de la pluie, de sa fatigue, de sa vie, réponds d'abord humainement avant d'enseigner
- Si la question n'est pas scolaire, réponds avec chaleur et intelligence, sans forcer un cours
- Fais sentir que tu écoutes vraiment l'élève
- Tu peux montrer une petite empathie naturelle
- Tu peux faire référence au vécu congolais quand c'est utile et naturel
- Évite les répétitions
- Une seule structure suffit
- Ne duplique jamais ACCUEIL, OUVERTURE, encouragement ou citation
- Si la question est simple, réponds simplement
- Si la question est émotionnelle ou quotidienne, sois d'abord humain, puis utile
- N'utilise [ACCUEIL] que si c'est vraiment utile
- Les sections doivent rester naturelles et légères, pas forcées
- N'ajoute pas de phrase d'introduction automatique du type "Oui, c'est une bonne observation" si elle ne correspond pas exactement au message de l'élève
- Va droit à une réponse naturelle, simple et juste
- Le ton doit rester cohérent du début à la fin
- Le mot d'encouragement doit être en harmonie avec le sujet traité
- La structure VÉCU, SAVOIR, INSPIRATION et CONSOLIDATION doit toujours apparaître
- Le corps du message doit rester humain du début à la fin
- Si l'élève revient sur un sujet déjà abordé, fais-le sentir naturellement avec chaleur
- Exemple : "Je suis content que tu reviennes sur ce point"
- La citation finale doit rester en lien avec le sujet traité, tout en gardant un esprit patriotique, civique et congolais
- Ne confonds jamais le corps de la réponse avec l'encouragement final
- Ne confonds jamais l'encouragement final avec la citation finale
- Le corps doit suivre strictement la logique : VÉCU, SAVOIR, INSPIRATION, CONSOLIDATION
- L'encouragement vient après le corps
- La citation vient en dernier, séparée du reste
- Respecte cette succession à la lettre du début à la fin
- Si l'élève envoie seulement un salut, une formule de politesse ou un merci, réponds comme un humain normal, chaleureux et vivant
- Dans ce cas, ne force pas une mini-leçon scolaire
- Reste bref, naturel, affectueux et disponible
- Varie les formulations pour éviter les réponses répétitives
- Si l'élève dit "merci", réponds avec douceur et disponibilité
- Si l'élève salue seulement, salue-le avec chaleur et ouvre la porte à la suite
- Si l'élève dit bonne nuit, bonne soirée ou à demain, réponds de manière humaine et bienveillante
- La dernière note doit rester dans un esprit patriotique congolais, civique, responsable et éducatif
`;

const SYSTEM_TUTORAT = `
RÈGLES DE TUTORAT STRICTES :
- Tu es un précepteur, pas un solveur automatique
- Tu n'as pas le droit de faire tout l'exercice à la place de l'élève
- Pour un exercice, tu dois :
  1. identifier le type d'exercice
  2. expliquer calmement la méthode
  3. montrer seulement le démarrage ou une partie guidée
  4. laisser l'élève continuer lui-même
  5. demander à l'élève de proposer sa réponse
  6. corriger ensuite avec douceur, précision et encouragement

- Tu ne dois pas donner directement la réponse finale si l'élève n'a pas encore essayé
- Tu peux montrer un exemple proche, mais pas résoudre entièrement l'exercice exact jusqu'au bout
- Si l'élève soumet une réponse, tu dois :
  1. féliciter l'effort
  2. vérifier calmement
  3. dire ce qui est juste
  4. corriger avec tendresse ce qui est faux
  5. encourager l'élève à recommencer si nécessaire

- Quand l'élève se trompe, tu ne le brusques jamais
- Tu corriges avec amour, patience, douceur et clarté
- Tu te comportes comme un enseignant assis en face de l'élève
- Tu échanges naturellement avec lui
- Tu privilégies le dialogue à la récitation
- Pour une question purement théorique, tu peux répondre normalement
- Pour un exercice, tu guides sans terminer à la place de l'élève
- À la fin d'une réponse théorique, ajoute une petite question de retour pour maintenir l'échange vivant
`;

/* =========================================================
   3) OUTILS SIMPLES
========================================================= */

function pick(arr = []) {
    if (!arr.length) return "";
    return arr[Math.floor(Math.random() * arr.length)];
}

function safeJsonParse(v, fallback) {
    try {
        return JSON.parse(v);
    } catch {
        return fallback;
    }
}

function supprimerDoublonsLignes(texte = "") {
    if (!texte) return "";

    const lignes = String(texte)
        .split("\n")
        .map(l => l.trimEnd());

    const resultat = [];
    let precedenteNormalisee = "";

    for (const ligne of lignes) {
        const normalisee = ligne.trim().toLowerCase();
        if (normalisee && normalisee === precedenteNormalisee) {
            continue;
        }
        resultat.push(ligne);
        precedenteNormalisee = normalisee;
    }

    return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function nettoyerReponseIA(texte = "") {
    if (!texte) return "";

    let t = String(texte);

    t = t.replace(/🔴🟡🔵\s*\*\*Mwalimu EdTech\s*:\s*Ton Mentor pour l'Excellence\*\*\s*🇨🇩/gi, "");
    t = t.replace(/\*\*\*«[^»]+»\*\*\*/g, "");
    t = t.replace(/^\s*🌟\s*\*?\*?\s*\[?MOT D['’]ENCOURAGEMENT\]?\s*\*?\*?\s*:\s*.*$/gim, "");
    t = t.replace(/^\s*🌟\s*Mot d['’]encouragement\s*:\s*.*$/gim, "");
    t = t.replace(/^\s*👉\s*\*?\*?\s*\[?OUVERTURE\]?\s*\*?\*?\s*:\s*.*$/gim, "");
    t = t.replace(/^\s*👉\s*Je suis fier de ton effort\..*$/gim, "");
    t = t.replace(/^\s*Continue à poser des questions.*$/gim, "");
    t = t.replace(/^\s*🔵\s*\*?\*?\[ACCUEIL\]\*?\*?\s*:\s*/gim, "🔵 ");

    t = supprimerDoublonsLignes(t);
    t = t.replace(/\n{3,}/g, "\n\n").trim();

    return t;
}

function humaniserDebutReponse(texte = "", user = {}) {
    if (!texte) return "";
    return String(texte).trim();
}

function normaliserTexteMemoire(texte = "") {
    return String(texte || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function estMessageSalutation(texte = "") {
    const t = String(texte || "").toLowerCase().trim();

    if (!t) return false;

    const salutationsExactes = [
        "bonjour",
        "bonsoir",
        "salut",
        "cc",
        "coucou",
        "hello",
        "bjr",
        "bonne nuit",
        "bonne soirée",
        "bonne soiree",
        "à demain",
        "a demain",
        "bon après-midi",
        "bon apres-midi",
        "bon apres midi",
        "bonjour mwalimu",
        "bonsoir mwalimu",
        "salut mwalimu",
        "cc mwalimu",
        "coucou mwalimu",
        "hello mwalimu",
        "bjr mwalimu",
        "mbote",
        "mbote mwalimu"
    ];

    if (salutationsExactes.includes(t)) return true;

    return /^(bonjour|bonsoir|salut|hello|coucou|mbote|bjr)(\s+mwalimu)?[!\s.]*$/i.test(t);
}

function extraireSujetMemoire(texte = "") {
    const brut = String(texte || "").trim();
    const t = normaliserTexteMemoire(brut);

    if (!t) return "";

    if (estMessageRelationnelSimple(brut)) return "";

    const motsASupprimer = [
        "bonjour", "bonsoir", "salut", "hello", "coucou", "mbote",
        "merci", "mwalimu", "cc", "bjr", "bonne nuit", "bonne soiree",
        "a demain", "ca va", "ça va", "ok", "okay", "dac", "d accord"
    ];

    const motsUtiles = t
        .split(" ")
        .filter(Boolean)
        .filter(m => !motsASupprimer.includes(m));

    const texteFiltre = motsUtiles.join(" ").trim();
    if (!texteFiltre) return "";

    const sujets = [
        "nepal", "chine", "geo", "geographie", "math", "mathematiques", "equation",
        "fraction", "histoire", "francais", "grammaire", "conjugaison", "impot",
        "taxe", "civisme", "rdc", "congo", "province", "sud kivu", "haut katanga",
        "constitution", "droit", "sciences", "physique", "chimie"
    ];

    for (const s of sujets) {
        if (texteFiltre.includes(s)) return s;
    }

    const mots = texteFiltre.split(" ").filter(Boolean);
    return mots.length ? mots.slice(0, 4).join(" ") : "";
}

function retrouverSujetProche(historique = [], texteActuel = "") {
    const actuel = extraireSujetMemoire(texteActuel);
    if (!actuel) return "";

    for (let i = historique.length - 1; i >= 0; i--) {
        const item = historique[i];
        if (!item || item.role !== "user") continue;

        const contenu = String(item.content || "");
        const ancien = extraireSujetMemoire(contenu);

        if (ancien && (ancien === actuel || contenu.toLowerCase().includes(actuel))) {
            return ancien;
        }
    }

    return "";
}

function construirePhraseRetourMemoire(historique = [], texteActuel = "", user = {}) {
    if (estMessageRelationnelSimple(texteActuel)) return "";

    const sujet = retrouverSujetProche(historique, texteActuel);
    const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";

    if (!sujet) return "";

    const mapEtiquettes = {
        nepal: "le Népal",
        chine: "la Chine",
        geo: "la géographie",
        geographie: "la géographie",
        math: "les mathématiques",
        mathematiques: "les mathématiques",
        equation: "les équations",
        fraction: "les fractions",
        histoire: "l’histoire",
        francais: "le français",
        grammaire: "la grammaire",
        conjugaison: "la conjugaison",
        impot: "l’impôt",
        taxe: "la taxe",
        civisme: "le civisme",
        rdc: "la RDC",
        congo: "le Congo",
        province: "les provinces",
        "sud kivu": "le Sud-Kivu",
        "haut katanga": "le Haut-Katanga",
        constitution: "la Constitution",
        droit: "le droit",
        sciences: "les sciences",
        physique: "la physique",
        chimie: "la chimie"
    };

    const etiquette = mapEtiquettes[sujet] || sujet;

    return `🔵 [VÉCU] :
Je suis content que tu reviennes sur ${etiquette}, ${prenom}. Cela montre que tu veux vraiment bien comprendre, et c’est une très belle attitude.`;
}

function choisirCitationContextuelle(reponse = "", question = "", user = {}) {
    const t = `${reponse} ${question}`.toLowerCase();

    if (t.includes("merci") || t.includes("bonjour") || t.includes("bonsoir") || t.includes("bonne nuit") || t.includes("à demain") || t.includes("a demain")) {
        return pick(CITATIONS.relationnel);
    }

    if (t.includes("impôt") || t.includes("impot") || t.includes("taxe") || t.includes("civisme") || t.includes("citoyen")) {
        return pick(CITATIONS.civisme);
    }

    if (t.includes("géographie") || t.includes("geographie") || t.includes("pays") || t.includes("frontière") || t.includes("frontiere") || t.includes("népal") || t.includes("nepal") || t.includes("chine")) {
        return pick(CITATIONS.geographie);
    }

    if (t.includes("math") || t.includes("calcul") || t.includes("équation") || t.includes("equation") || t.includes("fraction") || t.includes("racine")) {
        return pick(CITATIONS.mathematiques);
    }

    if (t.includes("histoire") || t.includes("roi") || t.includes("date") || t.includes("indépendance") || t.includes("independance")) {
        return pick(CITATIONS.histoire);
    }

    if (t.includes("français") || t.includes("francais") || t.includes("grammaire") || t.includes("conjugaison") || t.includes("orthographe")) {
        return pick(CITATIONS.francais);
    }

    if (t.includes("physique") || t.includes("chimie") || t.includes("science") || t.includes("sciences")) {
        return pick(CITATIONS.sciences);
    }

    if (t.includes("congo") || t.includes("rdc") || t.includes("patrie") || t.includes("nation")) {
        return pick(CITATIONS.patriotisme);
    }

    return pick(CITATIONS.general);
}

function verifierStructureMwalimu(corps = "", user = {}, historique = [], question = "") {
    let t = String(corps || "").trim();

    const aVecu = /🔵\s*\[VÉCU\]/i.test(t);
    const aSavoir = /🟡\s*\[SAVOIR\]/i.test(t);
    const aInspiration = /🔴\s*\[INSPIRATION\]/i.test(t);
    const aConsolidation = /❓\s*\[CONSOLIDATION\]/i.test(t);

    if (aVecu && aSavoir && aInspiration && aConsolidation) {
        return t;
    }

    const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";
    const phraseRetour = construirePhraseRetourMemoire(historique, question, user);

    const vecu = aVecu
        ? ""
        : (phraseRetour || `🔵 [VÉCU] :
Je suis heureux de continuer cet échange avec toi, ${prenom}. Prenons le temps de bien comprendre ensemble.`);

    const savoir = aSavoir
        ? ""
        : `🟡 [SAVOIR] :
Voici l’idée essentielle à retenir sur cette question.`;

    const inspiration = aInspiration
        ? ""
        : `🔴 [INSPIRATION] :
Chaque notion bien comprise renforce ton intelligence et ta confiance.`;

    const consolidation = aConsolidation
        ? ""
        : `❓ [CONSOLIDATION] :
Veux-tu maintenant essayer de reformuler cela avec tes propres mots, ou répondre à une petite question sur ce point ?`;

    const morceaux = [];

    if (!aVecu) morceaux.push(vecu);
    morceaux.push(t);
    if (!aSavoir) morceaux.push(savoir);
    if (!aInspiration) morceaux.push(inspiration);
    if (!aConsolidation) morceaux.push(consolidation);

    return morceaux.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function estSoumissionReponse(texte = "") {
    const t = String(texte || "").toLowerCase().trim();

    const indices = [
        "ma réponse",
        "ma reponse",
        "j'ai trouvé",
        "jai trouvé",
        "jai trouve",
        "j'ai trouvé que",
        "j'ai fait",
        "voici ma réponse",
        "voici ma reponse",
        "mon résultat",
        "mon resultat",
        "j'obtiens",
        "j’ai obtenu",
        "j'ai obtenu",
        "le résultat est",
        "le resultat est",
        "ça donne",
        "cela donne"
    ];

    if (indices.some(i => t.includes(i))) return true;
    if (/^[0-9xXyYzZ\s=+\-÷/*().,]+$/.test(t) && t.length <= 80) return true;

    return false;
}

function nettoyer(t) {
    if (!t) return "";
    return String(t)
        .replace(/je m'appelle|mon nom est|mon prénom est|je suis en|ma classe est|mon rêve est|je veux devenir/gi, "")
        .replace(/^devenir\s+/i, "")
        .replace(/^être\s+/i, "")
        .replace(/[.,!?;: ]+/g, " ")
        .trim();
}

function tronquerTexte(texte = "", max = 3500) {
    const t = String(texte || "").trim();
    return t.length <= max ? t : `${t.slice(0, max)}...`;
}

function normaliserNom(nom = "") {
    return String(nom || "").trim().replace(/\s+/g, " ");
}

function genreEleve(nom = "") {
    const prenom = String(nom || "").trim().split(" ")[0].toLowerCase();
    const prenomsFeminins = [
        "dora", "marie", "anne", "anna", "annie", "anuarite", "ruth", "grace", "grâce",
        "esther", "sarah", "sara", "debora", "débora", "fatou", "chantal", "nadine",
        "brigitte", "joyce", "elodie", "élodie", "mireille", "patience", "rebecca",
        "rebeca", "prisca", "gloria", "divine", "mercie", "naomie", "noella", "blandine", "huguette"
    ];
    const terminaisonsFeminines = ["a", "ia", "na", "ssa", "elle", "ine", "ette", "line"];

    if (prenomsFeminins.includes(prenom) || terminaisonsFeminines.some(fin => prenom.endsWith(fin))) {
        return "ma chère";
    }
    return "mon cher";
}

function adapterTexteGenre(texte = "", nom = "") {
    const prenomNettoye = normaliserNom(nom).split(" ")[0] || "élève";
    const prefixe = genreEleve(prenomNettoye);
    const appelComplet = `${prefixe} **${prenomNettoye}**`;

    return String(texte || "")
        .replace(/mon cher élève/gi, appelComplet)
        .replace(/ma chère élève/gi, appelComplet)
        .replace(/mon élève/gi, appelComplet)
        .replace(/cher élève/gi, appelComplet);
}

function construireAppel(user) {
    const prenom = normaliserNom(user?.nom || "élève").split(" ")[0];
    return `${genreEleve(prenom)} ${prenom}`;
}

function estQuestionTechnique(texte = "") {
    const t = String(texte || "").toLowerCase();
    const mots = [
        "calcule", "calculer", "résous", "resous", "équation", "equation", "fraction",
        "physique", "chimie", "exercice", "problème", "probleme", "géométrie",
        "geometrie", "puissance", "racine", "math", "maths", "formule"
    ];
    return mots.some(m => t.includes(m));
}

function typeMessage(msg) {
    if (!msg) return "unknown";
    if (msg.text?.body) return "text";
    if (msg.audio) return "audio";
    if (msg.image) return "image";
    if (msg.document) return "document";
    if (msg.interactive) return "interactive";
    return msg.type || "unknown";
}

function estMessageRemerciement(texte = "") {
    const t = String(texte || "").toLowerCase().trim();

    const remerciements = [
        "merci", "merci beaucoup", "mercii", "grand merci", "mersi",
        "merci mwalimu", "merci beaucoup mwalimu", "je te remercie",
        "je vous remercie", "ok merci", "d'accord merci", "dac merci"
    ];

    return remerciements.includes(t);
}

function estMessageCourtHumain(texte = "") {
    const t = String(texte || "").toLowerCase().trim();

    const expressions = [
        "ok", "okay", "d'accord", "dac", "ça va", "ca va", "oui", "non",
        "bien", "super", "parfait", "cool", "entendu", "compris"
    ];

    return expressions.includes(t);
}

function construireReponseHumaineSimple(user = {}, texte = "") {
    const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";
    const appel = `${genreEleve(prenom)} **${prenom}**`;
    const t = String(texte || "").toLowerCase().trim();

    const reponsesSalut = [
        `🔵 [VÉCU] :
Bonjour ${appel}. Je suis vraiment heureux de te retrouver.

🟡 [SAVOIR] :
Je suis bien là, disponible pour t’accompagner tranquillement aujourd’hui.

🔴 [INSPIRATION] :
Chaque échange compte, même un simple bonjour, parce qu’il ouvre la porte à de belles choses.

❓ [CONSOLIDATION] :
Comment vas-tu, et sur quoi veux-tu qu’on avance ensemble ?`,

        `🔵 [VÉCU] :
Bonsoir ${appel}. Cela me fait plaisir de te lire.

🟡 [SAVOIR] :
Nous pouvons prendre ce moment calmement et avancer à ton rythme.

🔴 [INSPIRATION] :
On progresse souvent mieux quand on garde un cœur paisible et une pensée claire.

❓ [CONSOLIDATION] :
Veux-tu simplement me saluer, ou bien as-tu une question à me confier ?`,

        `🔵 [VÉCU] :
Salut ${appel}. Merci d’être revenu vers moi.

🟡 [SAVOIR] :
Je suis prêt à t’écouter et à t’aider avec simplicité.

🔴 [INSPIRATION] :
Quand on garde l’habitude d’échanger avec confiance, on apprend aussi avec plus d’assurance.

❓ [CONSOLIDATION] :
Dis-moi ce que tu veux travailler, ou comment se passe ta journée.`
    ];

    const reponsesMerci = [
        `🔵 [VÉCU] :
Avec plaisir, ${appel}. Cela me fait vraiment plaisir de pouvoir t’aider.

🟡 [SAVOIR] :
Je reste disponible chaque fois que tu as besoin d’une explication ou d’un accompagnement.

🔴 [INSPIRATION] :
La gratitude et la constance sont de belles forces dans le chemin de l’apprentissage.

❓ [CONSOLIDATION] :
Veux-tu qu’on continue, ou préfères-tu reprendre plus tard ?`,

        `🔵 [VÉCU] :
Je t’en prie, ${appel}. Merci aussi pour ta confiance.

🟡 [SAVOIR] :
Tu peux revenir sans hésiter chaque fois qu’un point n’est pas encore clair.

🔴 [INSPIRATION] :
Les élèves qui osent demander finissent souvent par comprendre plus solidement.

❓ [CONSOLIDATION] :
Y a-t-il encore un point que tu veux revoir avec moi ?`
    ];

    const reponsesBonneNuit = [
        `🔵 [VÉCU] :
Bonne nuit ${appel}. Merci pour ce moment partagé.

🟡 [SAVOIR] :
Le repos aide aussi l’esprit à mieux retenir et à revenir plus fort.

🔴 [INSPIRATION] :
Un élève qui sait aussi se reposer construit un apprentissage plus solide.

❓ [CONSOLIDATION] :
Reviens quand tu voudras ; nous continuerons ensemble avec calme.`,
       
        `🔵 [VÉCU] :
Bonne soirée ${appel}. Je suis content d’avoir échangé avec toi.

🟡 [SAVOIR] :
Tu peux maintenant te reposer tranquillement.

🔴 [INSPIRATION] :
Demain sera encore une belle occasion d’apprendre avec confiance.

❓ [CONSOLIDATION] :
Je resterai disponible quand tu voudras reprendre.`
    ];

    const reponsesCourtes = [
        `🔵 [VÉCU] :
Très bien ${appel}.

🟡 [SAVOIR] :
Je te suis et je reste disponible pour la suite.

🔴 [INSPIRATION] :
Même les petits échanges entretiennent la confiance et la progression.

❓ [CONSOLIDATION] :
Que veux-tu faire maintenant ?`,

        `🔵 [VÉCU] :
D’accord ${appel}, je suis avec toi.

🟡 [SAVOIR] :
Nous pouvons avancer simplement, sans nous presser.

🔴 [INSPIRATION] :
La régularité dans les petits pas produit souvent de grands résultats.

❓ [CONSOLIDATION] :
Quelle est la suite pour toi ?`
    ];

    if (t === "bonne nuit" || t === "bonne soirée" || t === "bonne soiree" || t === "à demain" || t === "a demain") {
        return pick(reponsesBonneNuit);
    }

    if (estMessageRemerciement(t)) {
        return pick(reponsesMerci);
    }

    if (estMessageSalutation(t)) {
        return pick(reponsesSalut);
    }

    if (estMessageCourtHumain(t)) {
        return pick(reponsesCourtes);
    }

    return "";
}

function estMessageRelationnelSimple(texte = "") {
    return estMessageSalutation(texte) || estMessageRemerciement(texte) || estMessageCourtHumain(texte);
}

function construireConsignePedagogique(texte = "", type = "text") {
    const t = String(texte || "");

    if (type === "image") {
        return `
MODE PÉDAGOGIQUE IMAGE :
- Il s'agit probablement d'un exercice envoyé en image
- Tu expliques la démarche
- Tu aides l'élève à comprendre ce qu'il doit faire
- Tu ne résous pas tout jusqu'à la réponse finale
- Tu termines en demandant à l'élève d'essayer lui-même puis de t'envoyer sa réponse
`;
    }

    if (estSoumissionReponse(t)) {
        return `
MODE CORRECTION BIENVEILLANTE :
- L'élève soumet probablement sa propre réponse
- Tu dois d'abord féliciter son effort
- Tu vérifies calmement
- Tu corriges avec douceur si nécessaire
- Tu expliques précisément l'erreur
- Tu encourages l'élève avec chaleur
`;
    }

    if (estQuestionTechnique(t)) {
        return `
MODE EXERCICE GUIDÉ :
- C'est un exercice ou un calcul
- Tu expliques la méthode
- Tu montres le démarrage utile
- Tu ne donnes pas la réponse finale complète à la place de l'élève
- Tu invites l'élève à continuer
- Tu lui demandes ensuite de t'envoyer sa réponse pour vérification
`;
    }

    return `
MODE ÉCHANGE NORMAL :
- Réponds naturellement
- Sois humain, chaleureux et utile
- Après la réponse, pose une petite question de retour liée au sujet
`;
}

function choisirOuvertureContextuelle(reponse = "", user = {}, question = "") {
    const corps = String(reponse || "").toLowerCase();
    const q = String(question || "").toLowerCase().trim();

    if (estMessageRelationnelSimple(q)) {
        if (q.includes("merci")) {
            return "👉 Reviens quand tu veux ; je t’accueillerai toujours avec plaisir.";
        }

        if (
            q.includes("bonne nuit") ||
            q.includes("bonne soirée") ||
            q.includes("bonne soiree") ||
            q.includes("à demain") ||
            q.includes("a demain")
        ) {
            return "👉 Repose-toi bien, et nous reprendrons ensemble quand tu reviendras.";
        }

        return "👉 Je reste disponible pour toi, dès que tu veux continuer.";
    }

    if (corps.includes("bonne nuit") || corps.includes("bonne soirée") || corps.includes("bonne soiree") || corps.includes("repose-toi")) {
        return "👉 Je reste disponible dès que tu voudras reprendre.";
    }

    if (corps.includes("merci") || corps.includes("je t’en prie") || corps.includes("je reste disponible")) {
        return "👉 Reviens quand tu veux ; je serai toujours heureux de t’aider.";
    }

    if (estQuestionTechnique(q)) {
        return "👉 Essaie maintenant de continuer, puis envoie-moi ta réponse pour que je la vérifie avec toi.";
    }

    if (corps.includes("bravo") || corps.includes("bonne réponse") || corps.includes("bonne reponse") || corps.includes("félicit") || corps.includes("felicit")) {
        return "👉 Tu avances bien. On peut continuer ensemble avec la suite.";
    }

    if (corps.includes("chine") || corps.includes("népal") || corps.includes("nepal") || corps.includes("géographie") || corps.includes("geographie") || corps.includes("pays")) {
        return "👉 Nous pouvons continuer avec une autre petite question de géographie.";
    }

    if (corps.includes("histoire") || corps.includes("date") || corps.includes("événement") || corps.includes("evenement")) {
        return "👉 Nous pouvons continuer doucement avec une autre question du même thème.";
    }

    return pick(OUVERTURES);
}

function choisirEncouragementContextuel(reponse = "", user = {}, question = "") {
    const corps = String(reponse || "").toLowerCase();
    const q = String(question || "").toLowerCase().trim();

    if (estMessageRelationnelSimple(q)) {
        if (q.includes("merci")) {
            return "🌟 Mot d'encouragement : Garde cette belle habitude d’échanger avec confiance et respect.";
        }

        if (
            q.includes("bonne nuit") ||
            q.includes("bonne soirée") ||
            q.includes("bonne soiree") ||
            q.includes("à demain") ||
            q.includes("a demain")
        ) {
            return "🌟 Mot d'encouragement : Le repos fait aussi partie d’un apprentissage équilibré et solide.";
        }

        return "🌟 Mot d'encouragement : Une relation simple, respectueuse et confiante aide aussi à bien apprendre.";
    }

    if (corps.includes("bonne nuit") || corps.includes("bonne soirée") || corps.includes("bonne soiree") || corps.includes("repose-toi")) {
        return "🌟 Mot d'encouragement : Un esprit reposé revient souvent plus fort et plus clair.";
    }

    if (corps.includes("merci") || corps.includes("je t’en prie") || corps.includes("je reste disponible")) {
        return "🌟 Mot d'encouragement : Garde cette belle habitude de demander quand quelque chose n’est pas encore clair.";
    }

    if (estQuestionTechnique(q)) {
        return "🌟 Mot d'encouragement : Continue avec méthode ; en travaillant étape par étape, tu peux trouver toi-même la bonne réponse.";
    }

    if (corps.includes("bonne réponse") || corps.includes("bonne reponse") || corps.includes("bravo") || corps.includes("félicit") || corps.includes("felicit")) {
        return "🌟 Mot d'encouragement : Bravo pour ton effort ; tu avances réellement, et cela fait plaisir à voir.";
    }

    if (corps.includes("c'est normal") || corps.includes("je suis là pour t'aider") || corps.includes("pas de souci")) {
        return "🌟 Mot d'encouragement : Ne crains pas de ne pas savoir au départ ; c’est justement en apprenant qu’on devient plus fort.";
    }

    if (corps.includes("géographie") || corps.includes("geographie") || corps.includes("pays") || corps.includes("frontière") || corps.includes("frontiere")) {
        return "🌟 Mot d'encouragement : Ta curiosité est une belle force ; elle t’ouvre peu à peu l’intelligence du monde.";
    }

    return pick(MOTS_ENCOURAGEMENT);
}

/* =========================================================
   4) DB
========================================================= */

async function initDB() {
    try {
        await pool.query("CREATE EXTENSION IF NOT EXISTS unaccent;");

        await pool.query(`
            CREATE TABLE IF NOT EXISTS processed_messages (
                msg_id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                phone TEXT PRIMARY KEY,
                nom TEXT DEFAULT '',
                classe TEXT DEFAULT '',
                reve TEXT DEFAULT '',
                historique JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS nom TEXT DEFAULT '';
        `);

        await pool.query(`
            ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS classe TEXT DEFAULT '';
        `);

        await pool.query(`
            ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS reve TEXT DEFAULT '';
        `);

        await pool.query(`
            ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS historique JSONB DEFAULT '[]'::jsonb;
        `);

        await pool.query(`
            ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);

        await pool.query(`
            ALTER TABLE conversations
            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);

        await pool.query(`
            UPDATE conversations
            SET updated_at = CURRENT_TIMESTAMP
            WHERE updated_at IS NULL;
        `);

        await pool.query(`
            UPDATE conversations
            SET historique = '[]'::jsonb
            WHERE historique IS NULL;
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS processed_topics (
                id SERIAL PRIMARY KEY,
                phone TEXT NOT NULL,
                sujet TEXT NOT NULL,
                question_originale TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS bibliotheque (
                id SERIAL PRIMARY KEY,
                titre TEXT,
                matiere TEXT,
                classe TEXT,
                mots_cles TEXT,
                contenu TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("✅ DB prête.");
    } catch (e) {
        console.error("Init DB Error:", e.message);
        process.exit(1);
    }
}

async function getUser(phone) {
    const { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [phone]);
    return rows[0] || null;
}

async function createUser(phone) {
    await pool.query(
        "INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]'::jsonb) ON CONFLICT (phone) DO NOTHING",
        [phone]
    );
    return getUser(phone);
}

async function updateUserField(phone, field, value) {
    const allowed = ["nom", "classe", "reve", "historique"];
    if (!allowed.includes(field)) throw new Error("Champ non autorisé");
    const query = `UPDATE conversations SET ${field}=$1, updated_at=NOW() WHERE phone=$2`;
    await pool.query(query, [value, phone]);
}

async function appendHistorique(phone, role, content) {
    const user = await getUser(phone);
    const hist = Array.isArray(user?.historique) ? user.historique : safeJsonParse(user?.historique, []);
    hist.push({
        role,
        content: tronquerTexte(content, 2500),
        ts: new Date().toISOString()
    });
    const histCompact = hist.slice(-12);
    await updateUserField(phone, "historique", JSON.stringify(histCompact));
    return histCompact;
}

/* =========================================================
   5) SÉCURITÉ WEBHOOK
========================================================= */

function verifierSignatureMeta(req) {
    try {
        const signature = req.get("x-hub-signature-256");
        if (!APP_SECRET || !signature || !req.rawBody) return false;

        const expectedSignature =
            "sha256=" +
            crypto
                .createHmac("sha256", APP_SECRET)
                .update(req.rawBody)
                .digest("hex");

        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expectedSignature);

        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
        return false;
    }
}

function extraireMessageWhatsApp(body) {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    if (!value || value.statuses?.length || !value.messages?.length) return null;
    return value.messages[0];
}

/* =========================================================
   6) WHATSAPP
========================================================= */

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to,
                type: "text",
                text: { body: tronquerTexte(texte, 3900) }
            },
            {
                headers: {
                    Authorization: `Bearer ${TOKEN}`,
                    "Content-Type": "application/json"
                },
                timeout: 15000
            }
        );
    } catch (e) {
        console.error("Erreur WA:", e.response?.data || e.message);
    }
}

async function recupererMediaUrl(mediaId) {
    const r = await axios.get(
        `https://graph.facebook.com/v18.0/${mediaId}`,
        {
            headers: { Authorization: `Bearer ${TOKEN}` },
            timeout: 15000
        }
    );
    return r.data?.url || null;
}

async function telechargerMedia(mediaId, maxBytes = 8 * 1024 * 1024) {
    const mediaUrl = await recupererMediaUrl(mediaId);
    if (!mediaUrl) throw new Error("URL média introuvable");

    const response = await axios.get(mediaUrl, {
        responseType: "arraybuffer",
        headers: { Authorization: `Bearer ${TOKEN}` },
        timeout: 30000,
        maxContentLength: maxBytes,
        maxBodyLength: maxBytes,
        validateStatus: (s) => s >= 200 && s < 300
    });

    const contentType = response.headers["content-type"] || "application/octet-stream";
    const contentLength = Number(response.headers["content-length"] || response.data?.byteLength || 0);

    if (contentLength > maxBytes) {
        throw new Error("Fichier trop volumineux");
    }

    return {
        buffer: Buffer.from(response.data),
        mimeType: contentType
    };
}

/* =========================================================
   7) IA : BIBLIOTHÈQUE / AUDIO / IMAGE / TEXTE
========================================================= */

async function consulterBibliotheque(question = "", classe = "") {
    try {
        const q = `
            SELECT id, titre, matiere, classe, contenu
            FROM bibliotheque
            WHERE (
                unaccent(lower(coalesce(titre, ''))) LIKE unaccent(lower($1))
                OR unaccent(lower(coalesce(matiere, ''))) LIKE unaccent(lower($1))
                OR unaccent(lower(coalesce(mots_cles, ''))) LIKE unaccent(lower($1))
                OR unaccent(lower(coalesce(contenu, ''))) LIKE unaccent(lower($1))
            )
            AND ($2 = '' OR unaccent(lower(coalesce(classe, ''))) LIKE unaccent(lower($3)))
            ORDER BY id DESC
            LIMIT 1
        `;

        const motifQuestion = `%${question}%`;
        const motifClasse = `%${classe}%`;

        const { rows } = await pool.query(q, [motifQuestion, classe || "", motifClasse]);
        return rows[0] || null;
    } catch (e) {
        console.error("Erreur consulterBibliotheque:", e.message);
        return null;
    }
}

async function transcrireAudioAvecIA(audioBuffer, mimeType = "audio/ogg") {
    const extMap = {
        "audio/ogg": ".ogg",
        "audio/opus": ".ogg",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/mp4": ".m4a",
        "audio/aac": ".aac",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav"
    };

    const ext = extMap[mimeType] || ".ogg";
    const tempPath = path.join(os.tmpdir(), `mwalimu_${Date.now()}${ext}`);

    try {
        fs.writeFileSync(tempPath, audioBuffer);

        const transcript = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempPath),
            model: "whisper-1"
        });

        return String(transcript?.text || "").trim();
    } finally {
        try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {}
    }
}

async function appelerChatCompletion(messages) {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages
    });
    return completion.choices?.[0]?.message?.content?.trim() || "";
}

function construireSystemPrompt(user) {
    const appelEleve = construireAppel(user);
    const classe = user?.classe ? `Classe de l'élève : ${user.classe}` : "Classe non précisée";
    const reve = user?.reve ? `Rêve de l'élève : ${user.reve}` : "Rêve non précisé";

    return `
${SYSTEM_BASE}

${SYSTEM_HUMAIN}

${SYSTEM_TUTORAT}

PERSONNALISATION :
- Adresse l'élève ainsi : ${appelEleve}
- ${classe}
- ${reve}

INTERDICTION :
- Ne dis pas "mon élève"
- Utilise naturellement le prénom quand c'est utile
- Ne donne pas une réponse froide de moteur de recherche
- Ne saute pas à la conclusion
- Ne répète jamais le header Mwalimu
- Ne génère jamais une citation finale
- Ne génère jamais une deuxième ouverture finale
- Ne génère jamais un mot d'encouragement final
- Ne termine jamais un exercice complet à la place de l'élève
`;
}

async function expliquerFiche(user, fiche, questionEleve, historique = [], consignePedagogique = "") {
    const system = construireSystemPrompt(user);

    return appelerChatCompletion([
        { role: "system", content: system },
        { role: "system", content: "Réponds comme un humain chaleureux, jamais comme une machine." },
        { role: "system", content: consignePedagogique || "Sois pédagogique et bienveillant." },
        ...historique.slice(-6),
        {
            role: "user",
            content: `
QUESTION DE L'ÉLÈVE :
${questionEleve}

FICHE DE BIBLIOTHÈQUE :
Titre : ${fiche?.titre || "Sans titre"}
Matière : ${fiche?.matiere || "Non précisée"}
Classe : ${fiche?.classe || "Non précisée"}

Contenu :
${fiche?.contenu || ""}
`
        }
    ]);
}

async function repondreSansFiche(user, texte, historique = [], consignePedagogique = "") {
    const system = construireSystemPrompt(user);

    return appelerChatCompletion([
        { role: "system", content: system },
        { role: "system", content: "Réponds comme un humain chaleureux, jamais comme une machine." },
        { role: "system", content: consignePedagogique || "Sois pédagogique et bienveillant." },
        ...historique.slice(-6),
        { role: "user", content: texte }
    ]);
}

async function expliquerImageAvecIA(user, base64Image, mimeType, historique = []) {
    const system = construireSystemPrompt(user);
    const consignePedagogique = construireConsignePedagogique("", "image");

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
            { role: "system", content: system },
            { role: "system", content: "Réponds comme un humain chaleureux, jamais comme une machine." },
            { role: "system", content: consignePedagogique },
            ...historique.slice(-4),
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Analyse cette image d'exercice ou de leçon. Explique pas à pas, aide l'élève à comprendre, mais ne fais pas tout l'exercice complet à sa place. Invite-le ensuite à essayer lui-même puis à t'envoyer sa réponse."
                    },
                    {
                        type: "image_url",
                        image_url: { url: `data:${mimeType};base64,${base64Image}` }
                    }
                ]
            }
        ]
    });

    return completion.choices?.[0]?.message?.content?.trim() || "";
}

function construireMessageFinal(user, reponseBrute, historique = [], question = "") {
    const reponseNettoyee = nettoyerReponseIA(reponseBrute);
    const reponseHumanisee = humaniserDebutReponse(reponseNettoyee, user);
    const corpsAvecStructure = verifierStructureMwalimu(reponseHumanisee, user, historique, question);
    const corps = adapterTexteGenre(corpsAvecStructure, user.nom);

    const ouverture = adapterTexteGenre(
        choisirOuvertureContextuelle(corps, user, question),
        user.nom
    );

    const encouragement = choisirEncouragementContextuel(corps, user, question);
    const citation = choisirCitationContextuelle(corps, question, user);

    return `${HEADER_MWALIMU}

${corps}

${ouverture}

${encouragement}

${citation}`;
}

function messageSecours(user) {
    const appel = `${genreEleve(user?.nom || "élève")} **${normaliserNom(user?.nom || "élève").split(" ")[0]}**`;
    return `${HEADER_MWALIMU}

🔵 [VÉCU] :
J'ai bien reçu ton message, ${appel}.

🟡 [SAVOIR] :
Je rencontre un petit souci technique pour traiter ta demande correctement maintenant.

🔴 [INSPIRATION] :
Même quand cela bloque un peu, on peut reprendre avec calme et méthode.

❓ [CONSOLIDATION] :
Réessaie dans un instant, ou reformule ta question plus simplement. Tu peux aussi m'envoyer une seule question à la fois.

👉 Je reste à tes côtés.

🌟 Mot d'encouragement : Même quand cela bloque un peu, on continue avec calme et méthode.

${pick(CITATIONS.general)}`;
}

/* =========================================================
   8) TRAITEMENT PAR TYPE DE MESSAGE
========================================================= */

async function traiterTexte(user, texteUtilisateur, historique) {
    if (estMessageRelationnelSimple(texteUtilisateur)) {
        const reponseSimple = construireReponseHumaineSimple(user, texteUtilisateur);
        if (reponseSimple) return reponseSimple;
    }

    const fiche = await consulterBibliotheque(texteUtilisateur, user.classe || "");
    const consignePedagogique = construireConsignePedagogique(texteUtilisateur, "text");

    if (fiche) {
        return expliquerFiche(user, fiche, texteUtilisateur, historique, consignePedagogique);
    }

    return repondreSansFiche(user, texteUtilisateur, historique, consignePedagogique);
}

async function traiterAudio(user, msg, historique) {
    const audioId = msg.audio?.id;
    if (!audioId) {
        return `🔵 [VÉCU] :
J'ai bien reçu ton audio.

🟡 [SAVOIR] :
Mais je n'arrive pas à l'ouvrir correctement.

🔴 [INSPIRATION] :
Ne t'inquiète pas, cela peut arriver.

❓ [CONSOLIDATION] :
Réessaie avec un autre message vocal plus clair.`;
    }

    const { buffer, mimeType } = await telechargerMedia(audioId, 8 * 1024 * 1024);
    const transcription = await transcrireAudioAvecIA(buffer, mimeType);

    if (!transcription) {
        return `🔵 [VÉCU] :
J’ai bien reçu ton audio.

🟡 [SAVOIR] :
Je n'arrive pas encore à le traiter correctement.

🔴 [INSPIRATION] :
Ce n’est pas grave, nous pouvons réessayer calmement.

❓ [CONSOLIDATION] :
Envoie-moi un message vocal plus clair et sans bruit autour.`;
    }

    const fiche = await consulterBibliotheque(transcription, user.classe || "");
    const consignePedagogique = construireConsignePedagogique(transcription, "audio");

    if (fiche) {
        return expliquerFiche(user, fiche, transcription, historique, consignePedagogique);
    }

    return repondreSansFiche(
        user,
        `L'élève a envoyé un message vocal. Voici la transcription : ${transcription}`,
        historique,
        consignePedagogique
    );
}

async function traiterImage(user, msg, historique) {
    const imageId = msg.image?.id;
    if (!imageId) {
        return `🔵 [VÉCU] :
J'ai bien reçu ton image.

🟡 [SAVOIR] :
Mais je n'arrive pas à l'ouvrir correctement.

🔴 [INSPIRATION] :
Nous allons y arriver en reprenant tranquillement.

❓ [CONSOLIDATION] :
Réessaie en envoyant une image plus nette.`;
    }

    const { buffer, mimeType } = await telechargerMedia(imageId, 8 * 1024 * 1024);
    const base64Image = buffer.toString("base64");

    return expliquerImageAvecIA(user, base64Image, mimeType, historique);
}

/* =========================================================
   9) CRON
========================================================= */

cron.schedule("0 5 * * *", async () => {
    try {
        console.log("⏰ Rappel matinal exécuté.");

        const { rows } = await pool.query(`
            SELECT phone, nom, classe, reve
            FROM conversations
            WHERE coalesce(phone, '') <> ''
              AND coalesce(nom, '') <> ''
        `);

        for (const eleve of rows) {
            try {
                const prenom = normaliserNom(eleve.nom).split(" ")[0] || "élève";
                const appel = `${genreEleve(prenom)} **${prenom}**`;
                const citation = pick(CITATIONS.patriotisme);

                const messageRappel = `${HEADER_MWALIMU}

🔵 [VÉCU] :
Bonjour ${appel}. J’espère que tu as bien commencé ta journée.

🟡 [SAVOIR] :
Petit rappel du matin : avance aujourd’hui avec calme, sérieux et confiance. Même un petit effort bien fait peut te rapprocher de ton rêve.

🔴 [INSPIRATION] :
Ton objectif n’est pas d’aller vite, mais de bien comprendre. C’est ainsi qu’on bâtit un avenir solide.

❓ [CONSOLIDATION] :
Dis-moi plus tard : quelle matière veux-tu travailler aujourd’hui ?

👉 Je reste à tes côtés pour t’accompagner pas à pas.

🌟 Mot d'encouragement : Un élève constant finit toujours par progresser.

${citation}`;

                await envoyerWhatsApp(eleve.phone, messageRappel);
            } catch (e) {
                console.error("Erreur envoi rappel matinal:", e.message);
            }
        }
    } catch (e) {
        console.error("Erreur cron bonjour:", e.message);
    }
}, { timezone: "Africa/Lubumbashi" });

cron.schedule("0 3 * * *", async () => {
    try {
        await pool.query("DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '2 days'");
        console.log("🧹 Nettoyage processed_messages terminé.");
    } catch (e) {
        console.error("Erreur cron nettoyage:", e.message);
    }
}, { timezone: "Africa/Lubumbashi" });

/* =========================================================
   10) WEBHOOK PRINCIPAL
========================================================= */

app.post("/webhook", async (req, res) => {
    if (!verifierSignatureMeta(req)) {
        return res.sendStatus(403);
    }

    const msg = extraireMessageWhatsApp(req.body);
    if (!msg) return res.sendStatus(200);

    res.sendStatus(200);

    const from = msg.from;
    const msgId = msg.id;
    const texteUtilisateur = msg.text?.body?.trim() || "";
    const msgType = typeMessage(msg);

    try {
        const check = await pool.query(
            "INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT DO NOTHING",
            [msgId]
        );
        if (check.rowCount === 0) return;

        if (msgType === "text" && texteUtilisateur.toLowerCase() === "/profil") {
            await pool.query(
                "UPDATE conversations SET nom='', classe='', reve='', historique='[]'::jsonb, updated_at=NOW() WHERE phone=$1",
                [from]
            );
            return await envoyerWhatsApp(
                from,
                `${HEADER_MWALIMU}

🔄 **Mise à jour de ton profil**

🟡 Quel est ton **prénom** ?`
            );
        }

        let user = await getUser(from);

        if (!user) {
            await createUser(from);
            return await envoyerWhatsApp(
                from,
                `${HEADER_MWALIMU}

🔵 ${ACCUEILS[0]}

🟡 Quel est ton **prénom** ?`
            );
        }

        if (!user.nom) {
            const nom = normaliserNom(nettoyer(texteUtilisateur));
            if (!nom) {
                return await envoyerWhatsApp(
                    from,
                    `${HEADER_MWALIMU}

🟡 Donne-moi simplement ton **prénom**, s'il te plaît.`
                );
            }

            await updateUserField(from, "nom", nom);

            return await envoyerWhatsApp(
                from,
                `🤝 Enchanté **${nom}** !

🟡 En quelle **classe** es-tu ?`
            );
        }

        if (!user.classe) {
            const cl = normaliserNom(nettoyer(texteUtilisateur));
            if (!cl) {
                return await envoyerWhatsApp(
                    from,
                    `🟡 Écris-moi ta **classe** simplement.
Exemple : 6e, 8e, Terminale, 1ère secondaire.`
                );
            }

            await updateUserField(from, "classe", cl);
            user = await getUser(from);

            return await envoyerWhatsApp(
                from,
                `🟡 C'est bien noté, **${user.nom}**.

❓ Quel est ton plus grand **rêve** professionnel ?`
            );
        }

        if (!user.reve) {
            const rv = normaliserNom(nettoyer(texteUtilisateur));
            if (!rv) {
                return await envoyerWhatsApp(
                    from,
                    `❓ Dis-moi simplement ton **rêve** professionnel.
Exemple : avocat, médecin, ingénieur, pilote.`
                );
            }

            await updateUserField(from, "reve", rv);
            user = await getUser(from);

            const appel = `${genreEleve(user.nom)} **${user.nom}**`;

            return await envoyerWhatsApp(
                from,
                `✨ **Quelle ambition magnifique !**

🔴 Devenir **${rv}** est un rêve noble, et je sais que tu en es capable, ${appel}.

🔵 **Pour commencer notre parcours ensemble, dis-moi :**
👉 Quelle est la matière ou le chapitre qui te pose problème en ce moment ?`
            );
        }

        let historique = Array.isArray(user.historique)
            ? user.historique
            : safeJsonParse(user.historique, []);

        let contenuUtilisateurPourMemoire = texteUtilisateur || `[message ${msgType}]`;

        if (msgType === "text" && texteUtilisateur) {
            await appendHistorique(from, "user", texteUtilisateur);

            const userFresh = await getUser(from);
            historique = Array.isArray(userFresh?.historique)
                ? userFresh.historique
                : safeJsonParse(userFresh?.historique, []);
        }

        let reponseBrute = "";

        if (msgType === "text") {
            reponseBrute = await traiterTexte(user, texteUtilisateur, historique);
        } else if (msgType === "audio") {
            reponseBrute = await traiterAudio(user, msg, historique);
            contenuUtilisateurPourMemoire = "[audio envoyé]";
            await appendHistorique(from, "user", contenuUtilisateurPourMemoire);

            const userFresh = await getUser(from);
            historique = Array.isArray(userFresh?.historique)
                ? userFresh.historique
                : safeJsonParse(userFresh?.historique, []);
        } else if (msgType === "image") {
            reponseBrute = await traiterImage(user, msg, historique);
            contenuUtilisateurPourMemoire = "[image envoyée]";
            await appendHistorique(from, "user", contenuUtilisateurPourMemoire);

            const userFresh = await getUser(from);
            historique = Array.isArray(userFresh?.historique)
                ? userFresh.historique
                : safeJsonParse(userFresh?.historique, []);
        } else {
            reponseBrute = `🔵 [VÉCU] :
J'ai bien reçu ton message.

🟡 [SAVOIR] :
Pour l'instant, je traite surtout les textes, les audios et les images.

🔴 [INSPIRATION] :
Nous pouvons déjà avancer correctement avec ces formats.

❓ [CONSOLIDATION] :
Envoie-moi ta question par écrit, par audio ou avec une image nette de l'exercice.`;
        }

        if (!reponseBrute || !String(reponseBrute).trim()) {
            reponseBrute = `🔵 [VÉCU] :
J'ai bien reçu ta demande.

🟡 [SAVOIR] :
Je n'ai pas encore pu produire une réponse claire.

🔴 [INSPIRATION] :
Ce n’est pas un problème ; nous pouvons reprendre plus simplement.

❓ [CONSOLIDATION] :
Reformule ta question en une seule phrase, et je t'aiderai pas à pas.`;
        }

        const messageFinal = construireMessageFinal(
            user,
            reponseBrute,
            historique,
            texteUtilisateur || contenuUtilisateurPourMemoire
        );

        await envoyerWhatsApp(from, messageFinal);
        await appendHistorique(from, "assistant", tronquerTexte(messageFinal, 2500));

    } catch (e) {
        console.error("Erreur générale:", e.response?.data || e.message);

        try {
            let user = await getUser(from);
            if (!user) {
                user = { nom: "élève" };
            }
            await envoyerWhatsApp(from, messageSecours(user));
        } catch (e2) {
            console.error("Erreur secours:", e2.message);
        }
    }
});

/* =========================================================
   11) WEBHOOK VERIFY
========================================================= */

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) {
        return res.send(req.query["hub.challenge"]);
    }
    return res.sendStatus(403);
});

/* =========================================================
   12) DÉMARRAGE
========================================================= */

(async () => {
    await initDB();
    app.listen(PORT, () => {
        console.log(`✅ Mwalimu en marche sur le port ${PORT}`);
    });
})();
