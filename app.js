
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

// LA RÈGLE D'OR : Le Header sacré respecté scrupuleusement
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
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, {
            headers: { Authorization: `Bearer ${process.env.TOKEN}` }
        });
    } catch (e) {
        console.error("Erreur WhatsApp");
    }
}

// --- LE RAPPEL DU MATIN ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            // On utilise une formulation inclusive pour le rappel automatique
            const messageMatin = `🔵 Bonjour mon cher élève / ma chère élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) pour une nouvelle journée d'apprentissage pour notre grand Congo ?`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) {
        console.error("Erreur Cron Rappel Matin");
    }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE BIBLIOTHÈQUE ---
async function consulterBibliotheque(phrase) {
    const mots = phrase.toLowerCase().split(" ").filter(m => m.length > 3);
    for (let motCle of mots) {
        try {
            const queryGeo = `
                SELECT 'PROVINCE: ' || province || ' | CHEF-LIEU: ' || chef_lieu || ' | TERRITOIRES: ' || territoires as res
                FROM drc_population_villes
                WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1 OR LOWER(chef_lieu) LIKE $1
                LIMIT 1
            `;
            const resGeo = await pool.query(queryGeo, [`%${motCle}%`]);
            if (resGeo.rows.length > 0) return resGeo.rows[0].res;

            const queryAutre = `
                SELECT 'Élément: ' || element || ' | Caractéristiques: ' || caracteristiques FROM drc_hydrographie WHERE LOWER(element) LIKE $1
                UNION ALL
                SELECT reponse FROM questions_reponses WHERE LOWER(question) LIKE $1
                LIMIT 1
            `;
            const resAutre = await pool.query(queryAutre, [`%${motCle}%`]);
            if (resAutre.rows.length > 0) return resAutre.rows[0].res;
        } catch (e) { continue; }
    }
    return null;
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

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique) VALUES ($1, '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour nous lancer dans cette aventure, quel est ton prénom et ta classe ? 🇨🇩");
        }

        const infoBase = await consulterBibliotheque(text);
       
        // Gestion robuste de l'historique (Correction de l'erreur JSON)
        let hist = [];
        if (user.historique) {
            if (typeof user.historique === 'string') {
                try { hist = JSON.parse(user.historique); } catch (e) { hist = []; }
            } else if (Array.isArray(user.historique)) {
                hist = user.historique;
            }
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, un précepteur congolais d'exception.
                   
                    CONSIGNES D'ADRESSAGE :
                    - Si l'élève est une fille (ex: Dora), utilise "ma chère élève".
                    - Si c'est un garçon, utilise "mon cher élève".
                    - Sois toujours chaleureux, patriotique et pédagogue.
                   
                    CONSIGNES DE RIGUEUR :
                    1. La BIBLIOTHÈQUE (INFO_BASE) est ta seule source de vérité factuelle.
                    2. Ne confonds JAMAIS le 'CHEF-LIEU' (Ville) avec la liste des 'TERRITOIRES'.
                    3. Si l'INFO_BASE donne une liste de territoires, cite-les TOUS sans exception ni résumé.
                   
                    INFO_BASE : ${infoBase ? infoBase : "Donnée non trouvée. Réponds avec ta sagesse de mentor."}`
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
        console.error(e);
        await envoyerWhatsApp(from, `🔴 Mon cher élève / Ma chère élève, j'ai eu une distraction technique. Détails : ${e.message}`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech en ligne sur le port ${PORT}`));
