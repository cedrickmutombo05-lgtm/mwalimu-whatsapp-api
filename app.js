
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

// RÈGLE D'OR : Italique, boules au début, drapeau à la fin, pas d'astérisques de gras autour du header
const HEADER = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

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

/* --- 1. LOGIQUE DE RECHERCHE STRICTE (ANTI-BAS-UELE) --- */
async function chercherDansBibliotheque(question) {
    const stopwords = ["le", "la", "les", "un", "une", "des", "du", "de", "d", "et", "en", "au", "aux", "dans", "sur", "sous", "avec", "pour", "par", "qui", "que", "quoi", "ou", "où", "est", "sont", "a", "ont", "quel", "quelle", "comment", "pourquoi", "rdc", "congo"];
    const mots = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ").split(/\s+/).filter(mot => mot.length > 3 && !stopwords.includes(mot));
   
    if (mots.length === 0) return null;

    try {
        // Recherche exacte sur le nom ou la description pour éviter les faux positifs
        const query = `SELECT description FROM drc_data WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) AS m WHERE nom ILIKE m OR nom ILIKE '%'||m||'%') LIMIT 1`;
        const res = await pool.query(query, [mots]);
        return res.rows.length > 0 ? res.rows[0].description : null;
    } catch (e) { return null; }
}

/* --- 2. WEBHOOK : ACCUEIL ET IDENTITÉ --- */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
        let user = userRes.rows[0];

        // ÉTAPE A : ACCUEIL STRICT (DEMANDE NOM/CLASSE)
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, historique, nom) VALUES ($1, $2, $3)", [from, '[]', '']);
            const welcome = `${HEADER}\n\nBonjour ! Je suis **Mwalimu**, ton précepteur numérique. 😊\n\n🔵 **Quel est ton nom et ta classe ?** 🟡🔴`;
            return await sendWhatsApp(from, welcome);
        }

        // ÉTAPE B : ENREGISTREMENT SI LE NOM EST VIDE
        if (!user.nom || user.nom === '') {
            await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [text, from]);
            const confirm = `${HEADER}\n\n🔵 Ravi de te connaître, **${text}** ! 🤝\n\n🟡 Je suis prêt à t'aider. Quelle est ta première question sur notre grand Congo ? 🔴`;
            return await sendWhatsApp(from, confirm);
        }

        // ÉTAPE C : RÉCUPÉRATION DU SAVOIR (FILTRÉ)
        const infoLocal = await chercherDansBibliotheque(text);
        const promptSystem = `Tu es MWALIMU EDTECH, le mentor de ${user.nom}.
        IMPORTANT : Ne mentionne JAMAIS le Bas-Uele sauf si l'utilisateur le demande explicitement.
        RÈGLE : Si tu n'as pas d'info précise, utilise ta culture générale sur la RDC.
        MÉTHODE : Explique, donne un exemple congolais, termine par une question d'éveil.
        STYLE : 🔵, 🟡, 🔴.`;

        const history = safeParseHistory(user.historique);
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: promptSystem },
                ...(infoLocal ? [{ role: "system", content: `CONTEXTE RDC : ${infoLocal}` }] : []),
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
        await sendWhatsApp(from, `${HEADER}\n\n🔴 Oups ! Repose ta question, jeune patriote !`);
    }
});

app.listen(process.env.PORT || 10000);
