
const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const { Pool } = require("pg");
require("dotenv").config();

const app = express().use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// RÈGLE D'OR : Italique, boules au début, drapeau à la fin, signature sacrée
const HEADER = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »"
];

const safeParseHistory = (historyStr) => {
    try {
        const parsed = JSON.parse(historyStr || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
};

async function sendWhatsApp(to, bodyText) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            { messaging_product: "whatsapp", to, text: { body: bodyText } },
            { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
        );
    } catch (e) { console.error("Erreur WhatsApp :", e.message); }
}

/* --- 1. RAPPEL MATINAL (LUBUMBASHI 07:00) --- */
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        const citation = citations[Math.floor(Math.random() * citations.length)];
        for (const user of res.rows) {
            const msg = `${HEADER}\n\n🔵 **Bonjour mon cher ${user.nom} !**\n\n🟡 Le soleil se lève sur notre beau pays. Rappelle-toi : *"${citation}"*\n\n🔴 Je suis prêt pour tes révisions. Qu'allons-nous conquérir ensemble aujourd'hui ?`;
            await sendWhatsApp(user.phone, msg);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

/* --- 2. RECHERCHE BIBLIOTHÈQUE --- */
async function chercherDansBibliotheque(question) {
    const stopwords = ["le", "la", "les", "un", "une", "des", "du", "de", "d", "et", "en", "au", "aux", "dans", "sur", "sous", "avec", "pour", "par", "qui", "que", "quoi", "ou", "où", "est", "sont", "a", "ont", "quel", "quelle", "comment", "pourquoi", "rdc", "congo"];
    const mots = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ").split(/\s+/).filter(mot => mot.length > 3 && !stopwords.includes(mot));
    if (mots.length === 0) return null;
    try {
        const query = `SELECT description FROM drc_data WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) AS m WHERE nom ILIKE '%'||m||'%') LIMIT 1`;
        const res = await pool.query(query, [mots]);
        return res.rows.length > 0 ? res.rows[0].description : null;
    } catch (e) { return null; }
}

/* --- 3. WEBHOOK : RELATION PRÉCEPTEUR-ÉLÈVE --- */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
        let user = userRes.rows[0];

        // ÉTAPE A : ACCUEIL CHALEUREUX
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, historique, nom) VALUES ($1, $2, $3)", [from, '[]', '']);
            const welcome = `${HEADER}\n\n🔵 **Bonjour jeune patriote !** Quel bonheur de te voir ici. 😊\n\n🟡 Je suis **Mwalimu**, ton mentor dévoué.\n\n🔴 Pour commencer, **quel est ton nom et ta classe ?**`;
            return await sendWhatsApp(from, welcome);
        }

        // ÉTAPE B : COLLECTE DU NOM ET DE LA CLASSE
        if (!user.nom || user.nom.trim() === "") {
            await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [text, from]);
            const nextStep = `${HEADER}\n\n🔵 Ravi de te connaître, **${text}** ! 🤝\n\n🟡 Dis-moi, mon cher élève : **Quel est ton plus grand rêve ? Que veux-tu devenir plus tard pour servir notre beau pays ?** 🇨🇩`;
            return await sendWhatsApp(from, nextStep);
        }

        // ÉTAPE C : COLLECTE DU RÊVE (Enregistré dans l'historique ou une colonne spécifique)
        if (!user.historique || JSON.parse(user.historique).length === 0) {
            const firstHistory = JSON.stringify([{ role: "assistant", content: "Quel est ton rêve ?" }, { role: "user", content: text }]);
            await pool.query("UPDATE conversations SET historique = $1 WHERE phone = $2", [firstHistory, from]);
            const confirm = `${HEADER}\n\n🔵 **${text}** ? C'est une ambition magnifique ! 🌟\n\n🟡 Avec du travail et de la discipline, tu y arriveras. Je suis là pour t'aider à acquérir le savoir nécessaire.\n\n🔴 **Quelle est ta première question pour ton mentor aujourd'hui ?**`;
            return await sendWhatsApp(from, confirm);
        }

        // ÉTAPE D : TUTORAT APPROFONDI ET HUMAIN
        const infoLocal = await chercherDansBibliotheque(text);
        const history = safeParseHistory(user.historique);
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es MWALIMU EDTECH, le mentor humain et encourageant de ${user.nom}.
                    TON STYLE :
                    1. Parle comme un précepteur assis en face de son élève. Utilise son nom régulièrement.
                    2. Rappelle-lui parfois son rêve (mentionné au début) pour le motiver.
                    3. Si tu as cette info locale, utilise-la : ${infoLocal || "Connaissances générales"}.
                    4. STRUCTURE : 🔵 (Explication passionnée), 🟡 (Exemple concret en RDC), 🔴 (Question d'éveil ou encouragement).`
                },
                ...history.slice(-6),
                { role: "user", content: text }
            ]
        });

        const aiReply = completion.choices[0].message.content;
        const newHistory = [...history, { role: "user", content: text }, { role: "assistant", content: aiReply }].slice(-10);
        await pool.query("UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2", [JSON.stringify(newHistory), from]);

        await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

    } catch (e) {
        console.error(e);
        await sendWhatsApp(from, `${HEADER}\n\n🔴 Oh, pardonne-moi, j'ai eu une petite absence technique. Peux-tu me répéter ta question ?`);
    }
});

app.listen(process.env.PORT || 10000);
