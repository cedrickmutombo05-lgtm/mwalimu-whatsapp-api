
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

// LA RÈGLE D'OR : Le Header sacré
const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

// CITATIONS POUR L'INSPIRATION DES ÉLÈVES
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
    } catch (e) { console.error("ERREUR ENVOI WHATSAPP:", e.response?.data || e.message); }
}

// --- RAPPEL DU MATIN (Lubumbashi 07:00) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const citation = citations[Math.floor(Math.random() * citations.length)];
            const messageMatin = `🔵 Bonjour mon cher élève ${user.nom} !\n\n🟡 ${citation}\n\n🔴 Es-tu prêt pour une nouvelle journée d'excellence pour notre grand Congo ? Qu'étudions-nous ce matin ?`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur Cron Rappel Matin"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE BIBLIOTHÈQUE PRÉCISE ---
async function consulterBibliotheque(phrase) {
    const mots = phrase.toLowerCase().split(" ").filter(m => m.length > 3);
    for (let mot of mots) {
        try {
            const query = `
                SELECT 'Province: ' || province || ' | Chef-lieu: ' || chef_lieu || ' | LISTE COMPLÈTE DES TERRITOIRES: ' || territoires as res
                FROM drc_population_villes WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1
                UNION ALL
                SELECT 'Élément: ' || element || ' | Caractéristiques: ' || caracteristiques FROM drc_hydrographie WHERE LOWER(element) LIKE $1
                UNION ALL
                SELECT reponse FROM questions_reponses WHERE LOWER(question) LIKE $1
                LIMIT 1
            `;
            const res = await pool.query(query, [`%${mot}%`]);
            if (res.rows.length > 0) return res.rows[0].res;
        } catch (e) { continue; }
    }
    return null;
}

// --- WEBHOOK PRINCIPAL ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = userRes.rows[0];

        // 1. Accueil
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique, reve) VALUES ($1, '', '[]', '')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour nous lancer dans cette aventure, quel est ton nom et ta classe ? 🇨🇩");
        }

        // 2. Nom
        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté ${text} !\n\n🟡 Quel est ton grand rêve pour le futur de notre nation ? 🌟`);
        }

        // 3. Rêve
        if (!user.reve === "" || !user.reve) {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est un rêve magnifique !\n\n🟡 Je t'accompagnerai pour que tu deviennes un(e) ${text} d'excellence pour le Congo.\n\n🔴 Quelle question as-tu pour ton tuteur aujourd'hui ?`);
        }

        // 4. Tutorat Humain et Intégral
        const infoBase = await consulterBibliotheque(text);
        let hist = JSON.parse(user.historique || "[]");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, un précepteur congolais vivant, patriote et très pédagogue.
                    - ÉLÈVE : ${user.nom}, futur ${user.reve}.
                    - TON : Chaleureux, mentor, utilise "Mon cher élève", "Notre beau pays".
                    - MISSION : Tu dois expliquer le vécu congolais derrière chaque leçon.
                    - RIGUEUR : Si l'INFO_BASE contient une liste (ex: territoires), tu DOIS tous les citer sans exception. Ne résume jamais.
                    - SOURCE : ${infoBase || "Aucune donnée SQL. Réponds avec ta grande culture de tuteur congolais."}
                    - STRUCTURE : 🔵 Accueil chaleureux | 🟡 Leçon complète et vivante (Données SQL) | 🔴 Encouragement vers son rêve.`
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
        console.error("Erreur Webhook:", e);
        await envoyerWhatsApp(from, "🔴 Mon cher élève, j'ai eu une petite distraction technique. Reposons la question, je suis là pour toi !");
    }
});

app.listen(process.env.PORT || 10000);
