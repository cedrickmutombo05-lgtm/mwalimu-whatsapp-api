
require('dotenv').config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");

const app = express();
app.use(express.json({ limit: "1mb" }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const HEADER_MWALIMU = "🔴🟡🔵 **Mwalimu EdTech : Ton Mentor pour l'Excellence** 🇨🇩";

const CITATIONS = [
    "***« L'éducation est l'arme la plus puissante pour changer le Congo. »***",
    "***« Le savoir d'aujourd'hui est le socle de la souveraineté de demain. »***",
    "***« Un DRC brillant demande des citoyens intègres et instruits. »***"
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

// --- INITIALISATION DB ---
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

// --- CRON : RAPPEL DU MATIN ---
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

// --- CRON : NETTOYAGE ANTI-DOUBLON ---
cron.schedule('0 3 * * *', async () => {
    try {
        await pool.query("DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '2 days'");
        console.log("🧹 Nettoyage processed_messages effectué.");
    } catch (e) {
        console.error("Cleanup Error:", e.message);
    }
}, { timezone: "Africa/Lubumbashi" });

// --- OUTILS ---
function pause(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function choisirAleatoire(tableau) {
    return tableau[Math.floor(Math.random() * tableau.length)];
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
        "tension", "mole", "solution", "exercice", "problème", "probleme", "formule"
    ];
    return mots.some(m => t.includes(m));
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

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.25,
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
` : ""}

STRUCTURE OBLIGATOIRE :
🔵 [ACCUEIL] : adresse l'élève par son prénom avec chaleur.
🔵 [VÉCU] : lien simple avec son quotidien.
🟡 [SAVOIR] : explication fidèle de la fiche.
🔴 [INSPIRATION] : encouragement lié à son rêve.
❓ [CONSOLIDATION] : question courte et intelligente.
👉 [OUVERTURE] : phrase humaine et motivante.
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

    return completion.choices[0].message.content;
}

async function repondreSansFiche(user, texte, historique) {
    const technique = estQuestionTechnique(texte);

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.25,
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

${technique ? `
CONSIGNE TECHNIQUE :
- La question est technique ou pratique.
- Tu dois guider sans donner directement toute la réponse finale.
- Explique la méthode étape par étape.
- Donne un exemple proche.
- Puis invite l'élève à essayer lui-même.
- Corrige avec douceur, jamais brutalement.
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
                `.trim()
            },
            ...historique.slice(-4),
            { role: "user", content: texte }
        ]
    });

    return completion.choices[0].message.content;
}

// --- AJOUT IMAGE : EXPLICATION D'UN EXERCICE EN PHOTO ---
async function expliquerImageAvecIA(user, base64Image) {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.25,
        messages: [
            {
                role: "system",
                content: `
Tu es Mwalimu EdTech, un précepteur congolais bienveillant, humain et pédagogique.

RÈGLES :
- Tu analyses l'image reçue.
- Si c'est un exercice, tu guides l'élève sans donner directement la réponse finale.
- Tu expliques la méthode étape par étape.
- Tu peux relever les données visibles sur l'image.
- Si l'image est floue ou illisible, dis-le clairement.
- Tu encourages l'élève à essayer lui-même.
- Adresse-toi à ${user.nom || "mon cher élève"}, en adaptant ton langage au niveau ${user.classe || "de l'élève"}.
- L'élève rêve de devenir ${user.reve || "un grand professionnel"}.

STRUCTURE OBLIGATOIRE :
🔵 [ACCUEIL]
🔵 [VÉCU]
🟡 [SAVOIR]
🔴 [INSPIRATION]
❓ [CONSOLIDATION]
👉 [OUVERTURE]
                `.trim()
            },
            {
                role: "user",
                content: [
                    { type: "text", text: "Analyse cette image et explique-la à l'élève sans donner directement la réponse finale si c'est un exercice." },
                    {
                        type: "image_url",
                        image_url: {
                            url: `data:image/jpeg;base64,${base64Image}`
                        }
                    }
                ]
            }
        ]
    });

    return completion.choices[0].message.content;
}

// --- WEBHOOK ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);

    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return;

    const image = msg.image;
    const from = msg.from;
    const text = msg.text?.body || "";
    const msgId = msg.id;

    try {
        // --- ANTI-DOUBLON ---
        if (msgId) {
            const check = await pool.query(
                "INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT DO NOTHING",
                [msgId]
            );
            if (check.rowCount === 0) return;
        }

        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // --- INSCRIPTION ---
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
            const nom = nettoyer(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return envoyerWhatsApp(
                from,
                `🤝 Enchanté **${nom}** ! Je suis heureux de faire ta connaissance.

🟡 En quelle **classe** es-tu ?`
            );
        }

        if (!user.classe) {
            const cl = nettoyer(text);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [cl, from]);
            return envoyerWhatsApp(
                from,
                `🟡 C'est bien noté, **${user.nom}**.

🔵 La classe de **${cl}** demande de la régularité et du courage.

❓ Quel est ton plus grand **rêve** professionnel ?`
            );
        }

        if (!user.reve) {
            const rv = nettoyer(text);
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

        // --- AJOUT IMAGE ---
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

                const explicationImage = await expliquerImageAvecIA(user, base64Image, mimeType);

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

${choisirAleatoire(OUVERTURES)}`
                );
            } catch (e) {
                console.error("Erreur image:", e.message);
                return envoyerWhatsApp(
                    from,
                    `${HEADER_MWALIMU}

🔵 [ACCUEIL] : J'ai bien vu que tu as envoyé une image.
🟡 [SAVOIR] : Je n'arrive pas encore à la lire correctement.
👉 [OUVERTURE] : Envoie une photo plus claire, bien cadrée et bien éclairée.`
                );
            }
        }

        // --- DB D'ABORD ---
        const fiche = await consulterBibliotheque(text);

        if (fiche) {
            await envoyerWhatsApp(
                from,
                `${HEADER_MWALIMU}

📚 **FICHE OFFICIELLE : ${fiche.sujet}**

${fiche.contenu}`
            );

            const explication = await expliquerFiche(user, fiche, text);

            const nouvelHistorique = JSON.stringify([
                ...historique,
                { role: "user", content: text },
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

${choisirAleatoire(CITATIONS)}`
            );
        }

        // --- PAS DE FICHE : IA GUIDÉE ---
        const reponseLibre = await repondreSansFiche(user, text, historique);

        const nouvelHistorique = JSON.stringify([
            ...historique,
            { role: "user", content: text },
            { role: "assistant", content: reponseLibre }
        ].slice(-10));

        await pool.query(
            "UPDATE conversations SET historique=$1 WHERE phone=$2",
            [nouvelHistorique, from]
        );

        return envoyerWhatsApp(
            from,
            `${HEADER_MWALIMU}

${reponseLibre}

${choisirAleatoire(OUVERTURES)}`
        );

    } catch (e) {
        console.error("Erreur générale:", e.message);
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
