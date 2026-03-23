

require('dotenv').config();
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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

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

EXEMPLES CORRECTS :
- 2x² + 3x
- (x + 2) × (x - 1)
- x² - 4 = 0
- 3/4 + 1/4 = 1
- √16 = 4

INTERDICTIONS :
- N'écris jamais x^2
- N'écris jamais 2*x
- N'utilise pas d'accolades inutiles
- N'utilise pas de crochets inutiles
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
- Pour les puissances, fractions, équations, produits remarquables et calculs littéraux, tu écris de façon propre et lisible sur WhatsApp
- Tu dois obligatoirement respecter l'ordre suivant :
  ACCUEIL,
  VÉCU,
  SAVOIR,
  INSPIRATION,
  CONSOLIDATION,
  OUVERTURE,
  puis MOT D'ENCOURAGEMENT
`;

function verifierSignatureMeta(req) {
    try {
        const appSecret = process.env.APP_SECRET;
        const signature = req.get("x-hub-signature-256");

        if (!appSecret || !signature || !req.rawBody) return false;

        const expectedSignature =
            "sha256=" +
            crypto
                .createHmac("sha256", appSecret)
                .update(req.rawBody)
                .digest("hex");

        const sigBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expectedSignature);

        if (sigBuffer.length !== expectedBuffer.length) return false;

        return crypto.timingSafeEqual(sigBuffer, expectedBuffer);
    } catch (e) {
        console.error("Erreur vérification signature:", e.message);
        return false;
    }
}

function extraireMessageWhatsApp(body) {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    if (!value) return null;

    if (value.statuses?.length) return null;
    if (!value.messages?.length) return null;

    return value.messages[0];
}

function genreEleve(nom = "") {
    const prenom = String(nom || "").trim().toLowerCase();

    const prenomsFemininsConnus = [
        "dora", "marie", "anne", "anna", "annie", "anuarite", "ruth",
        "grace", "esther", "sarah", "debora", "débora", "fatou",
        "chantal", "nadine", "brigitte", "joyce", "elodie", "élodie",
        "mireille", "patience", "rebecca", "rebeca", "prisca", "gloria"
    ];

    if (prenomsFemininsConnus.includes(prenom)) {
        return "mon élève";
    }

    const terminaisonsFeminines = ["a", "ia", "na", "ssa", "elle", "ine", "ette", "line"];
    if (terminaisonsFeminines.some(fin => prenom.endsWith(fin))) {
        return "mon élève";
    }

    return "mon cher élève";
}

function adapterTexteGenre(texte = "", nom = "") {
    const formule = genreEleve(nom);
    if (formule === "mon élève") {
        return texte.replaceAll("mon cher élève", "mon élève");
    }
    return texte;
}

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
            CREATE INDEX IF NOT EXISTS idx_processed_messages_created_at
            ON processed_messages(created_at);
        `);
        console.log("✅ DB prête.");
    } catch (e) {
        console.error("Init DB Error:", e.message);
    }
}
initDB();

cron.schedule('0 7 * * *', async () => {
    try {
        const { rows } = await pool.query("SELECT phone, nom FROM conversations WHERE nom != ''");
        for (const u of rows) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            await envoyerWhatsApp(
                u.phone,
                `${HEADER_MWALIMU}

☀️ Bonjour **${u.nom}** !

Le Congo compte sur toi aujourd’hui. Prépare ton esprit et avance avec confiance.

${cit}`
            );
            await pause(250);
        }
    } catch (e) {
        console.error("Cron Error:", e.message);
    }
}, { timezone: "Africa/Lubumbashi" });

cron.schedule('0 3 * * *', async () => {
    try {
        await pool.query("DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '2 days'");
        console.log("🧹 Nettoyage processed_messages effectué.");
    } catch (e) {
        console.error("Cleanup Error:", e.message);
    }
}, { timezone: "Africa/Lubumbashi" });

function pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function choisirAleatoire(tableau) {
    return tableau[Math.floor(Math.random() * tableau.length)];
}

