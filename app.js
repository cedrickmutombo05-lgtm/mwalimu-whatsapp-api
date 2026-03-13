
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

// --- FONCTION D'ENVOI WHATSAPP ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur API WhatsApp"); }
}

// --- RECHERCHE SQL PRÉCISE (Évite la confusion Villes/Territoires) ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = nettoyer(phrase).replace(/[?.,!]/g, "").split(" ");

    for (let mot of mots) {
        if (mot.length < 4) continue;
        try {
            const res = await pool.query(
                `SELECT province, chef_lieu, territoires
                 FROM drc_population_villes
                 WHERE LOWER(province) ILIKE $1
                 OR LOWER(territoires) ILIKE $1
                 LIMIT 1`,
                [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows[0];
        } catch (e) { console.error("Erreur SQL"); continue; }
    }
    return null;
}

// --- RAPPEL MATINAL AUTOMATIQUE (7H00 LUBUMBASHI) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const salutation = user.nom ? `Bonjour mon cher élève ${user.nom}` : "Bonjour mon cher élève";
            const messageMatin = `🔵 ${salutation} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) à apprendre quelque chose de nouveau aujourd'hui pour faire briller notre DRC ?`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur Rappel Matinal"); }
}, { timezone: "Africa/Lubumbashi" });

// --- WEBHOOK (RÉPONSE DIRECTE) ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, historique) VALUES ($1, '[]')", [from]);
            user = { phone: from, historique: '[]' };
        }

        const info = await consulterBibliotheque(text);
        let hist = JSON.parse(user.historique || '[]');

        const systemPrompt = `
<IDENTITY>
Tu es Mwalimu, Mentor et Grand Frère congolais. Ton ton est fier, expert et chaleureux.
</IDENTITY>

<DATA_STRICT>
Données officielles : ${info ? JSON.stringify(info) : "AUCUNE DONNÉE SQL."}
</DATA_STRICT>

<STRICT_RULES>
1. **Distingue les Villes des Territoires** : Matadi et Boma sont des villes, pas des territoires. Respecte strictement les données SQL fournies.
2. **Réponse structurée** :
   🔵 [VÉCU] : Accueil et anecdote courte sur le Congo.
   🟡 [SAVOIR] : Si des données SQL existent, liste TOUS les territoires de la province sans exception.
   🔴 [MENTORAT] : Un conseil pour l'avenir du pays.
3. **Température** : 0 (Ne pas inventer de données).
</STRICT_RULES>`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                ...hist.slice(-4),
                { role: "user", content: text }
            ],
            temperature: 0
        });

        const reponse = completion.choices[0].message.content;
       
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [
            JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10)),
            from
        ]);

        await envoyerWhatsApp(from, reponse);

    } catch (e) { console.error("Erreur Webhook"); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`✅ Mwalimu EdTech complet sur le port ${PORT}`));
