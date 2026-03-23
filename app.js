
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

const CITATIONS = [
    "***« L'éducation est l'arme la plus puissante pour changer le Congo. »***",
    "***« Le savoir d'aujourd'hui est le socle de la souveraineté de demain. »***",
    "***« Un DRC brillant demande des citoyens intègres et instruits. »***",
    "***« La discipline d’aujourd’hui construit la réussite de demain. »***",
    "***« Chaque leçon comprise est une victoire pour ton avenir. »***",
    "***« Le Congo se relèvera aussi par des élèves sérieux et courageux. »***",
    "***« L'éducation Chrétienne de la jeunesse c'est le meilleur apostolat. »***"
];

const OUVERTURES = [
    "👉 Je suis fier de ton effort. Continuons ensemble.",
    "👉 Tu peux avancer pas à pas, et je reste à tes côtés.",
    "👉 Courage, mon cher élève. Nous allons comprendre cela ensemble.",
    "👉 Continue à me parler librement, je suis là pour t'aider."
];

const ACCUEILS = [
    "Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.",
    "Mbote ! Je suis Mwalimu EdTech, heureux de t'accompagner dans tes études.",
    "Mbote ! Je suis Mwalimu EdTech, ton précepteur numérique bienveillant."
];

const MOTS_ENCOURAGEMENT = [
    "🌟 Mot d'encouragement : Chaque effort compte. Continue, tu progresses vraiment.",
    "🌟 Mot d'encouragement : Même les grands mathématiciens avancent étape par étape.",
    "🌟 Mot d'encouragement : Tu n'as pas besoin d'aller vite, tu as besoin d'être régulier.",
    "🌟 Mot d'encouragement : Avec la méthode et la patience, tu peux réussir."
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
- Tu dois obligatoirement respecter l'ordre suivant :
  ACCUEIL, VÉCU, SAVOIR, INSPIRATION, CONSOLIDATION, OUVERTURE, puis MOT D'ENCOURAGEMENT
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
- Si l'élève pose une question d'exercice :
  1. expliquer la méthode
  2. montrer les étapes
  3. inviter l'élève à essayer
  4. corriger ensuite si l'élève donne sa réponse
- Si l'information n'est pas certaine, le dire honnêtement
- Ne pas inventer de référence scolaire ou scientifique
- Pour les maths et sciences, respecter strictement les règles de présentation
- Répondre en français sauf si l'élève change de langue

STRUCTURE SOUHAITÉE :
🔵 [VÉCU]
🟡 [SAVOIR]
🔴 [INSPIRATION]
❓ [CONSOLIDATION]
👉 [OUVERTURE]
🌟 [MOT D'ENCOURAGEMENT]

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

function nettoyerReponseIA(texte = "") {
    if (!texte) return "";

    let t = String(texte);

    t = t.replace(/🔴🟡🔵\s*\*\*Mwalimu EdTech\s*:\s*Ton Mentor pour l'Excellence\*\*\s*🇨🇩/gi, "");
    t = t.replace(/\*\*\*«[^»]+»\*\*\*/g, "");
    t = t.replace(/^\s*🌟\s*\*?\*?\s*\[?MOT D['’]ENCOURAGEMENT\]?\s*\*?\*?\s*:\s*.*$/gim, "");
    t = t.replace(/^\s*🌟\s*Mot d['’]encouragement\s*:\s*.*$/gim, "");
    t = t.replace(/^\s*👉\s*\*?\*?\s*\[?OUVERTURE\]?\s*\*?\*?\s*:\s*.*$/gim, "");
    t = t.replace(/^\s*🔵\s*\*?\*?\[ACCUEIL\]\*?\*?\s*:\s*/gim, "🔵 ");
    t = t.replace(/\n{3,}/g, "\n\n").trim();

    return t;
}

function humaniserDebutReponse(texte = "", user = {}) {
    if (!texte) return "";

    const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";
    const t = String(texte).trim();

    const introNaturelles = [
        `Je te comprends, ${prenom}.`,
        `D'accord, ${prenom}.`,
        `Très bien, ${prenom}.`,
        `Je vois bien ce que tu veux dire, ${prenom}.`,
        `Oui, ${prenom}, c'est une bonne observation.`
    ];

    const contientDejaIntro = /je te comprends|très bien|d'accord|je vois bien|oui,/i.test(t);

    if (contientDejaIntro) return t;

    return `${pick(introNaturelles)}\n\n${t}`.trim();
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
`;
}

async function expliquerFiche(user, fiche, questionEleve, historique = []) {
    const system = construireSystemPrompt(user);

    return appelerChatCompletion([
        { role: "system", content: system },
        { role: "system", content: "Réponds comme un humain chaleureux, jamais comme une machine." },
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

async function repondreSansFiche(user, texte, historique = []) {
    const system = construireSystemPrompt(user);

    return appelerChatCompletion([
        { role: "system", content: system },
        { role: "system", content: "Réponds comme un humain chaleureux, jamais comme une machine." },
        ...historique.slice(-6),
        { role: "user", content: texte }
    ]);
}

async function expliquerImageAvecIA(user, base64Image, mimeType, historique = []) {
    const system = construireSystemPrompt(user);

    return appelerChatCompletion([
        { role: "system", content: system },
        { role: "system", content: "Réponds comme un humain chaleureux, jamais comme une machine." },
        ...historique.slice(-4),
        {
            role: "user",
            content: [
                { type: "text", text: "Analyse cette image d'exercice ou de leçon, explique-la pas à pas à l'élève sans faire brutalement à sa place." },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } }
            ]
        }
    ]);
}

function construireMessageFinal(user, reponseBrute) {
    const citation = pick(CITATIONS);
    const ouverture = adapterTexteGenre(pick(OUVERTURES), user.nom);
    const encouragement = pick(MOTS_ENCOURAGEMENT);

    const reponseNettoyee = nettoyerReponseIA(reponseBrute);
    const reponseHumanisee = humaniserDebutReponse(reponseNettoyee, user);
    const corps = adapterTexteGenre(reponseHumanisee, user.nom);

    return `${HEADER_MWALIMU}

${corps}

${ouverture}

${encouragement}

${citation}`;
}

function messageSecours(user) {
    const appel = `${genreEleve(user?.nom || "élève")} **${normaliserNom(user?.nom || "élève").split(" ")[0]}**`;
    return `${HEADER_MWALIMU}

🔵 J'ai bien reçu ton message, ${appel}.

🟡 Je rencontre un petit souci technique pour traiter ta demande correctement maintenant.

🔴 Réessaie dans un instant, ou reformule ta question plus simplement.

❓ Tu peux aussi m'envoyer une seule question à la fois pour que je t'aide mieux.

👉 Je reste à tes côtés.

🌟 Mot d'encouragement : Même quand cela bloque un peu, on continue avec calme et méthode.`;
}

/* =========================================================
   8) TRAITEMENT PAR TYPE DE MESSAGE
========================================================= */

async function traiterTexte(user, texteUtilisateur, historique) {
    const fiche = await consulterBibliotheque(texteUtilisateur, user.classe || "");
    if (fiche) {
        return expliquerFiche(user, fiche, texteUtilisateur, historique);
    }
    return repondreSansFiche(user, texteUtilisateur, historique);
}

async function traiterAudio(user, msg, historique) {
    const audioId = msg.audio?.id;
    if (!audioId) {
        return "🔵 J'ai bien reçu ton audio.\n\n🟡 Mais je n'arrive pas à l'ouvrir correctement.\n\n👉 Réessaie avec un autre message vocal plus clair.";
    }

    const { buffer, mimeType } = await telechargerMedia(audioId, 8 * 1024 * 1024);
    const transcription = await transcrireAudioAvecIA(buffer, mimeType);

    if (!transcription) {
        return "🔵 J’ai bien reçu ton audio.\n\n🟡 Je n'arrive pas encore à le traiter correctement.\n\n👉 Réessaie avec un message vocal plus clair et sans bruit autour.";
    }

    const fiche = await consulterBibliotheque(transcription, user.classe || "");
    if (fiche) {
        return expliquerFiche(user, fiche, transcription, historique);
    }

    return repondreSansFiche(
        user,
        `L'élève a envoyé un message vocal. Voici la transcription : ${transcription}`,
        historique
    );
}

async function traiterImage(user, msg, historique) {
    const imageId = msg.image?.id;
    if (!imageId) {
        return "🔵 J'ai bien reçu ton image.\n\n🟡 Mais je n'arrive pas à l'ouvrir correctement.\n\n👉 Réessaie en envoyant une image plus nette.";
    }

    const { buffer, mimeType } = await telechargerMedia(imageId, 8 * 1024 * 1024);
    const base64Image = buffer.toString("base64");

    return expliquerImageAvecIA(user, base64Image, mimeType, historique);
}

/* =========================================================
   9) CRON
========================================================= */

cron.schedule("0 7 * * *", async () => {
    try {
        console.log("⏰ Rappel matinal exécuté.");
        // Ici tu pourras plus tard envoyer les rappels pédagogiques ciblés
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
            reponseBrute = `🔵 J'ai bien reçu ton message.

🟡 Pour l'instant, je traite surtout les textes, les audios et les images.

👉 Envoie-moi ta question par écrit, par audio ou avec une image nette de l'exercice.`;
        }

        if (!reponseBrute || !String(reponseBrute).trim()) {
            reponseBrute = "🔵 J'ai bien reçu ta demande.\n\n🟡 Mais je n'ai pas encore pu produire une réponse claire.\n\n👉 Reformule ta question en une seule phrase, et je t'aiderai pas à pas.";
        }

        const messageFinal = construireMessageFinal(user, reponseBrute);
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
