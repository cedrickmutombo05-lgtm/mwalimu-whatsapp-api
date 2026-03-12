
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

// --- LA RÈGLE D'OR ---
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
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur API WhatsApp"); }
}

// --- RAPPEL MATINAL (7h00 Lubumbashi) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            await envoyerWhatsApp(user.phone, `🔵 Bonjour mon cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) pour une journée d'excellence ?`);
        }
    } catch (e) { console.error("Erreur Cron Morning"); }
}, { timezone: "Africa/Lubumbashi" });

// --- EXTRACTION PRÉNOM ---
async function extrairePrenom(texte) {
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: "Extrais uniquement le prénom. Réponds par le prénom seul." }, { role: "user", content: texte }],
            temperature: 0
        });
        return completion.choices[0].message.content.trim();
    } catch (e) { return texte; }
}

// --- BIBLIOTHÈQUE ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const mots = phrase.toLowerCase().replace(/[?.,!]/g, "").split(" ").filter(m => m.length > 2);
    for (let mot of mots) {
        try {
            const res = await pool.query(
                `SELECT province, chef_lieu, territoires FROM drc_population_villes
                 WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1 OR LOWER(chef_lieu) LIKE $1 LIMIT 1`,
                [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows[0];
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
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // --- CASCADE LOGIQUE DISCIPLINÉE ---
       
        // 0. Nouvel utilisateur
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour commencer, quel est ton **prénom** ?");
        }

        // 1. Enregistrement du Nom
        else if (!user.nom || user.nom.trim() === "") {
            const prenom = await extrairePrenom(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [prenom, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté, **${prenom}** !\n\n🟡 En quelle **classe** es-tu ? (Ex: 6e primaire, 3e secondaire...)`);
        }

        // 2. Enregistrement de la Classe
        else if (!user.classe || user.classe.trim() === "") {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté. Le niveau de **${text}** demande du sérieux.\n\n🟡 Quel est ton plus grand **rêve** pour plus tard ? 🌟`);
        }

        // 3. Enregistrement du Rêve
        else if (!user.reve || user.reve.trim() === "") {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique rêve ! Je t'aiderai à devenir ${text}.\n\n🟡 Quelle est ta question pour aujourd'hui ?`);
        }

        // 4. Tutorat Approfondi
        else {
            const info = await consulterBibliotheque(text);
            let hist = [];
            try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Tu es Mwalimu, un précepteur humain congolais.
                        ÉLÈVE: ${user.nom}, Classe: ${user.classe}, Rêve: ${user.reve}.
                        Si une province est demandée, donne le Chef-lieu et TOUS les territoires :
                        ${info ? `Chef-lieu: ${info.chef_lieu}, Territoires: ${info.territoires}` : "Utilise ton savoir."}`
                    },
                    ...hist.slice(-4),
                    { role: "user", content: text }
                ],
                temperature: 0.2
            });

            const reponse = completion.choices[0].message.content;
            await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10)), from]);
            await envoyerWhatsApp(from, reponse);
        }

    } catch (e) {
        console.error("Erreur Webhook:", e);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Mwalimu EdTech (Phase de Test) opérationnel."));
