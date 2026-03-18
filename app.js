
require('dotenv').config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const HEADER_MWALIMU = "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

const CITATIONS = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***"
];

function nettoyerEntree(texte) {
    if (!texte) return "";
    return texte
        .replace(/mon prénom est|je m'appelle|mon nom est|je suis/gi, "")
        .replace(/en classe de|je suis en/gi, "")
        .replace(/mon plus grand rêve professionnel est de devenir|mon plus grand rêve est de devenir|mon rêve est de devenir|je voudrais devenir|je veux devenir|je rêve d'être/gi, "")
        .replace(/[.!]*/g, "").trim();
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WA"); }
}

async function consulterBibliotheque(question) {
    if (!question || question.length < 3) return null;
    try {
        const clean = question.toLowerCase().trim();
        const mots = clean.split(/\s+/).filter(m => m.length > 4);
        const motsCles = mots.map(m => `%${m}%`);
        if (motsCles.length === 0) motsCles.push(`%${clean}%`);

        const res = await pool.query(
            `SELECT contenu FROM bibliotheque_mwalimu
             WHERE unaccent(sujet) ILIKE ANY($1)
             OR unaccent(contenu) ILIKE ANY($1)
             LIMIT 2`, [motsCles]
        );
        return res.rows.length > 0 ? res.rows.map(r => r.contenu).join("\n\n") : null;
    } catch (e) { return null; }
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

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`);
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
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n🔴 Magnifique ! Je t'aiderai à devenir **${reve}**.\n\nPose-moi ta question sur la RDC.`);
        }

        const savoirSQL = await consulterBibliotheque(text);
        const citAleatoire = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
        let historique = JSON.parse(user.historique || "[]");

        const systemPrompt = `Tu es Mwalimu EdTech, MENTOR D'ÉLITE.
        ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}.

        CONSIGNE DE SOURCE :
        - SOURCE OFFICIELLE : ${savoirSQL || "NON_TROUVE"}.
        - Si la SOURCE est présente, tu DOIS citer les chiffres exacts (ex: 100 km/h, Mazuku, OVG, 384m, etc.).
        - Si la SOURCE cite des territoires précis (ex: Nyiragongo, Rutshuru, Masisi), ne cite QUE ceux-là.

        CONSIGNE DE STYLE :
        - Ne fais aucun bavardage avant ou après les sections.
        - Ton message doit COMMENCER par 🔵 [VÉCU] et FINIR par ❓ [CONSOLIDATION].
        - Ne dis pas "Continue à explorer, Dora" ou "🌟". Sois un mentor sérieux.

        STRUCTURE OBLIGATOIRE :
        🔵 [VÉCU] : ...
        🟡 [SAVOIR] : ...
        🔴 [INSPIRATION] : ...
        ❓ [CONSOLIDATION] : ...
       
        PAROLE CHARNIÈRE : (Une seule phrase à la fin pour ouvrir le dialogue)`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-4), { role: "user", content: text }],
            temperature: 0.2, // TRÈS BAS pour éviter que l'IA n'invente
        });

        const reponseIA = completion.choices[0].message.content;
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponseIA });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-10)), from]);

        await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n${reponseIA}\n\n\n${citAleatoire}`);

    } catch (e) { console.error(e); }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

app.listen(process.env.PORT || 10000);
