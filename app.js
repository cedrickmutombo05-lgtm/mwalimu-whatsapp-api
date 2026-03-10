
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
    } catch (e) {
        console.error("Erreur WhatsApp :", e.response?.data || e.message);
    }
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

/* 2. RECHERCHE DANS LA BIBLIOTHÈQUE (LOGIQUE CORRIGÉE) */
async function chercherDansBibliotheque(question) {
    const q = question.toLowerCase().trim();
    if (q.length < 3) return null;

    try {
        // 1. Recherche par province (Bas-Uele, Haut-Katanga, etc.)
        const provRes = await pool.query("SELECT province, chef_lieu, territoires FROM drc_population_villes");
        const match = provRes.rows.find(p => q.includes(p.province.toLowerCase()));
       
        if (match) {
            if (q.includes("territoire")) return `Les territoires de la province du ${match.province} sont : ${match.territoires}.`;
            if (q.includes("chef-lieu") || q.includes("chef lieu")) return `Le chef-lieu du ${match.province} est ${match.chef_lieu}.`;
            return `La province du ${match.province} a pour chef-lieu ${match.chef_lieu}. Ses territoires sont : ${match.territoires}.`;
        }

        // 2. Recherche Questions/Réponses classiques
        let res = await pool.query("SELECT reponse FROM questions_reponses WHERE LOWER(question) ILIKE $1 LIMIT 1", [`%${q}%`]);
        if (res.rows.length > 0) return res.rows[0].reponse;

        return null;
    } catch (e) { return null; }
}

/* 3. WEBHOOK PRINCIPAL (ANTI-BOUCLE) */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = userRes.rows[0];

        // ÉTAPE 1 : Si l'utilisateur n'existe pas du tout
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, historique, nom) VALUES ($1, $2, $3)", [from, '[]', '']);
            return await sendWhatsApp(from, `${HEADER}\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Je vais t'accompagner dans tes études.\n\n🔴 Pour commencer, comment t'appelles-tu et en quelle classe es-tu ?`);
        }

        // ÉTAPE 2 : Si le nom n'est pas encore enregistré
        if (!user.nom || user.nom.trim() === "") {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await sendWhatsApp(from, `${HEADER}\n\n🔵 Enchanté ${text} ! 🎉\n\n🟡 Quel est ton plus grand rêve pour l'avenir ?\n\n🔴 Pose-moi ta première question quand tu es prêt !`);
        }

        // ÉTAPE 3 : Dialogue normal (Pas de boucle ici)
        const history = safeParseHistory(user.historique);
        const reponseBase = await chercherDansBibliotheque(text);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu EdTech. Ton élève s'appelle ${user.nom}.
                    Sois chaleureux, humain et ne répète pas les mêmes phrases.
                    Si une info est donnée via INFO_BASE, utilise-la.
                    Sinon, réponds par toi-même de manière éducative.
                    Ne demande JAMAIS le nom de l'élève, tu le connais déjà.`
                },
                ...history,
                { role: "user", content: reponseBase ? `INFO_BASE : ${reponseBase}. Question : ${text}` : text }
            ]
        });

        const aiReply = completion.choices[0].message.content;

        // Mise à jour de la mémoire
        const newHistory = [...history, { role: "user", content: text }, { role: "assistant", content: aiReply }].slice(-10);
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(newHistory), from]);

        await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

    } catch (e) {
        console.error(e);
        await sendWhatsApp(from, `${HEADER}\n\n🔴 Petit souci technique, mon cher ${user?.nom || 'ami'}. Repose ta question.`);
    }
});

app.listen(process.env.PORT || 10000);
