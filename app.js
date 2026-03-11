
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

// --- NETTOYAGE INTELLIGENT ---
async function extraireInfo(type, texte) {
    const prompt = type === "nom"
        ? `Extrais uniquement le prénom de: "${texte}". Réponds par UN SEUL MOT.`
        : `Extrais uniquement le métier de: "${texte}". Réponds par UN SEUL MOT.`;
    try {
        const res = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }]
        });
        return res.choices[0].message.content.replace(/[\.\!\?]/g, "").trim();
    } catch (e) { return texte; }
}

// --- RECHERCHE "PASSE-PARTOUT" DANS TA BIBLIOTHÈQUE ---
async function consulterBibliotheque(phrase) {
    const mots = phrase.toLowerCase().split(" ");
    // On cherche les mots-clés importants (plus de 3 lettres)
    const motsCles = mots.filter(m => m.length > 3);
   
    for (let motClé of motsCles) {
        try {
            const query = `
                SELECT 'Province: ' || province || ' | Chef-lieu: ' || chef_lieu || ' | Territoires: ' || territoires as res
                FROM drc_population_villes WHERE LOWER(province) LIKE $1
                UNION ALL
                SELECT caracteristiques FROM drc_hydrographie WHERE LOWER(element) LIKE $1
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
            const nomNet = await extraireInfo("nom", text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nomNet, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté ${nomNet} !\n\n🟡 Quel est ton rêve pour le futur du Congo ? 🌟`);
        }

        if (!user.reve) {
            const reveNet = await extraireInfo("reve", text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reveNet, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique, ${user.nom} !\n\n🟡 Je t'aiderai à devenir un(e) ${reveNet} exemplaire.\n\n🔴 Quelle est ta question ?`);
        }

        // --- PHASE DE RÉPONSE : UTILISATION DE TES DONNÉES ---
        const infoBase = await consulterBibliotheque(text);
        let hist = []; try { hist = JSON.parse(user.historique || "[]"); } catch(e) {}

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, mentor de ${user.nom} (futur ${user.reve}).
                    RÈGLE : Si l'INFO_BASE est fournie, tu dois l'utiliser pour donner une réponse précise et complète. Ne dis JAMAIS que tu n'as pas accès aux données si l'INFO_BASE contient l'info.
                   
                    INFO_BASE : ${infoBase || "Cherche dans tes connaissances sur la RDC"}.
                   
                    Structure avec 🔵, 🟡, 🔴.`
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
        await envoyerWhatsApp(from, "🔴 Désolé, j'ai eu une petite distraction. Reformule ?");
    }
});

app.listen(process.env.PORT || 10000);
