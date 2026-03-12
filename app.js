
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

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba"
];

// --- FONCTION D'ENVOI SÉCURISÉE ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) {
        console.error("Erreur API WhatsApp:", e.response ? e.response.data : e.message);
    }
}

// --- RAPPEL MATINAL (7h00 Lubumbashi) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, sexe FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const salut = user.sexe === 'F' ? "ma chère élève" : "mon cher élève";
            await envoyerWhatsApp(user.phone, `🔵 Bonjour ${salut} ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) pour une journée d'excellence pour notre grand Congo ?`);
        }
    } catch (e) { console.error("Erreur Cron Morning:", e.message); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE BIBLIOTHÈQUE ---
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
            if (res.rows.length > 0) {
                const r = res.rows[0];
                return `PROVINCE: ${r.province} | CHEF-LIEU: ${r.chef_lieu} | TOUS LES TERRITOIRES: ${r.territoires}`;
            }
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
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // ÉTAPE 0 : INITIALISATION
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, sexe, classe, reve, historique) VALUES ($1, '', '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour commencer, quel est ton **prénom** ?");
        }

        // ÉTAPE 1 : NOM
        if (!user.nom || user.nom.trim() === "") {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté, **${text}** !\n\n🟡 Es-tu un garçon ou une fille ? (Réponds par 'Garçon' ou 'Fille')`);
        }

        // ÉTAPE 2 : SEXE
        if (!user.sexe || user.sexe.trim() === "") {
            const s = text.toLowerCase().includes("fille") || text.toLowerCase().includes("femme") ? "F" : "M";
            await pool.query("UPDATE conversations SET sexe=$1 WHERE phone=$2", [s, from]);
            const salut = s === "F" ? "ma chère élève" : "mon cher élève";
            return await envoyerWhatsApp(from, `🔵 C'est noté, ${salut} ${user.nom}.\n\n🟡 En quelle **classe** es-tu ? (Ex: 6e primaire, 3e secondaire...)`);
        }

        // ÉTAPE 3 : CLASSE
        if (!user.classe || user.classe.trim() === "") {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Très bien ! Le niveau de **${text}** demande de la rigueur.\n\n🟡 Quel est ton plus grand **rêve** pour l'avenir ? 🌟`);
        }

        // ÉTAPE 4 : RÊVE
        if (!user.reve || user.reve.trim() === "") {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            const salut = user.sexe === "F" ? "ma chère élève" : "mon cher élève";
            return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir ${text}, ${salut}.\n\n🟡 Je t'écoute, quelle est ta question ?`);
        }

        // ÉTAPE 5 : TUTORAT ET GÉOGRAPHIE
        const infoBase = await consulterBibliotheque(text);
        let hist = [];
        try {
            hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []);
        } catch(e) { hist = []; }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, précepteur congolais rigoureux.
                    ÉLÈVE: ${user.nom}, Classe: ${user.classe}, Rêve: ${user.reve}.
                    ADRESSAGE: "${user.sexe === 'F' ? 'ma chère élève' : 'mon cher élève'}".

                    RÈGLES :
                    1. Si l'INFO_BASE contient une province, cite le Chef-lieu PUIS la liste COMPLÈTE des territoires.
                    2. Ne dis jamais "je n'ai pas de données".
                    3. Encourage l'élève à devenir ${user.reve}.
                   
                    INFO_BASE : ${infoBase || "Savoir général du mentor."}`
                },
                ...hist.slice(-4),
                { role: "user", content: text }
            ],
            temperature: 0.2
        });

        const reponse = completion.choices[0].message.content;
        const newHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10));
       
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [newHist, from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) {
        console.error("ERREUR WEBHOOK:", e);
        const salut = user?.sexe === "F" ? "ma chère élève" : "mon cher élève";
        await envoyerWhatsApp(from, `🔴 Désolé ${salut || "cher élève"}, j'ai eu une petite distraction technique. Reposons la question !`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech opérationnel sur le port ${PORT}`));
