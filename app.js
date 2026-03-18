
require('dotenv').config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");

const app = express();
app.use(express.json());

// --- CONFIGURATION ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- RÈGLE D'OR : IDENTITÉ VISUELLE & CITATIONS ---
const HEADER_MWALIMU = "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

const CITATIONS = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***",
    "***« Aimer son pays, c'est aussi contribuer à sa force : payer son impôt, c'est bâtir nos propres écoles. »***",
    "***« Le patriotisme n'est pas un sentiment, c'est un acte de bâtisseur. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
    "***« Ne demande pas ce que ton pays peut faire pour toi, mais ce que tu peux faire pour le Congo. »***"
];

// --- OUTILS DE NETTOYAGE ---
function nettoyerEntree(texte) {
    if (!texte) return "";
    return texte
        .replace(/mon prénom est|je m'appelle|mon nom est|je suis/gi, "")
        .replace(/en classe de|je suis en/gi, "")
        .replace(/mon plus grand rêve professionnel est de devenir|mon plus grand rêve est de devenir|mon rêve est de devenir|je voudrais devenir|je veux devenir|je rêve d'être/gi, "")
        .replace(/[.!]*/g, "")
        .trim();
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WA"); }
}

// --- RECHERCHE BIBLIOTHÈQUE OPTIMISÉE (Agressive) ---
async function consulterBibliotheque(question) {
    if (!question || question.length < 3) return null;
    try {
        const clean = question.toLowerCase().trim();
        const mots = clean.split(/\s+/).filter(m => m.length > 4);
       
        // On cherche par mots-clés multiples pour ne rien rater
        const motsCles = mots.map(m => `%${m}%`);
        if (motsCles.length === 0) motsCles.push(`%${clean}%`);

        const res = await pool.query(
            `SELECT contenu FROM bibliotheque_mwalimu
             WHERE unaccent(sujet) ILIKE ANY($1)
             OR unaccent(contenu) ILIKE ANY($1)
             LIMIT 2`,
            [motsCles]
        );

        if (res.rows.length > 0) {
            return res.rows.map(r => r.contenu).join("\n\n");
        }
        return null;
    } catch (e) {
        console.error("Erreur DB:", e.message);
        return null;
    }
}

// --- WEBHOOK ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // 1. INSCRIPTION (Onboarding)
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            const nom = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${nom}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            const classe = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [classe, from]);
            return await envoyerWhatsApp(from, "🟡 C'est noté. Quel est ton plus grand **rêve** professionnel ?");
        }
        if (!user.reve) {
            const reve = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reve, from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔴 Magnifique ! Je t'aiderai à devenir **${reve}**.\n\nPose-moi ta question sur tes cours ou sur la RDC.`);
        }

        // 2. PRÉPARATION DES DONNÉES
        const savoirSQL = await consulterBibliotheque(text);
        const citAleatoire = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
        let historique = JSON.parse(user.historique || "[]");

        // 3. SYSTEM PROMPT (Respect strict de la Règle d'Or)
        const systemPrompt = `Tu es Mwalimu EdTech, mentor d'élite en RDC.
        IDENTITÉ : L'élève est ${user.nom}, en classe de ${user.classe}, son rêve est de devenir ${user.reve}.
        TON IDENTITÉ : Tu es son enseignant. Ne confonds jamais ton nom avec le sien.
       
        SOURCE OFFICIELLE : ${savoirSQL || "Information non répertoriée. Utilise tes connaissances générales sur la RDC."}.

        CONSIGNES DE RÉPONSE :
        1. Ton premier mot doit être "🔵 [VÉCU]".
        2. RÈGLE D'OR : Réponds TOUJOURS en suivant ces sections :
           🔵 [VÉCU] : Anecdote ou lien avec la vie réelle.
           🟡 [SAVOIR] : Utilise EXCLUSIVEMENT les détails précis de la SOURCE OFFICIELLE (ex: Mazuku, 100km/h, territoires fertilisés) si disponibles.
           🔴 [INSPIRATION] : Conseil lié à son rêve de devenir ${user.reve}.
           ❓ [CONSOLIDATION] : Une question de test.
        3. PAROLE CHARNIÈRE : Termine par une phrase chaleureuse pour ouvrir la suite du dialogue.`;

        // 4. APPEL IA
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-6), { role: "user", content: text }],
            temperature: 0.4
        });

        const reponseIA = completion.choices[0].message.content;

        // 5. MISE À JOUR MÉMOIRE
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponseIA });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-10)), from]);

        // 6. ENVOI FINAL
        const messageFinal = `${HEADER_MWALIMU}\n________________________________\n\n${reponseIA}\n\n\n${citAleatoire}`;
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) {
        console.error("Erreur Webhook :", e.message);
        const erreurMsg = `${HEADER_MWALIMU}\n________________________________\n\n🔵 [VÉCU] : Même les plus grands ingénieurs rencontrent des pannes.\n\n🟡 [SAVOIR] : Mon cerveau numérique connaît une petite fatigue technique.\n\n🔴 [INSPIRATION] : La patience est la vertu des bâtisseurs.\n\n❓ Repose ta question dans une minute, je serai de nouveau prêt !`;
        await envoyerWhatsApp(from, erreurMsg);
    }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech opérationnel sur le port ${PORT}`));
