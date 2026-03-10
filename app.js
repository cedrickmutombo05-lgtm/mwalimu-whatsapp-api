
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

// LA RÈGLE D'OR : Le Header exact et respecté
const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba"
];

// --- FONCTION D'ENVOI WHATSAPP ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        },
        { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WhatsApp:", e.message); }
}

// --- RAPPEL DU MATIN (Lubumbashi 07:00) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const citation = citations[Math.floor(Math.random() * citations.length)];
            const rappel = `Bonjour cher ${user.nom} !\n\n${citation}\n\nPrêt pour une nouvelle journée d'apprentissage ? Que révisons-nous aujourd'hui ? 🔵🟡🔴`;
            await envoyerWhatsApp(user.phone, rappel);
        }
    } catch (e) { console.error("Erreur Cron Rappel"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE BIBLIOTHÈQUE MULTI-DOMAINES ---
async function consulterBibliotheque(question) {
    const q = question.toLowerCase().trim();
    if (q.length < 3) return null;
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

// --- WEBHOOK PRINCIPAL ÉVOLUTIF ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = userRes.rows[0];

        // 1. PHASE D'ACCUEIL (Nouveau contact)
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique, reve) VALUES ($1, '', '[]', '')", [from]);
            return await envoyerWhatsApp(from, "Mbote ! Je suis Mwalimu EdTech, ton mentor.\n\nPour commencer ce voyage ensemble, dis-moi : quel est ton nom et ta classe ? 🇨🇩");
        }

        // 2. PHASE D'IDENTITÉ (Nom)
        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `Enchanté ${text} ! Quel est ton plus grand rêve ? Que souhaites-tu devenir plus tard pour le Congo ? 🌟`);
        }

        // 3. PHASE D'AMBITION (Rêve)
        if (!user.reve || user.reve === "") {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `C'est un projet magnifique. Je vais t'aider à devenir ce ${text} d'excellence.\n\nQuelle est ta question pour aujourd'hui ?`);
        }

        // 4. PHASE DE TUTORAT (Intelligence & Mémoire)
        const infoBase = await consulterBibliotheque(text);
        let historique = [];
        try { historique = JSON.parse(user.historique || "[]"); } catch (e) { historique = []; }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu EdTech, mentor éducatif en RDC. L'élève s'appelle ${user.nom} et veut devenir ${user.reve}.
                    - Utilise les données de la BIBLIOTHÈQUE en priorité : ${infoBase || "Utilise tes connaissances sur la RDC"}.
                    - Sois humain, utilise son nom, encourage-le par rapport à son rêve.
                    - Réponse courte (3-4 lignes).`
                },
                ...historique.slice(-6),
                { role: "user", content: text }
            ]
        });

        const reponseIA = completion.choices[0].message.content;

        // Mise à jour de la mémoire évolutive
        const newHist = [...historique, { role: "user", content: text }, { role: "assistant", content: reponseIA }].slice(-10);
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(newHist), from]);

        await envoyerWhatsApp(from, reponseIA);

    } catch (e) {
        console.error("Erreur fatale:", e);
        await envoyerWhatsApp(from, "Je suis là, mais j'ai eu une petite distraction. Peux-tu reformuler, mon cher élève ?");
    }
});

app.listen(process.env.PORT || 10000);