function choisirMotEncouragement() {
    return MOTS_ENCOURAGEMENT[Math.floor(Math.random() * MOTS_ENCOURAGEMENT.length)];
}

function nettoyer(t) {
    if (!t) return "";
    return t
        .replace(/je m'appelle|mon nom est|mon prénom est|je suis en|ma classe est|mon rêve est|je veux devenir/gi, "")
        .replace(/^devenir\s+/i, "")
        .replace(/^être\s+/i, "")
        .replace(/[.,!?;: ]+/g, " ")
        .trim();
}

function estQuestionTechnique(texte = "") {
    const t = texte.toLowerCase();
    const mots = [
        "calcule", "calculer", "résous", "resous", "résoudre", "équation", "equation",
        "fraction", "produit", "somme", "soustraction", "multiplication", "division",
        "physique", "chimie", "mécanique", "mecanique", "force", "vitesse",
        "accélération", "acceleration", "masse", "énergie", "energie", "courant",
        "tension", "mole", "solution", "exercice", "problème", "probleme", "formule",
        "algèbre", "algebre", "géométrie", "geometrie", "triangle", "carré", "carre",
        "rectangle", "puissance", "racine", "racine carrée", "pourcentage"
    ];
    return mots.some(m => t.includes(m));
}

function extensionDepuisMime(mimeType = "") {
    const map = {
        "audio/ogg": ".ogg",
        "audio/opus": ".ogg",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/mp4": ".mp4",
        "audio/m4a": ".m4a",
        "audio/aac": ".aac",
        "audio/amr": ".amr",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/webm": ".webm"
    };
    return map[mimeType] || ".ogg";
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to,
                text: { body: texte }
            },
            {
                headers: { Authorization: `Bearer ${process.env.TOKEN}` },
                timeout: 10000
            }
        );
    } catch (e) {
        console.error("Erreur WA:", e.response?.data || e.message);
    }
}

async function transcrireAudioAvecIA(audioBuffer, mimeType = "audio/ogg") {
    let tempPath = null;

    try {
        const extension = extensionDepuisMime(mimeType);
        tempPath = path.join(os.tmpdir(), `mwalimu-audio-${Date.now()}${extension}`);

        await fs.promises.writeFile(tempPath, audioBuffer);

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempPath),
            model: "whisper-1",
            language: "fr",
            response_format: "json"
        });

        return transcription?.text?.trim() || "";
    } catch (e) {
        console.error("Erreur transcription audio:", e.message);
        return "";
    } finally {
        if (tempPath) {
            try {
                await fs.promises.unlink(tempPath);
            } catch {}
        }
    }
}

async function consulterBibliotheque(question) {
    if (!question) return null;

    try {
        const mots = question.toLowerCase().split(/\s+/).filter(m => m.length > 2);
        const search = mots.length ? mots.map(m => `%${m}%`) : [`%${question}%`];

        const res = await pool.query(
            `SELECT sujet, contenu
             FROM bibliotheque_mwalimu
             WHERE unaccent(sujet) ILIKE ANY($1)
                OR unaccent(contenu) ILIKE ANY($1)
             ORDER BY (unaccent(sujet) ILIKE ANY($1)) DESC
             LIMIT 1`,
            [search]
        );

        return res.rows[0] || null;
    } catch (e) {
        console.error("Erreur SQL:", e.message);
        return null;
    }
}

