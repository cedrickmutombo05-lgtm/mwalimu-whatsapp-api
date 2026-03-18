
require('dotenv').config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const HEADER_MWALIMU = "🔴🟡🔵 **Mwalimu EdTech** 🇨🇩";

// Nettoie le nom pour ne garder que le prénom (ex: "Dora" au lieu de "Mon nom est Dora")
function extrairePrenom(texte) {
    return texte.replace(/mon prénom est|je m'appelle|mon nom est|je suis|bonjour|mbote|jambo/gi, "").replace(/[.!]*/g, "").trim().split(" ")[0];
}

async function consulterBibliotheque(question) {
    if (!question || question.length < 3) return null;
    try {
        const mots = question.toLowerCase().split(/\s+/).filter(m => m.length > 3);
        const motCle = mots.length > 0 ? `%${mots[mots.length - 1]}%` : `%${question.trim().toLowerCase()}%`;
        const res = await pool.query(
            "SELECT description_tuteur FROM entites_administratives WHERE nom_entite ILIKE $1 OR description_tuteur ILIKE $1 LIMIT 1",
            [motCle]
        );
        return res.rows[0]?.description_tuteur || null;
    } catch (e) { return null; }
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur d'envoi"); }
}

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // 1. PHASE D'ACCUEIL (Humaine)
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique) VALUES ($1, '', '[]')", [from]);
            return await envoyerWhatsApp(from, `🔴🟡🔵 **Mbote !**\n\nJe suis **Mwalimu EdTech**, ton mentor pour t'accompagner vers l'excellence.\n\nPour commencer notre aventure, dis-moi : quel est ton **prénom** ?`);
        }

        if (!user.nom) {
            const prenom = extrairePrenom(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [prenom, from]);
            return await envoyerWhatsApp(from, `Enchanté **${prenom}** ! 🤝\n\nJe suis désormais ton précepteur personnel. Pose-moi n'importe quelle question sur tes cours, sur une province ou sur l'histoire de notre beau pays. Je t'écoute !`);
        }

        // 2. RECHERCHE ET MÉMOIRE
        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        // 3. PROMPT DE PERSONNALITÉ (L'Enseignant Congolais)
        const systemPrompt = `Tu es Mwalimu EdTech, un enseignant et mentor d'élite de la RDC.
        Ton élève s'appelle ${user.nom}.
       
        TON TON :
        - Chaleureux, paternel/fraternel, très encourageant.
        - Utilise le "tu".
        - Tu es fier du Congo et tu pousses l'élève vers l'excellence.
        - Tu ne parles pas comme un robot, mais comme un professeur qui explique au tableau.

        TES DONNÉES (Utilise-les naturellement dans ton explication) :
        ${savoirSQL || "Utilise tes connaissances générales sur la RDC si le sujet n'est pas précisé ici."}

        STRUCTURE DE TON DISCOURS :
        - Salue-le avec un mot local (Mbote, Jambo, Moyo...) suivi de son prénom.
        - 🔵 [Le Vécu] : Explique pourquoi ce sujet est important dans la vie réelle ou en RDC.
        - 🟡 [Le Savoir] : Enseigne la notion avec clarté. Si tu as des données sur une province, cite-les avec précision.
        - 🔴 [L'Inspiration] : Donne-lui un conseil pour son futur ou une leçon de patriotisme.
        - ❓ [Le Test] : Pose-lui une question pour voir s'il a compris.`;

        // 4. GÉNÉRATION DE LA RÉPONSE
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                ...historique.slice(-6),
                { role: "user", content: text }
            ],
            temperature: 0.7 // Un peu plus élevé pour être moins "robot"
        });

        const reponseIA = completion.choices[0].message.content;

        // 5. SAUVEGARDE ET ENVOI
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponseIA });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-10)), from]);

        const messageFinal = `${HEADER_MWALIMU}\n________________________________\n\n${reponseIA}`;
       
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) { console.error(e); }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

app.listen(process.env.PORT || 10000);
