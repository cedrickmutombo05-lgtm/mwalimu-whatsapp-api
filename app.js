

require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { GoogleGenerativeAI } = require("@google/generative-ai"); 
const cron = require("node-cron");
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
const GEMINI_API_KEY = requireEnv("GEMINI_API_KEY");
const DATABASE_URL = requireEnv("DATABASE_URL");
const TOKEN = requireEnv("TOKEN");
const PHONE_NUMBER_ID = requireEnv("PHONE_NUMBER_ID");
const VERIFY_TOKEN = requireEnv("VERIFY_TOKEN");
const APP_SECRET = requireEnv("APP_SECRET");

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(express.json({
    limit: "1mb",
    verify: (req, res, buf) => { req.rawBody = buf; }
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
   2) CONSTANTES MWALIMU (INTÉGRALITÉ CONSERVÉE)
========================================================= */

const HEADER_MWALIMU = "🔴🟡🔵 **Mwalimu EdTech : Ton Mentor pour l'Excellence** 🇨🇩";

const CITATIONS = {
    patriotisme:[
        "***« Aimer sa patrie, c’est la servir avec intelligence, honnêteté et discipline. »***",
        "***« Un bon élève d’aujourd’hui peut devenir un grand bâtisseur du Congo de demain. »***",
        "***« Le vrai savoir ne sert pas seulement à réussir sa vie, mais aussi à relever sa nation. »***",
        "***« Le Congo a besoin d’enfants instruits, responsables et fiers de leur pays. »***",
        "***« Aimer le Congo, c’est apprendre, travailler avec droiture et contribuer au bien commun. »***",
        "***« Payer l’impôt et la taxe avec honnêteté, c’est aussi participer au développement de la nation. »***"
    ],
    geographie:[
        "***« Connaître les pays et les peuples aide à mieux comprendre le monde et à mieux servir sa patrie. »***",
        "***« La géographie apprend à situer le monde, mais aussi à mieux situer son devoir envers la nation. »***"
    ],
    mathematiques:[
        "***« La rigueur dans le calcul forme aussi la rigueur dans la vie et dans le service du pays. »***",
        "***« Un esprit qui raisonne bien peut mieux construire l’avenir de sa nation. »***"
    ],
    histoire:[
        "***« Comprendre l’histoire aide à aimer sa patrie avec plus de conscience et de responsabilité. »***",
        "***« Un peuple qui connaît son histoire se prépare mieux à bâtir son avenir. »***"
    ],
    francais:[
        "***« Bien parler et bien écrire, c’est aussi mieux servir sa communauté et sa patrie. »***",
        "***« La maîtrise des mots donne de la force à la pensée et de la dignité au citoyen. »***"
    ],
    sciences:[
        "***« La science bien apprise peut aider à résoudre les vrais problèmes du pays. »***",
        "***« Étudier les sciences, c’est se préparer à être utile à sa nation. »***"
    ],
    civisme:[
        "***« Respecter la loi, la taxe et l’impôt, c’est participer avec dignité à la vie de la nation. »***",
        "***« Le civisme commence par de petits actes honnêtes qui fortifient la patrie. »***"
    ],
    relationnel:[
        "***« La politesse, le respect et l’amour du prochain élèvent aussi la nation. »***",
        "***« Un cœur reconnaissant et discipliné honore sa famille, son école et sa patrie. »***"
    ],
    general:[
        "***« Apprendre avec sérieux aujourd’hui, c’est mieux servir le Congo demain. »***",
        "***« Le savoir, la discipline et l’amour du pays font grandir la nation. »***"
    ]
};

const OUVERTURES =[
    "👉 Continue à me parler librement, je suis là pour t'aider.",
    "👉 Nous avançons ensemble, pas à pas.",
    "👉 Tu peux m'envoyer ta réponse, et je vais la vérifier avec toi.",
    "👉 Garde confiance, nous allons comprendre cela ensemble."
];

const ACCUEILS =[
    "Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.",
    "Mbote ! Je suis Mwalimu EdTech, heureux de t'accompagner dans tes études.",
    "Mbote ! Je suis Mwalimu EdTech, ton précepteur numérique bienveillant."
];

const MOTS_ENCOURAGEMENT =[
    "🌟 Mot d'encouragement : Continue avec calme et confiance ; chaque petit pas compte.",
    "🌟 Mot d'encouragement : Tu avances bien quand tu prends le temps de réfléchir sérieusement.",
    "🌟 Mot d'encouragement : Ne te décourage pas ; chaque bonne question t’aide à grandir.",
    "🌟 Mot d'encouragement : Avec de la patience et de l’attention, tu peux aller très loin."
];

const MATIERE_MATH = "math";
const MATIERE_PHYSIQUE = "physique";
const MATIERE_CHIMIE = "chimie";
const MATIERE_GENERAL = "general";

const REGLE_FORMAT_MATH = `
FORMAT OBLIGATOIRE D'ÉCRITURE SCIENTIFIQUE (WhatsApp) :
- Écris les calculs, formules et expressions de manière simple, scolaire, propre et lisible sur WhatsApp
- Interdiction totale de LaTeX et pseudo-LaTeX
- N'utilise jamais : \\( \\) \\[ \\] \\frac \\sqrt ^{} \\left \\right \\times \\div
- Puissance : x², x³, a², b², cm², cm³, m², m³
- Multiplication : ×
- Division : / seulement si c'est plus propre
- Fraction simple : 2/5, 3/4, 7/10
- Pour la racine, écris : √9 ou racine carrée de 9
- Les molécules doivent être écrites proprement : H₂O, CO₂, O₂, H₂SO₄, NaCl
- Les unités doivent être propres : cm², cm³, m/s, g/L, mol/L, kg/m³
`;

const REGLE_CALCUL_INTELLIGENT = `
RÈGLES SPÉCIALES POUR LES CALCULS ET EXERCICES SCIENTIFIQUES :
- Tu dois être extrêmement rigoureux dans les calculs
- Tu vérifies chaque étape avant de l'écrire
- Tu avances ligne par ligne, sans sauter d'étape importante
- Tu expliques la logique avant le résultat
- Tu privilégies la méthode scolaire claire
- Si l'exercice demande une réponse finale mais que la règle impose de ne pas la donner, tu t'arrêtes juste avant la dernière étape
- Pour les maths, la physique et la chimie, écris toujours en format horizontal simple
`;

const SYSTEM_BASE = `
Tu es Mwalimu EdTech, un précepteur numérique congolais, humain, chaleureux, rigoureux, pédagogue et bienveillant.
MISSION :
- Aider l'élève à comprendre
- Guider sans faire le travail à sa place
- Expliquer comme un vrai précepteur
STYLE OBLIGATOIRE :
- Réponse claire, structurée et chaleureuse
- Phrases naturelles, pas robotiques
- Structure de réponse : VÉCU, SAVOIR, INSPIRATION, CONSOLIDATION (toujours avec les emojis 🔵🟡🔴❓)
- Pas de notation LaTeX
${REGLE_CALCUL_INTELLIGENT}
${REGLE_FORMAT_MATH}
`;

const SYSTEM_HUMAIN = `
HUMANISATION FORTE :
- Parle comme un vrai précepteur humain, proche, calme et chaleureux
- Utilise le prénom de l'élève naturellement
- Ne répète jamais le header "Mwalimu EdTech"
- N'ajoute pas de phrase d'introduction automatique du type "Oui, c'est une bonne observation" si elle ne correspond pas
- Si l'élève salue ou dit merci, réponds simplement avec chaleur sans faire une leçon.
`;

const SYSTEM_TUTORAT = `
RÈGLES DE TUTORAT STRICTES :
- Tu es un précepteur, pas un solveur automatique
- Tu n'as pas le droit de faire tout l'exercice à la place de l'élève
- Pour un exercice, tu dois : identifier le type, expliquer la méthode, montrer le démarrage, et laisser l'élève continuer.
`;

/* =========================================================
   3) OUTILS DE NETTOYAGE & DIVERSIFICATION (INJECTION)
========================================================= */

function pick(arr =[]) {
    if (!arr.length) return "";
    return arr[Math.floor(Math.random() * arr.length)];
}

function safeJsonParse(v, fallback) {
    try { return JSON.parse(v); } catch { return fallback; }
}

function genreEleve(nom = "") {
    const prenom = String(nom || "").trim().split(" ")[0].toLowerCase();
    const prenomsFeminins =["dora", "marie", "anne", "anna", "annie", "ruth", "grace", "grâce", "esther", "sarah", "debora", "fatou", "chantal", "nadine", "joyce", "elodie", "mireille", "patience", "rebecca", "prisca", "gloria", "divine", "mercie", "naomie", "noella", "blandine", "huguette"];
    const terminaisonsFeminines =["a", "ia", "na", "ssa", "elle", "ine", "ette", "line"];
    if (prenomsFeminins.includes(prenom) || terminaisonsFeminines.some(fin => prenom.endsWith(fin))) return "ma chère";
    return "mon cher";
}

// Nouvelle fonction pour diversifier les appels
function construireAppelAleatoire(user) {
    const prenom = normaliserNom(user?.nom || "élève").split(" ")[0];
    const genre = genreEleve(prenom);
    const variantes = [
        `**${prenom}**`,
        `**${prenom}**`, 
        `${genre} **${prenom}**`,
        `Dis-moi, **${prenom}**`,
        `Alors **${prenom}**`,
        `Mon ami **${prenom}**`,
        `${prenom}, mon élève`
    ];
    return pick(variantes);
}

function adapterTexteGenre(texte = "", nom = "") {
    const appel = construireAppelAleatoire({nom});
    let t = String(texte || "");
    const regex = /(mon cher élève|ma chère élève|mon élève|cher élève)/i;
    // On ne remplace que la première occurrence
    return t.replace(regex, appel);
}

/* =========================================================
   4) FONCTIONS DE NETTOYAGE SCIENTIFIQUE (TOUT CONSERVÉ)
========================================================= */

function supprimerDoublonsLignes(texte = "") {
    if (!texte) return "";
    const lignes = String(texte).split("\n").map(l => l.trimEnd());
    const resultat =[];
    let precedenteNormalisee = "";
    for (const ligne of lignes) {
        const normalisee = ligne.trim().toLowerCase();
        if (normalisee && normalisee === precedenteNormalisee) continue;
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
    t = t.replace(/^\s*👉\s*\*?\*?\s*\[?OUVERTURE\]?\s*\*?\*?\s*:\s*.*$/gim, "");
    t = supprimerDoublonsLignes(t);
    return t.replace(/\n{3,}/g, "\n\n").trim();
}

function simplifierNotationMath(texte = "") {
    if (!texte) return "";
    let t = String(texte);
    t = t.replace(/\\\[|\\\]|\\\(|\\\)/g, "");
    t = t.replace(/\\times/g, "×").replace(/\\div/g, "/").replace(/\\pm/g, "±");
    t = t.replace(/\\sqrt\{([^}]+)\}/g, "√$1").replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1 / $2");
    t = t.replace(/\^2/g, "²").replace(/\^3/g, "³");
    t = t.replace(/[{}]/g, "");
    t = t.replace(/\bH2O\b/g, "H₂O").replace(/\bCO2\b/g, "CO₂").replace(/\bO2\b/g, "O₂");
    return t;
}

function normaliserBaseScientifique(texte = "") {
    if (!texte) return "";
    let t = String(texte);
    t = t.replace(/\u00A0/g, " ").replace(/[‐-‒–—]/g, "-").replace(/…/g, "...");
    return t.trim();
}

function nettoyerSpecifiqueMath(texte = "") {
    let t = String(texte);
    t = t.replace(/D\s*=\s*b²\s*-\s*4ac/gi, "D = b² - 4ac");
    t = t.replace(/x\s*=\s*\(\s*-b\s*±\s*√D\s*\)\s*\/\s*2a/gi, "x = (-b ± √D) / 2a");
    t = t.replace(/\b([0-9]+)\.([0-9]+)\b/g, "$1,$2");
    return t.trim();
}

function nettoyerSpecifiquePhysique(texte = "") {
    let t = String(texte);
    t = t.replace(/\bv\s*=\s*d\s*\/\s*t\b/gi, "v = d / t");
    t = t.replace(/\bF\s*=\s*m\s*×\s*a\b/g, "F = m × a");
    t = t.replace(/\bcm2\b/g, "cm²").replace(/\bm\/s2\b/g, "m/s²");
    t = t.replace(/\b([0-9]+)\.([0-9]+)\b/g, "$1,$2");
    return t.trim();
}

function nettoyerSpecifiqueChimie(texte = "") {
    let t = String(texte);
    t = t.replace(/\bC\s*=\s*n\s*\/\s*V\b/g, "C = n / V");
    t = t.replace(/\bH2O\b/g, "H₂O").replace(/\bCO2\b/g, "CO₂");
    t = t.replace(/\b([0-9]+)\.([0-9]+)\b/g, "$1,$2");
    return t.trim();
}

function nettoyerSelonMatiere(texte = "", matiere = MATIERE_GENERAL) {
    const base = normaliserBaseScientifique(texte);
    if (matiere === MATIERE_MATH) return nettoyerSpecifiqueMath(base);
    if (matiere === MATIERE_PHYSIQUE) return nettoyerSpecifiquePhysique(base);
    if (matiere === MATIERE_CHIMIE) return nettoyerSpecifiqueChimie(base);
    return base;
}

function reformaterFinalSelonMatiere(texte = "", matiere = MATIERE_GENERAL) {
    let t = String(texte).trim();
    t = t.replace(/Donnée[s]?\s*:/gi, "Données :");
    t = t.replace(/Calcul\s*:/gi, "Calcul :");
    t = t.replace(/Conclusion\s*:/gi, "Conclusion :");
    return t;
}

function detecterMatiereScientifique(question = "", reponse = "", fiche = null) {
    const base = `${question} ${reponse} ${fiche?.matiere || ""}`.toLowerCase();
    if (base.includes("math") || base.includes("équation")) return MATIERE_MATH;
    if (base.includes("physique") || base.includes("force")) return MATIERE_PHYSIQUE;
    if (base.includes("chimie") || base.includes("mol")) return MATIERE_CHIMIE;
    return MATIERE_GENERAL;
}

function appliquerLes4EtapesScientifiques(reponse = "", question = "", fiche = null) {
    const matiere = detecterMatiereScientifique(question, reponse, fiche);
    let texte = simplifierNotationMath(reponse);
    texte = nettoyerSelonMatiere(texte, matiere);
    texte = reformaterFinalSelonMatiere(texte, matiere);
    return { matiere, texte };
}

/* =========================================================
   5) MÉMOIRE ET ÉTATS (TOUT CONSERVÉ)
========================================================= */

function estMessageSalutation(texte = "") {
    const t = String(texte || "").toLowerCase().trim();
    const salutations = ["bonjour", "bonsoir", "salut", "mbote", "bjr", "hello"];
    return salutations.some(s => t.includes(s)) && t.length < 20;
}

function estMessageRemerciement(texte = "") {
    const t = String(texte || "").toLowerCase().trim();
    return t.includes("merci") && t.length < 20;
}

function estMessageRelationnelSimple(texte = "") {
    return estMessageSalutation(texte) || estMessageRemerciement(texte) || ["ok", "d'accord", "dac", "ça va", "bien"].includes(texte.toLowerCase().trim());
}

function verifierStructureMwalimu(corps = "", user = {}, historique =[], question = "") {
    let t = String(corps || "").trim();
    if (t.includes("🔵") && t.includes("🟡") && t.includes("🔴") && t.includes("❓")) return t;
    const prenom = user.nom?.split(" ")[0] || "élève";
    return `🔵 [VÉCU] : Ravi de t'aider sur ce point, **${prenom}**.\n\n🟡 [SAVOIR] :\n${t}\n\n🔴 [INSPIRATION] : Chaque pas en avant est une victoire.\n\n❓ [CONSOLIDATION] : Est-ce que cela te semble clair ?`;
}

/* =========================================================
   6) BASE DE DONNÉES & CRONS (AVEC 7H LUBUMBASHI)
========================================================= */

async function initDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS conversations (
            phone TEXT PRIMARY KEY, nom TEXT DEFAULT '', classe TEXT DEFAULT '', reve TEXT DEFAULT '',
            historique JSONB DEFAULT '[]'::jsonb, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS processed_messages (msg_id TEXT PRIMARY KEY, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE IF NOT EXISTS bibliotheque (id SERIAL PRIMARY KEY, titre TEXT, matiere TEXT, classe TEXT, contenu TEXT, mots_cles TEXT);
    `);
}

async function getUser(phone) { const { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [phone]); return rows[0]; }
async function createUser(phone) { await pool.query("INSERT INTO conversations (phone) VALUES ($1) ON CONFLICT DO NOTHING", [phone]); return getUser(phone); }
async function updateUserField(phone, field, value) { await pool.query(`UPDATE conversations SET ${field}=$1, updated_at=NOW() WHERE phone=$2`, [value, phone]); }

// CRON : RAPPEL MATINAL DE 7H00 LUBUMBASHI
cron.schedule("0 7 * * *", async () => {
    try {
        const { rows } = await pool.query("SELECT phone, nom FROM conversations WHERE nom <> ''");
        for (const u of rows) {
            const appel = construireAppelAleatoire(u);
            const citation = pick(CITATIONS.patriotisme);
            const msg = `${HEADER_MWALIMU}\n\n🔵 [VÉCU] : Bonjour ${appel} ! J'espère que tu as bien dormi.\n\n🟡 [SAVOIR] : Aujourd'hui est une nouvelle chance d'apprendre. Qu'allons-nous réviser ?\n\n🔴 [INSPIRATION] : Ton avenir se construit maintenant.\n\n${citation}`;
            await envoyerWhatsApp(u.phone, msg);
        }
    } catch (e) { console.error("Cron Error:", e); }
}, { timezone: "Africa/Lubumbashi" });

/* =========================================================
   7) IA GEMINI AVEC RECHERCHE WEB (INJECTION)
========================================================= */

async function appelerChatCompletion(messages, user) {
    try {
        const systemFinal = `${SYSTEM_BASE}\n${SYSTEM_HUMAIN}\n${SYSTEM_TUTORAT}\nÉlève: ${user.nom}, Classe: ${user.classe}, Rêve: ${user.reve}.`;
        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash", 
            systemInstruction: systemFinal,
            tools: [{ googleSearch: {} }] // ACTIVATION DE LA RECHERCHE WEB
        });
        const contents = messages.map(m => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
        }));
        const result = await model.generateContent({ contents });
        return result.response.text();
    } catch (e) { return "Désolé, j'ai une petite difficulté. Peux-tu reformuler ?"; }
}

async function consulterBibliotheque(texte) {
    const q = "SELECT * FROM bibliotheque WHERE (contenu ILIKE $1 OR mots_cles ILIKE $1 OR titre ILIKE $1) LIMIT 1";
    const { rows } = await pool.query(q, [`%${texte}%`]);
    return rows[0];
}

/* =========================================================
   8) WHATSAPP ET MÉDIAS (TOUT CONSERVÉ)
========================================================= */

async function envoyerWhatsApp(to, texte) {
    await axios.post(`https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`, {
        messaging_product: "whatsapp", to, text: { body: texte.slice(0, 4000) }
    }, { headers: { Authorization: `Bearer ${TOKEN}` } });
}

async function telechargerMedia(mediaId) {
    const res = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const media = await axios.get(res.data.url, { responseType: "arraybuffer", headers: { Authorization: `Bearer ${TOKEN}` } });
    return { buffer: Buffer.from(media.data), mimeType: media.headers["content-type"] };
}

/* =========================================================
   9) CONSTRUCTION DU MESSAGE FINAL (INJECTION RÈGLE 1/2)
========================================================= */

function construireMessageFinal(user, reponseBrute, historique =[], question = "", fiche = null) {
    const reponseNettoyee = nettoyerReponseIA(reponseBrute);
    const sortieSci = appliquerLes4EtapesScientifiques(reponseNettoyee, question, fiche);
    
    let corps = adapterTexteGenre(sortieSci.texte, user.nom);
    
    if (!estMessageRelationnelSimple(question)) {
        corps = verifierStructureMwalimu(corps, user, historique, question);
    }

    const inclureHeader = Math.random() > 0.5; // Header s'affiche 50% du temps
    const inclureOuverture = Math.random() > 0.3;
    const inclureEncouragement = Math.random() > 0.6;
    const inclureCitation = Math.random() > 0.8;

    let finalStr = "";
    if (inclureHeader) finalStr += HEADER_MWALIMU + "\n\n";
    
    finalStr += corps;

    if (inclureOuverture) finalStr += "\n\n" + adapterTexteGenre(pick(OUVERTURES), user.nom);
    if (inclureEncouragement) finalStr += "\n\n" + pick(MOTS_ENCOURAGEMENT);
    if (inclureCitation) finalStr += "\n\n" + pick(CITATIONS.general);

    return finalStr.trim();
}

/* =========================================================
   10) WEBHOOK PRINCIPAL (LOGIQUE COMPLÈTE)
========================================================= */

function normaliserNom(nom = "") { return nom.trim().replace(/[^\w\sàâäéèêëîïôöùûüç]/gi, ""); }
function nettoyer(t) { return t.replace(/(je m'appelle|mon nom est|je suis)/gi, "").trim(); }

app.post("/webhook", async (req, res) => {
    const val = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = val?.messages?.[0];
    if (!msg) return res.sendStatus(200);
    res.sendStatus(200);

    const from = msg.from;
    try {
        const check = await pool.query("INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT DO NOTHING", [msg.id]);
        if (check.rowCount === 0) return;

        let user = await getUser(from);
        if (!user) {
            await createUser(from);
            return await envoyerWhatsApp(from, "Mbote ! Je suis Mwalimu EdTech. Quel est ton **prénom** ?");
        }

        const texteUtilisateur = msg.text?.body?.trim() || "";

        if (!user.nom) return await updateUserField(from, "nom", normaliserNom(nettoyer(texteUtilisateur))), envoyerWhatsApp(from, `Enchanté ! En quelle **classe** es-tu ?`);
        if (!user.classe) return await updateUserField(from, "classe", texteUtilisateur), envoyerWhatsApp(from, "Quel est ton plus grand **rêve** professionnel ?");
        if (!user.reve) return await updateUserField(from, "reve", texteUtilisateur), envoyerWhatsApp(from, `Super ! Dis-moi, ${construireAppelAleatoire(user)}, que veux-tu travailler aujourd'hui ?`);

        let reponseBrute = "";
        let fiche = null;

        if (msg.type === "text") {
            // 1. Priorité Bibliothèque Locale
            fiche = await consulterBibliotheque(texteUtilisateur);
            const prompt = fiche ? `SOURCE LOCALE: ${fiche.contenu}\nQUESTION: ${texteUtilisateur}` : texteUtilisateur;
            // 2. IA + Recherche Web
            const hist = (safeJsonParse(user.historique, [])).slice(-6);
            reponseBrute = await appelerChatCompletion([...hist, { role: "user", content: prompt }], user);
        } else if (msg.type === "audio") {
            const { buffer, mimeType } = await telechargerMedia(msg.audio.id);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const trans = await model.generateContent(["Transcris ce vocal.", { inlineData: { mimeType, data: buffer.toString("base64") } }]);
            reponseBrute = await appelerChatCompletion([{ role: "user", content: `Transcription : ${trans.response.text()}` }], user);
        } else if (msg.type === "image") {
            const { buffer, mimeType } = await telechargerMedia(msg.image.id);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent(["Analyse cet exercice.", { inlineData: { mimeType, data: buffer.toString("base64") } }]);
            reponseBrute = result.response.text();
        }

        const finalMsg = construireMessageFinal(user, reponseBrute, [], texteUtilisateur, fiche);
        await envoyerWhatsApp(from, finalMsg);

        const newHist = [...(safeJsonParse(user.historique, [])), { role: "user", content: texteUtilisateur || "[media]" }, { role: "assistant", content: reponseBrute }].slice(-10);
        await updateUserField(from, "historique", JSON.stringify(newHist));

    } catch (e) { console.error("Error:", e); }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === VERIFY_TOKEN) return res.send(req.query["hub.challenge"]);
    res.sendStatus(403);
});

(async () => {
    await initDB();
    app.listen(PORT, () => console.log(`✅ Mwalimu Live sur ${PORT}`));
})();