async function expliquerFiche(user, fiche, questionEleve) {
    const technique = estQuestionTechnique(questionEleve);
    const appelEleve = genreEleve(user.nom);

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
            {
                role: "system",
                content: `
Tu es Mwalimu EdTech, un précepteur congolais chaleureux, rassurant, exigeant et humain.

RÈGLE D'OR ABSOLUE :
- Tu expliques uniquement la fiche.
- Tu ne modifies aucun fait.
- Tu n'ajoutes aucun territoire, ville, chiffre, date ou élément absent de la fiche.
- Si une liste existe dans la fiche, tu ne la réécris pas autrement.
- Tu peux expliquer et illustrer, mais sans changer les faits.

STYLE :
- L'élève doit se sentir accueilli, écouté, apprécié et encouragé.
- Ton ton doit être naturel, clair, vivant et bienveillant.
- Adresse-toi à l'élève avec cette formule : ${appelEleve}
- Si le prénom semble féminin, évite absolument l'expression "mon cher élève" et utilise plutôt "mon élève".

ADAPTATION :
- ÉLÈVE : ${user.nom}
- CLASSE : ${user.classe}
- RÊVE : ${user.reve}

${technique ? `
CONSIGNE TECHNIQUE SUPPLÉMENTAIRE :
- La question de l'élève est technique ou pratique.
- Sois particulièrement attentif à la démarche étape par étape.
- N'offre pas une correction brute.
- Explique la méthode.
- Donne une piste claire.
- Invite l'élève à essayer lui-même.
- Si tu utilises une formule, explique à quoi elle sert.
- Quand tu écris des expressions mathématiques, respecte strictement le format mathématique propre pour WhatsApp.

${REGLE_CALCUL_INTELLIGENT}
` : ""}

STRUCTURE OBLIGATOIRE :
🔵 [ACCUEIL] : adresse l'élève par son prénom avec chaleur.
🔵 [VÉCU] : lien simple avec son quotidien.
🟡 [SAVOIR] : explication fidèle de la fiche.
🔴 [INSPIRATION] : encouragement lié à son rêve.
❓ [CONSOLIDATION] : question courte et intelligente.
👉 [OUVERTURE] : phrase humaine et motivante.
🌟 [MOT D'ENCOURAGEMENT] : termine par un court mot d'encouragement.

${REGLE_FORMAT_MATH}
                `.trim()
            },
            {
                role: "user",
                content: `
QUESTION DE L'ÉLÈVE :
${questionEleve}

FICHE OFFICIELLE :
SUJET : ${fiche.sujet}

CONTENU EXACT :
${fiche.contenu}
                `.trim()
            }
        ]
    });

    return completion.choices[0].message.content?.trim() || "Je n'ai pas pu expliquer correctement la fiche.";
}

async function repondreSansFiche(user, texte, historique) {
    const technique = estQuestionTechnique(texte);
    const appelEleve = genreEleve(user.nom);

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
            {
                role: "system",
                content: `
Tu es Mwalimu EdTech, un précepteur congolais bienveillant, humain et pédagogique.

RÈGLES :
- Si tu n'es pas sûr, dis-le clairement.
- N'invente pas de faits précis.
- Adresse-toi à ${user.nom}, qui rêve de devenir ${user.reve}.
- Adapte ton langage au niveau de la classe ${user.classe}.
- Utilise la formule suivante pour t'adresser à l'élève : ${appelEleve}
- Si le prénom semble féminin, n'utilise jamais "mon cher élève", mais "mon élève".

${technique ? `
CONSIGNE TECHNIQUE :
- La question est technique ou pratique.
- Tu dois guider sans donner directement toute la réponse finale.
- Explique la méthode étape par étape.
- Donne un exemple proche.
- Puis invite l'élève à essayer lui-même.
- Corrige avec douceur, jamais brutalement.
- Quand tu écris des mathématiques, utilise un affichage très propre et simple pour WhatsApp.
- Pour les calculs, sois plus rigoureux qu'un assistant ordinaire : vérifie chaque opération avant de répondre.
- N'écris jamais une étape mathématique sans l'avoir vérifiée.

${REGLE_CALCUL_INTELLIGENT}
` : `
CONSIGNE GÉNÉRALE :
- Réponds simplement, clairement et humainement.
- Mets l'élève à l'aise et donne envie de continuer l'échange.
`}

STRUCTURE OBLIGATOIRE :
🔵 [ACCUEIL]
🔵 [VÉCU]
🟡 [SAVOIR]
🔴 [INSPIRATION]
❓ [CONSOLIDATION]
👉 [OUVERTURE]
🌟 [MOT D'ENCOURAGEMENT]

${REGLE_FORMAT_MATH}
                `.trim()
            },
            ...historique.slice(-4),
            { role: "user", content: texte }
        ]
    });

    return completion.choices[0].message.content?.trim() || "Je n'ai pas pu répondre correctement.";
}

