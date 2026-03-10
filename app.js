
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
    } catch { return []; }
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

/* 1. RAPPEL DU MATIN (Lubumbashi 07:00) */
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const citation = citations[Math.floor(Math.random() * citations.length)];
            const msg = `${HEADER}\n\n🔵 Bonjour cher ${user.nom} !\n\n🟡 ${citation}\n\n🔴 Prêt pour tes révisions ? Qu'étudions-nous ce matin ?`;
            await sendWhatsApp(user.phone, msg);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

/* 2. RECHERCHE DANS LA BIBLIOTHÈQUE (Version Optimisée) */
async function chercherDansBibliotheque(question) {
    const q = question.toLowerCase().trim();
    if (q.length < 3) return null;

    try {
        // Recherche Provinces/Territoires
        const provRes = await pool.query("SELECT province, chef_lieu, territoires FROM drc_population_villes");
        const match = provRes.rows.find(p => q.includes(p.province.toLowerCase()));
       
        if (match) {
            if (q.includes("territoire")) return `Les territoires du ${match.province} sont : ${match.territoires}.`;
            return `Province : ${match.province}. Chef-lieu : ${match.chef_lieu}. Territoires : ${match.territoires}.`;
        }

        // Questions/Réponses classiques
        let res = await pool.query("SELECT reponse FROM questions_reponses WHERE LOWER(question) ILIKE $1 LIMIT 1", [`%${q}%`]);
        if (res.rows.length > 0) return res.rows[0].reponse;

        return null;
    } catch (e) { return null; }
}

/* 3. WEBHOOK PRINCIPAL (Logique de Flux Robuste) */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = userRes.rows[0];

        // ÉTAPE A : Nouvel utilisateur
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, historique, nom) VALUES ($1, '[]', '')", [from]);
            return await sendWhatsApp(from, `${HEADER}\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Je suis là pour t'accompagner. Quel est ton nom et ta classe ?`);
        }

        // ÉTAPE B : Capture du Nom (Si vide)
        if (!user.nom || user.nom.trim() === "") {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await sendWhatsApp(from, `${HEADER}\n\n🔵 Ravi de te connaître, ${text} ! 🎉\n\n🟡 Quel est ton rêve pour plus tard ?\n\n🔴 Je t'écoute, pose ta question.`);
        }

        // ÉTAPE C : Mode Discussion Continue (Plus de boucles)
        const history = safeParseHistory(user.historique);
        const reponseBase = await chercherDansBibliotheque(text);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu EdTech. Ton élève est ${user.nom}.
                    DIRECTIVES :
                    - Ne redemande JAMAIS le nom ou comment il va en boucle.
                    - Si une INFO_BASE est fournie, intègre-la dans une réponse chaleureuse.
                    - Si l'élève pose une question sur un territoire, donne les faits et encourage-le.
                    - Reste concis (3 lignes).`
                },
                ...history,
                { role: "user", content: reponseBase ? `INFO_BASE : ${reponseBase}. L'élève demande : ${text}` : text }
            ]
        });

        const aiReply = completion.choices[0].message.content;

        // Sauvegarde de l'échange
        const newHistory = [...history, { role: "user", content: text }, { role: "assistant", content: aiReply }].slice(-10);
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(newHistory), from]);

        await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

    } catch (e) {
        console.error(e);
        await sendWhatsApp(from, `${HEADER}\n\n🔴 Petit souci technique, mon cher ${user?.nom || 'ami'}. On reprend ?`);
    }
});

app.listen(process.env.PORT || 10000);
