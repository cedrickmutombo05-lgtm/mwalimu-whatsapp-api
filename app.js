
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

// --- LE RAPPEL DU MATIN (Lubumbashi 07:00) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const messageMatin = `🔵 Bonjour mon cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt pour une nouvelle journée d'apprentissage ?`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) {
        console.error("Erreur Cron Rappel Matin");
    }
}, { timezone: "Africa/Lubumbashi" });

// --- EXTRACTION INTELLIGENTE ---
async function extraireInfo(type, texte) {
    const prompt = type === "nom"
        ? `Extrais uniquement le prénom de: "${texte}". Réponds par UN SEUL MOT.`
        : `Extrais uniquement le métier ou rêve de: "${texte}". Réponds par UN SEUL MOT.`;
    try {
        const res = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }]
        });
        return res.choices[0].message.content.replace(/[.\!\\?]/g, "").trim();
    } catch (e) {
        return texte;
    }
}

// --- RECHERCHE BIBLIOTHÈQUE ---
async function consulterBibliotheque(phrase) {
    const texte = phrase.toLowerCase();
    const mots = texte.split(" ").filter(m => m.length > 3);
   
    for (let motCle of mots) {
        try {
            // Requête ciblée pour extraire la structure géographique exacte
            const queryGeo = `
                SELECT province, chef_lieu, territoires
                FROM drc_population_villes
                WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1
                LIMIT 1
            `;
            const resGeo = await pool.query(queryGeo, [`%${motCle}%`]);
           
            if (resGeo.rows.length > 0) {
                const r = resGeo.rows[0];
                // On formate pour que l'IA distingue bien le Chef-lieu de la liste des territoires
                return `INFO_GEO_OFFICIELLE : Province de ${r.province} | Chef-lieu (Ville) : ${r.chef_lieu} | Territoires : ${r.territoires}`;
            }

            // Recherche secondaire (Hydrographie et FAQ)
            const queryDivers = `
                SELECT 'Élément: ' || element || ' | Caractéristiques: ' || caracteristiques as res FROM drc_hydrographie WHERE LOWER(element) LIKE $1
                UNION ALL
                SELECT reponse FROM questions_reponses WHERE LOWER(question) LIKE $1
                LIMIT 1
            `;
            const resDiv = await pool.query(queryDivers, [`%${motCle}%`]);
            if (resDiv.rows.length > 0) return resDiv.rows[0].res;

        } catch (e) {
            continue;
        }
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

        // 1. Inscription
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique, reve) VALUES ($1, '', '[]', '')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour nous lancer dans cette aventure, quel est ton prénom ?");
        }

        // 2. Capture du Nom
        if (!user.nom || user.nom.trim() === "") {
            const nomNet = await extraireInfo("nom", text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nomNet, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté ${nomNet} !\n\n🟡 Quel est ton grand rêve pour le futur de notre nation ?`);
        }

        // 3. Capture du Rêve
        if (!user.reve || user.reve.trim() === "") {
            const reveNet = await extraireInfo("reve", text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reveNet, from]);
            return await envoyerWhatsApp(from, `🔵 C'est un rêve magnifique, ${user.nom} !\n\n🟡 Je t'aiderai à devenir un(e) ${reveNet}. Comment puis-je t'aider aujourd'hui ?`);
        }

        // 4. Tutorat Vivant (Le coeur du système)
        const infoBase = await consulterBibliotheque(text);
        let hist = [];
        try { hist = JSON.parse(user.historique || "[]"); } catch(e) { hist = []; }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, un précepteur congolais vivant, patriote et pédagogue.
                    - ÉLÈVE : ${user.nom}, futur ${user.reve}.
                    - TON : Chaleureux, mentor, utilise "Mon cher élève", "Notre beau pays".
                    - RIGUEUR : Ne résume JAMAIS les listes de l'INFO_BASE. Cite TOUS les éléments fournis sans exception. Ne confonds pas le Chef-lieu avec les Territoires.
                    - SOURCE : ${infoBase ? infoBase : "Pas de données SQL. Réponds avec ta culture de tuteur."}
                    - STRUCTURE : 🔵 Accueil humain | 🟡 Leçon détaillée | 🔴 Encouragement vers son rêve.`
                },
                ...hist.slice(-4),
                { role: "user", content: text }
            ]
        });

        const reponse = completion.choices[0].message.content;
        const newHist = [...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10);
       
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(newHist), from]);
        await envoyerWhatsApp(from, reponse);

    } catch (error) {
        console.error("ERREUR:", error);
        await envoyerWhatsApp(from, `🔴 Mon cher élève, j'ai eu une distraction technique. Détails : ${error.message}`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel sur le port ${PORT}`));