async function expliquerImageAvecIA(user, base64Image, mimeType = "image/jpeg") {
    const appelEleve = genreEleve(user.nom);

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
            {
                role: "system",
                content: `
Tu es Mwalimu EdTech, précepteur congolais rigoureux, humain et bienveillant.

RÈGLE CRITIQUE ABSOLUE :
- Tu dois TOUJOURS commencer par lire et recopier fidèlement l'exercice ou le texte visible sur l'image.
- Tu ne passes JAMAIS directement à l'explication.
- Tu ne modifies aucun chiffre, symbole, mot, donnée ou unité visible.
- Si l'image contient un exercice, tu guides l'élève sans donner directement la réponse finale.
- Si l'image est floue ou partiellement illisible, tu le dis clairement sans inventer.
- Utilise la formule suivante pour t'adresser à l'élève : ${appelEleve}
- Si le prénom semble féminin, n'utilise jamais "mon cher élève", mais "mon élève".

ADAPTATION :
- Élève : ${user.nom || "mon élève"}
- Classe : ${user.classe || "niveau inconnu"}
- Rêve : ${user.reve || "grand professionnel"}

ORDRE STRICT À RESPECTER :

📝 [LECTURE] :
- Recopie exactement l'énoncé ou le texte visible sur l'image.
- Respecte les nombres, signes, unités et formulations.
- Si une partie est illisible, écris exactement : "Une partie de l'exercice est illisible".

🔵 [ACCUEIL] :
- Accueille l'élève avec chaleur.

🔵 [VÉCU] :
- Fais un lien simple avec son quotidien ou sa manière d'apprendre.

🟡 [SAVOIR] :
- Explique simplement ce que demande l'exercice ou ce que montre l'image.

🧠 [MÉTHODE] :
- Donne la démarche étape par étape.
- N'apporte PAS la solution finale.
- Guide l'élève pour qu'il travaille lui-même.
- Si tu écris des mathématiques, elles doivent être propres, simples et lisibles sur WhatsApp.

🔴 [INSPIRATION] :
- Encourage l'élève en lien avec son rêve.

❓ [CONSOLIDATION] :
- Pose une petite question pour vérifier sa compréhension.

👉 [OUVERTURE] :
- Termine par une phrase humaine et chaleureuse.

🌟 [MOT D'ENCOURAGEMENT] :
- Termine par un court mot d'encouragement.

INTERDICTIONS :
- Ne saute jamais [LECTURE].
- Ne donne jamais la réponse directe.
- N'invente rien.
- Si le texte est illisible, ne suppose pas.

${REGLE_CALCUL_INTELLIGENT}
${REGLE_FORMAT_MATH}
                `.trim()
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Lis cette photo, recopie d'abord fidèlement le contenu visible, puis explique la méthode sans donner la réponse finale. Respecte obligatoirement l'ordre : Accueil, Vécu, Savoir, Inspiration, Consolidation, Ouverture, puis Mot d'encouragement."
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:${mimeType};base64,${base64Image}`
                        }
                    }
                ]
            }
        ]
    });

    return completion.choices[0].message.content?.trim() || "Je n'ai pas pu analyser correctement l'image.";
}

app.post("/webhook", async (req, res) => {
    if (!verifierSignatureMeta(req)) {
        console.warn("⛔ Requête rejetée : signature invalide.");
        return res.sendStatus(403);
    }

    const msg = extraireMessageWhatsApp(req.body);
    if (!msg) {
        return res.sendStatus(200);
    }

    res.sendStatus(200);

    const image = msg.image;
    const audio = msg.audio;
    const from = msg.from;
    let texteUtilisateur = msg.text?.body || "";
    const msgId = msg.id;

    try {
        if (!from || !msgId) return;

        if (msgId) {
            const check = await pool.query(
                "INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT DO NOTHING",
                [msgId]
            );
            if (check.rowCount === 0) return;
        }

        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        if (!user) {
            await pool.query(
                "INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1,'','','','[]')",
                [from]
            );
            return envoyerWhatsApp(
                from,
                `${HEADER_MWALIMU}

🔵 ${choisirAleatoire(ACCUEILS)}

🟡 Quel est ton **prénom** ?`
            );
        }

        if (!user.nom) {
            const nom = nettoyer(texteUtilisateur);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return envoyerWhatsApp(
                from,
                `🤝 Enchanté **${nom}** ! Je suis heureux de faire ta connaissance.

🟡 En quelle **classe** es-tu ?`
            );
        }

        if (!user.classe) {
            const cl = nettoyer(texteUtilisateur);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [cl, from]);
            return envoyerWhatsApp(
                from,
                `🟡 C'est bien noté, **${user.nom}**.

🔵 La classe de **${cl}** demande de la régularité et du courage.

❓ Quel est ton plus grand **rêve** professionnel ?`
            );
        }

        if (!user.reve) {
            const rv = nettoyer(texteUtilisateur);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [rv, from]);
            return envoyerWhatsApp(
                from,
                `🔴 Magnifique ! Devenir **${rv}** est une belle ambition.

🔵 Je serai à tes côtés pour t'aider à progresser avec méthode et confiance.

👉 Pose-moi maintenant ta question.`
            );
        }

        let historique = [];
        try {
            historique = JSON.parse(user.historique || "[]");
        } catch {
            historique = [];
        }

        if (audio?.id) {
            try {
                const media = await axios.get(
                    `https://graph.facebook.com/v18.0/${audio.id}`,
                    {
                        headers: { Authorization: `Bearer ${process.env.TOKEN}` },
                        timeout: 10000
                    }
                );

                const mediaUrl = media.data.url;

                const audioFile = await axios.get(mediaUrl, {
                    headers: { Authorization: `Bearer ${process.env.TOKEN}` },
                    responseType: "arraybuffer",
                    timeout: 20000
                });

                const mimeType = audio.mime_type || "audio/ogg";
                const audioBuffer = Buffer.from(audioFile.data);

                const transcription = await transcrireAudioAvecIA(audioBuffer, mimeType);

                if (!transcription) {
                    return envoyerWhatsApp(
                        from,
                        `${HEADER_MWALIMU}

🎤 J’ai bien reçu ton audio.

🟡 Je n’ai pas pu bien comprendre la voix.
👉 Parle un peu plus lentement, dans un endroit calme, puis renvoie l’audio.`
                    );
                }

                texteUtilisateur = transcription;

                const nouvelHistoriqueAudio = JSON.stringify([
                    ...historique,
                    { role: "user", content: `[Audio] ${texteUtilisateur}` }
                ].slice(-10));

                await pool.query(
                    "UPDATE conversations SET historique=$1 WHERE phone=$2",
                    [nouvelHistoriqueAudio, from]
                );

                historique = JSON.parse(nouvelHistoriqueAudio);
            } catch (e) {
                console.error("Erreur audio:", e.response?.data || e.message);
                return envoyerWhatsApp(
                    from,
                    `${HEADER_MWALIMU}

🎤 J’ai bien reçu ton audio.

🟡 Je rencontre une difficulté pour le lire correctement.
👉 Réessaie avec un audio plus court, plus clair et sans bruit autour de toi.`
                );
            }
        }

        if (image?.id) {
            try {
                const media = await axios.get(
                    `https://graph.facebook.com/v18.0/${image.id}`,
                    {
                        headers: { Authorization: `Bearer ${process.env.TOKEN}` },
                        timeout: 10000
                    }
                );

                const mediaUrl = media.data.url;

                const imgBuffer = await axios.get(mediaUrl, {
                    headers: { Authorization: `Bearer ${process.env.TOKEN}` },
                    responseType: "arraybuffer",
                    timeout: 15000
                });

                const mimeType = image.mime_type || "image/jpeg";
                const base64Image = Buffer.from(imgBuffer.data).toString("base64");

                const explicationImageBrute = await expliquerImageAvecIA(user, base64Image, mimeType);
                const explicationImage = adapterTexteGenre(explicationImageBrute, user.nom);

                const nouvelHistorique = JSON.stringify([
                    ...historique,
                    { role: "user", content: "[Image envoyée]" },
                    { role: "assistant", content: explicationImage }
                ].slice(-10));

                await pool.query(
                    "UPDATE conversations SET historique=$1 WHERE phone=$2",
                    [nouvelHistorique, from]
                );

                return envoyerWhatsApp(
                    from,
                    `${HEADER_MWALIMU}

📸 J’ai bien reçu ton image.

${explicationImage}

${adapterTexteGenre(choisirAleatoire(OUVERTURES), user.nom)}
${choisirMotEncouragement()}`
                );
            } catch (e) {
                console.error("Erreur image:", e.response?.data || e.message);
                return envoyerWhatsApp(
                    from,
                    `${HEADER_MWALIMU}

🔵 [ACCUEIL] : J'ai bien vu que tu as envoyé une image.
📝 [LECTURE] : Je n'arrive pas encore à lire correctement son contenu.
🟡 [SAVOIR] : L'image est peut-être floue, sombre ou mal cadrée.
👉 [OUVERTURE] : Envoie une photo plus claire, bien cadrée et bien éclairée.`
                );
            }
        }

        const fiche = await consulterBibliotheque(texteUtilisateur);

        if (fiche) {
            await envoyerWhatsApp(
                from,
                `${HEADER_MWALIMU}

${audio?.id ? `🎤 **TON AUDIO TRANSCRIT :** ${texteUtilisateur}\n\n` : ""}📚 **FICHE OFFICIELLE : ${fiche.sujet}**

${fiche.contenu}`
            );

            const explicationBrute = await expliquerFiche(user, fiche, texteUtilisateur);
            const explication = adapterTexteGenre(explicationBrute, user.nom);

            const nouvelHistorique = JSON.stringify([
                ...historique,
                { role: "user", content: texteUtilisateur },
                { role: "assistant", content: explication }
            ].slice(-10));

            await pool.query(
                "UPDATE conversations SET historique=$1 WHERE phone=$2",
                [nouvelHistorique, from]
            );

            return envoyerWhatsApp(
                from,
                `🎓 **EXPLICATION DE MWALIMU**

${explication}

${choisirAleatoire(CITATIONS)}
${choisirMotEncouragement()}`
            );
        }

        const reponseLibreBrute = await repondreSansFiche(user, texteUtilisateur, historique);
        const reponseLibre = adapterTexteGenre(reponseLibreBrute, user.nom);

        const nouvelHistorique = JSON.stringify([
            ...historique,
            { role: "user", content: texteUtilisateur },
            { role: "assistant", content: reponseLibre }
        ].slice(-10));

        await pool.query(
            "UPDATE conversations SET historique=$1 WHERE phone=$2",
            [nouvelHistorique, from]
        );

        return envoyerWhatsApp(
            from,
            `${HEADER_MWALIMU}

${audio?.id ? `🎤 **J'ai compris ton audio comme ceci :** ${texteUtilisateur}\n\n` : ""}${reponseLibre}

${adapterTexteGenre(choisirAleatoire(OUVERTURES), user.nom)}
${choisirMotEncouragement()}`
        );

    } catch (e) {
        console.error("Erreur générale:", e.response?.data || e.message);
        await envoyerWhatsApp(
            from,
            `${HEADER_MWALIMU}

🔵 [ACCUEIL] : Je suis toujours là pour toi.
🟡 [SAVOIR] : Je rencontre juste une petite difficulté technique.
👉 [OUVERTURE] : Repose ta question dans une minute, et nous reprendrons ensemble.`
        );
    }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
        res.send(req.query["hub.challenge"]);
    } else {
        res.sendStatus(403);
    }
});

app.listen(process.env.PORT || 10000, () => {
    console.log("Mwalimu en marche.");
});
