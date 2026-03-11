
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
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
});

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

// --- RAPPEL DU MATIN (7h00 Lubumbashi) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            await envoyerWhatsApp(user.phone, `🔵 Bonjour mon cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt pour une journée d'excellence pour le Congo ?`);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE BIBLIOTHÈQUE (Plus flexible) ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const mots = phrase.toLowerCase().split(" ").filter(m => m.length > 3);
    for (let motClé of mots) {
        try {
            const query = `
                SELECT 'Province: ' || province || ' | Chef-lieu: ' || chef_lieu || ' | LISTE DES TERRITOIRES: ' || territoires as res
                FROM drc_population_villes WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1
                UNION ALL
                SELECT caracteristiques FROM drc_hydrographie WHERE LOWER(element) LIKE $1
                UNION ALL
                SELECT reponse FROM questions_reponses WHERE LOWER(question) LIKE $1
                LIMIT 1
            `;
            const res = await pool.query(query, [`%${motClé}%`]);
            if (res.rows.length > 0) return res.rows[0].res;
        } catch (e) { console.error("SQL Error"); }
    }
    return null;
}

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = userRes.rows[0];

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique, reve) VALUES ($1, '', '[]', '')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor.\n\n🟡 Quel est ton nom et ta classe ? 🇨🇩");
        }

        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté ${text} !\n\n🟡 Quel est ton rêve pour le futur du Congo ? 🌟`);
        }

        if (!user.reve) {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est magnifique !\n\n🟡 Je t'accompagnerai pour devenir un(e) ${text} d'exception.\n\n🔴 Quelle est ta question ?`);
        }

        // --- PHASE TUTORAT : L'âme de Mwalimu ---
        const infoBase = await consulterBibliotheque(text);
        let hist = JSON.parse(user.historique || "[]");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, un précepteur congolais vivant, patriote et pédagogue.
                    - ÉLÈVE : ${user.nom}, futur ${user.reve}.
                    - MISSION : Expliquer avec le vécu congolais. Sois un tuteur présent et disponible.
                    - RIGUEUR : Ne résume JAMAIS les listes de l'INFO_BASE. Cite TOUS les éléments fournis.
                    - SOURCE : ${infoBase || "Pas de données SQL. Réponds avec ta culture de tuteur congolais."}
                    - STRUCTURE : 🔵 Accueil chaleureux | 🟡 Leçon détaillée | 🔴 Encouragement vers son rêve.`
                },
                ...hist.slice(-4),
                { role: "user", content: text }
            ]
        });

        const reponse = completion.choices[0].message.content;
        const newHist = [...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10);
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(newHist), from]);
       
        await envoyerWhatsApp(from, reponse);

    } catch (e) {
        await envoyerWhatsApp(from, "🔴 Mon cher élève, j'ai eu une petite distraction technique. Reposons la question !");
    }
});

app.listen(process.env.PORT || 10000);
