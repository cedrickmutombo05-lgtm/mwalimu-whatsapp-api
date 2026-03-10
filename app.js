
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

// RÈGLE D'OR : Italique, boules au début, drapeau à la fin, pas d'astérisques autour du bloc
const HEADER = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. » - François Rabelais",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba",
    "« Le succès, c'est d'aller d'échec en échec sans perdre son enthousiasme. »",
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
    } catch (e) { console.error("Erreur WhatsApp :", e.response?.data || e.message); }
}

/* --- 1. RAPPEL DU MATIN (7H00 LUBUMBASHI) --- */
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations");
        const citation = citations[Math.floor(Math.random() * citations.length)];
        for (const user of res.rows) {
            const msg = `${HEADER}\n\n🔵 **Bonjour ${user.nom || "cher élève"} !**\n\n🟡 *"${citation}"*\n\n🔴 Réveille ton génie ! Qu'as-tu prévu d'apprendre aujourd'hui pour le Congo ?`;
            await sendWhatsApp(user.phone, msg);
        }
    } catch (e) { console.log("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

/* --- 2. LOGIQUE DE RECHERCHE BIBLIOTHÈQUE --- */
function extraireMotsCles(question) {
    const stopwords = ["le", "la", "les", "un", "une", "des", "du", "de", "d", "et", "en", "au", "aux", "dans", "sur", "sous", "avec", "pour", "par", "qui", "que", "quoi", "ou", "où", "est", "sont", "a", "ont", "quel", "quelle", "comment", "pourquoi", "rdc", "congo"];
    return question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ").split(/\s+/).filter(mot => mot.length > 2 && !stopwords.includes(mot));
}

async function chercherDansBibliotheque(question) {
    try {
        const mots = extraireMotsCles(question);
        if (mots.length === 0) return null;
        const query = `
            SELECT description AS contenu FROM drc_data
            WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) AS m WHERE nom ILIKE '%'||m||'%' OR description ILIKE '%'||m||'%')
            LIMIT 1`;
        const res = await pool.query(query, [mots]);
        return res.rows.length > 0 ? res.rows[0].contenu : null;
    } catch (e) { return null; }
}

/* --- 3. WEBHOOK : IDENTITÉ ET TUTORAT APPROFONDI --- */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
        let user = userRes.rows[0];

        // ÉTAPE A : ACCUEIL NOUVEL ÉLÈVE (PRÉSENTATION CORRIGÉE)
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, historique) VALUES ($1, $2)", [from, '[]']);
            const welcome = `${HEADER}\n\nBonjour ! Je suis **Mwalimu**, ton précepteur numérique. 😊\n\n🔵 **Quel est ton nom et ta classe ?** 🟡🔴`;
            return await sendWhatsApp(from, welcome);
        }

        // ÉTAPE B : ENREGISTREMENT IDENTITÉ (NOM ET CLASSE)
        if (!user.nom || user.nom.trim() === "") {
            await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [text, from]);
            const confirm = `${HEADER}\n\n🔵 Ravi de faire ta connaissance, **${text}** ! 🤝\n\n🟡 Je suis prêt à t'aider dans ton apprentissage. Quelle est ta première question pour moi aujourd'hui ? 🔴`;
            return await sendWhatsApp(from, confirm);
        }

        // ÉTAPE C : RÉCUPÉRATION DU CONTEXTE (SANS BOUCLE)
        const infoLocal = await chercherDansBibliotheque(text);
        let contextAdditionnel = infoLocal ? `[DONNÉE SOURCE RDC : ${infoLocal}]` : "";

        // ÉTAPE D : GÉNÉRATION DE LA RÉPONSE PÉDAGOGIQUE
        const history = safeParseHistory(user.historique);
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es MWALIMU EDTECH, le mentor de ${user.nom}.
                    1. Tutorat approfondi : explique clairement, donne un exemple congolais, termine par une question d'éveil.
                    2. Utilise cette donnée : ${contextAdditionnel}.
                    3. Ne parle pas du Bas-Uele sauf demande explicite.
                    4. Style : Chaleureux, utilise 🔵, 🟡, 🔴.`
                },
                ...history.slice(-6),
                { role: "user", content: text }
            ]
        });

        const aiReply = completion.choices[0].message.content;

        // MISE À JOUR MÉMOIRE
        const newHistory = [...history, { role: "user", content: text }, { role: "assistant", content: aiReply }].slice(-10);
        await pool.query("UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2", [JSON.stringify(newHistory), from]);

        await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

    } catch (e) {
        console.error(e);
        await sendWhatsApp(from, `${HEADER}\n\n🔴 Oups ! Repose ta question, jeune patriote !`);
    }
});

app.listen(process.env.PORT || 10000);
