
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

// --- IDENTITÉ VISUELLE ET SAGESSE ---
const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba",
    "« L'excellence n'est pas une action, c'est une habitude. »",
    "« Un peuple qui ne connaît pas son histoire est un peuple sans avenir. »"
];

// --- ENVOI WHATSAPP ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WhatsApp API"); }
}

// --- RAPPEL MATINAL (7H00) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            await envoyerWhatsApp(user.phone, `🔵 Bonjour ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Aujourd'hui est une nouvelle chance de bâtir ton avenir.`);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE SQL PRÉCISE ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = nettoyer(phrase).replace(/[?.,!]/g, "").split(" ");

    for (let mot of mots) {
        if (mot.length < 4) continue;
        try {
            const res = await pool.query(
                `SELECT province, chef_lieu, territoires FROM drc_population_villes
                 WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1
                 ORDER BY (LOWER(province) = $2) DESC LIMIT 1`,
                [`%${mot}%`, mot]
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

        // 1. GESTION DE L'ENRÔLEMENT
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?");
        }
        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${text}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté. Quel est ton plus grand **rêve** professionnel ?`);
        }
        if (!user.reve) {
            const saluts = ["bonjour", "mbote", "mwalimu", "hello"];
            if (saluts.includes(text.toLowerCase())) return await envoyerWhatsApp(from, "🔵 Bonjour ! Quel est ton **rêve** ?");
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir **${text}**.\n\n🟡 Quelle est ta question ?`);
        }

        // 2. LOGIQUE DE RÉPONSE MENTOR
        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = [];
        try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

        const systemPrompt = `
Tu es Mwalimu, Mentor Congolais.
ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}

<SOURCE_SQL>
${info ? `PROVINCE: ${info.province} | CHEF_LIEU: ${info.chef_lieu} | TERRITOIRES: ${info.territoires}` : "VIDE"}
</SOURCE_SQL>

<OBLIGATION_STRUCTURE>
Tu DOIS utiliser ce format précis à CHAQUE réponse :
🔵 [VÉCU] : Anecdote sur la RDC liée à la demande.
🟡 [SAVOIR] : Si <SOURCE_SQL> n'est pas VIDE, copie : "Voici les données officielles : Chef-lieu : ${info?.chef_lieu}. Territoires : ${info?.territoires}." (Ne résume JAMAIS).
🔴 [INSPIRATION] : Relie le savoir au rêve (${user.reve}). Termine par : "${citAleatoire}".
</OBLIGATION_STRUCTURE>

RÈGLE : Température 0. Si la source est VIDE, demande de préciser la province.
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0
        });

        const reponse = completion.choices[0].message.content;
        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
       
        await envoyerWhatsApp(from, reponse);

    } catch (e) { console.error("Error:", e); }
});

app.listen(process.env.PORT || 10000);
