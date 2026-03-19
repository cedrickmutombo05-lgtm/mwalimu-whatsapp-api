
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
    "***« Le patriotisme n'est pas un sentiment, c'est un acte de bâtisseur. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***"
];

// --- OUTILS DE NETTOYAGE AVANCÉ ---
function nettoyerEntree(texte) {
    if (!texte) return "";
    // On retire toutes les formulations courantes pour ne garder que l'essentiel (le nom, la classe ou le métier)
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
    } catch (e) { console.error("Erreur WA :", e.message); }
}

// --- RECHERCHE BIBLIOTHÈQUE ---
async function consulterBibliotheque(question) {
    if (!question || question.length < 3) return null;
    try {
        const clean = question.toLowerCase().trim();
        const mots = clean.split(/\s+/).filter(m => m.length > 4);
        const motCle = mots.length > 0 ? `%${mots[mots.length - 1]}%` : `%${clean}%`;
        const res = await pool.query(
            "SELECT contenu FROM bibliotheque_mwalimu WHERE unaccent(sujet) ILIKE unaccent($1) OR unaccent(contenu) ILIKE unaccent($1) LIMIT 1",
            [motCle]
        );
        return res.rows[0]?.contenu || null;
    } catch (e) { return null; }
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

        // 1. SEQUENCE D'INSCRIPTION (Onboarding)
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
            const reve = nettoyerEntree(text); // Ici, on extrait juste "Avocate"
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reve, from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔴 Magnifique ! Je t'aiderai à devenir **${reve}**.\n\nPose-moi maintenant ta première question sur tes cours ou sur la RDC.`);
        }

        // 2. RÉPONSE AUX QUESTIONS (IA)
        const savoirSQL = await consulterBibliotheque(text);
        const citAleatoire = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
        let historique = JSON.parse(user.historique || "[]");

        const systemPrompt = `Tu es Mwalimu EdTech, mentor d'élite. Élève: ${user.nom}, Classe: ${user.classe}, Rêve: ${user.reve}.
        SOURCE : ${savoirSQL || "Connaissances générales"}.
        STRUCTURE : 🔵 [VÉCU], 🟡 [SAVOIR], 🔴 [INSPIRATION], ❓ [CONSOLIDATION].
        Ajoute une PAROLE CHARNIÈRE chaleureuse avant de finir.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-6), { role: "user", content: text }],
            temperature: 0.5
        });

        const reponseIA = completion.choices[0].message.content;
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponseIA });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-10)), from]);

        await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n${reponseIA}\n\n\n${citAleatoire}`);

    } catch (e) {
        // --- GESTION DES ERREURS : MWALIMU NE RESTE PLUS MUET ---
        console.error("Erreur critique :", e.message);
        const messageErreur = `${HEADER_MWALIMU}\n________________________________\n\n🔵 [VÉCU] : Même les plus grands ingénieurs rencontrent parfois des pannes techniques.\n\n🟡 [SAVOIR] : Mon cerveau numérique est un peu fatigué par une surcharge de données à l'instant.\n\n🔴 [INSPIRATION] : Ne baisse pas les bras, un bâtisseur du Congo reste patient. \n\n❓ Repose ta question dans une minute, je serai de nouveau prêt pour toi.\n\n________________________________\n***« L'excellence n'est pas une action, c'est une habitude. »***`;
        await envoyerWhatsApp(from, messageErreur);
    }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

app.listen(process.env.PORT || 10000);
