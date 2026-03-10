
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

// RÈGLE D'OR : Le Header immuable
const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba"
];

// --- ENVOI WHATSAPP ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        },
        { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WhatsApp"); }
}

// --- RAPPEL DU MATIN (Lubumbashi 07:00) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const citation = citations[Math.floor(Math.random() * citations.length)];
            const msg = `🔵 Bonjour cher ${user.nom} !\n\n🟡 ${citation}\n\n🔴 Prêt pour tes révisions ? Qu'étudions-nous ce matin ?`;
            await envoyerWhatsApp(user.phone, msg);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE BIBLIOTHÈQUE ---
async function consulterBibliotheque(question) {
    const q = question.toLowerCase().trim();
    try {
        const query = `
            SELECT reponse as res FROM questions_reponses WHERE LOWER(question) ILIKE $1
            UNION ALL
            SELECT caracteristiques FROM drc_hydrographie WHERE LOWER(element) ILIKE $1
            UNION ALL
            SELECT 'Chef-lieu: ' || chef_lieu || ' | Territoires: ' || territoires FROM drc_population_villes WHERE LOWER(province) ILIKE $1
            LIMIT 1
        `;
        const res = await pool.query(query, [`%${q}%`]);
        return res.rows.length > 0 ? res.rows[0].res : null;
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
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = userRes.rows[0];

        // 1. Nouvel élève
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique, reve) VALUES ($1, '', '[]', '')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor.\n\n🟡 Pour commencer, quel est ton nom et ta classe ? 🇨🇩");
        }

        // 2. Capture du Nom
        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté ${text} !\n\n🟡 Quel est ton rêve pour le futur du Congo ? 🌟`);
        }

        // 3. Capture du Rêve
        if (!user.reve || user.reve === "") {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est magnifique !\n\n🟡 Je t'aiderai à devenir un ${text} exemplaire.\n\n🔴 Quelle est ta question pour aujourd'hui ?`);
        }

        // 4. Tutorat Intelligent (Avec Boules en paragraphes)
        const infoBase = await consulterBibliotheque(text);
        let hist = []; try { hist = JSON.parse(user.historique || "[]"); } catch(e) {}

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, mentor de ${user.nom}.
                    RÈGLES DE RÉPONSE :
                    - Utilise 🔵, 🟡, 🔴 au début de chaque paragraphe.
                    - Info base RDC: ${infoBase || "Utilise ta culture générale"}.
                    - Sois humain, court et encourageant.`
                },
                ...hist.slice(-6),
                { role: "user", content: text }
            ]
        });

        const reponse = completion.choices[0].message.content;
        const newHist = [...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10);
       
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(newHist), from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) {
        console.error(e);
        await envoyerWhatsApp(from, "🔴 Je suis là, mais j'ai eu une petite distraction.\n\n🔵 Peux-tu reformuler ta question, cher élève ?");
    }
});

app.listen(process.env.PORT || 10000);
