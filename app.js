
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

const HEADER = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba"
];

const safeParseHistory = (historyStr) => {
    try {
        if (!historyStr) return [];
        const parsed = JSON.parse(historyStr);
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

/* --- 1. RAPPEL DU MATIN (LUBUMBASHI 07:00) --- */
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        const citation = citations[Math.floor(Math.random() * citations.length)];
        for (const user of res.rows) {
            const msg = `${HEADER}\n\n🔵 **Bonjour mon cher ${user.nom} !** 😊\n\n🟡 Le soleil se lève sur notre beau pays. Rappelle-toi : *"${citation}"*\n\n🔴 Je suis prêt pour tes révisions. Qu'as-tu prévu d'apprendre avec ton mentor aujourd'hui ?`;
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

/* --- 3. WEBHOOK : INTERACTION HUMAINE ET MÉMOIRE --- */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
        let user = userRes.rows[0];

        // ÉTAPE A : ACCUEIL NOUVEL ÉLÈVE
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, historique, nom) VALUES ($1, $2, $3)", [from, '[]', '']);
            const welcome = `${HEADER}\n\n🔵 **Bonjour jeune patriote !** Quel plaisir de faire ta connaissance. 😊\n\n🟡 Je suis **Mwalimu**, ton mentor dévoué pour ta réussite.\n\n🔴 Pour commencer notre voyage, **dis-moi ton nom et ta classe ?**`;
            return await sendWhatsApp(from, welcome);
        }

        // ÉTAPE B : COLLECTE DU NOM ET DU RÊVE
        if (!user.nom || user.nom.trim() === "") {
            await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [text, from]);
            const ambition = `${HEADER}\n\n🔵 Ravi de te connaître, **${text}** ! C'est un nom plein de promesses. 🤝\n\n🟡 Dis-moi, mon cher élève : **Quel est ton plus grand rêve ? Que veux-tu devenir plus tard pour servir la RDC ?**\n\n🔴 (Ton rêve m'aidera à mieux t'orienter dans tes leçons !)`;
            return await sendWhatsApp(from, ambition);
        }

        // ÉTAPE C : TUTORAT AVEC MÉMOIRE (HISTORIQUE)
        const infoLocal = await chercherDansBibliotheque(text);
        const history = safeParseHistory(user.historique);
       
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es MWALIMU EDTECH, le mentor humain et passionné de ${user.nom}.
                    INTERDICTION : Ne jamais parler du Bas-Uele sauf si l'élève le demande.
                    STYLE : Parle comme un précepteur assis en face de l'élève. Utilise "mon cher ${user.nom}".
                    STRUCTURE : 🔵 (Explication), 🟡 (Exemple en RDC), 🔴 (Conclusion/Question d'éveil).
                    CONTEXTE LOCAL : ${infoLocal || "Culture et éducation RDC"}.`
                },
                ...history.slice(-8), // Mémorisation des 8 derniers échanges
                { role: "user", content: text }
            ]
        });

        const aiReply = completion.choices[0].message.content;
        const newHistory = [...history, { role: "user", content: text }, { role: "assistant", content: aiReply }].slice(-10);
       
        await pool.query("UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2", [JSON.stringify(newHistory), from]);
        await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

    } catch (e) {
        console.error(e);
        await sendWhatsApp(from, `${HEADER}\n\n🔴 Oh, pardonne-moi **${user?.nom || "cher élève"}**, j'ai eu un petit vertige technique. Peux-tu me répéter ta question ?`);
    }
});

app.listen(process.env.PORT || 10000);
