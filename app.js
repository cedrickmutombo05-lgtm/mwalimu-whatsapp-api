
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

const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

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

// --- RECHERCHE BIBLIOTHÈQUE ---
async function consulterBibliotheque(phrase) {
    const mots = phrase.toLowerCase().split(" ").filter(m => m.length > 3);
    for (let motClé of mots) {
        try {
            const query = `
                SELECT 'Province: ' || province || ' | Chef-lieu: ' || chef_lieu || ' | LISTE COMPLÈTE: ' || territoires as res
                FROM drc_population_villes WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1
                UNION ALL
                SELECT 'Élément: ' || element || ' | Caractéristiques: ' || caracteristiques FROM drc_hydrographie WHERE LOWER(element) LIKE $1
                UNION ALL
                SELECT reponse FROM questions_reponses WHERE LOWER(question) LIKE $1
                LIMIT 1
            `;
            const res = await pool.query(query, [`%${motClé}%`]);
            if (res.rows.length > 0) return res.rows[0].res;
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
            await pool.query("INSERT INTO conversations (phone, nom, historique, reve) VALUES ($1, '', '[]', '')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor.\n\n🟡 Quel est ton nom et ta classe ? 🇨🇩");
        }

        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté ${text} !\n\n🟡 Quel est ton rêve pour le futur du Congo ? 🌟`);
        }

        if (!user.reve) {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique !\n\n🟡 Je t'aiderai à devenir un(e) ${text} d'exception.\n\n🔴 Quelle est ta question ?`);
        }

        // --- TUTORAT HUMAIN ET PRÉCIS ---
        const infoBase = await consulterBibliotheque(text);
        let hist = JSON.parse(user.historique || "[]");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, le mentor de ${user.nom} (futur ${user.reve}).
                    PERSONNALITÉ : Tu es un précepteur congolais vivant, passionné et bienveillant. Parle comme un tuteur qui veut que son élève réussisse ses examens d'État. Utilise un ton humain ("Mon cher ${user.nom}", "Apprends bien ceci").
                   
                    RÈGLE DE RIGUEUR : Tu ne dois JAMAIS résumer les listes. Si l'INFO_BASE contient 10 territoires, tu les cites TOUS les 10 un par un.
                   
                    INFO_BASE : ${infoBase || "Aucune donnée précise, utilise ta culture congolaise"}.
                   
                    STRUCTURE :
                    🔵 ACCUEIL : Chaleureux, mentionne le vécu ou l'importance du sujet pour la RDC.
                    🟡 DÉTAILS : Utilise les données de l'INFO_BASE de manière exhaustive.
                    🔴 ENCOURAGEMENT : Lie la réponse au rêve de l'élève (avocat, etc.) et motive-le.`
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
