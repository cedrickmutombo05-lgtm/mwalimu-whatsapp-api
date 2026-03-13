
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
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »"
];

// --- LOG DE CONNEXION DB ---
pool.connect((err) => {
    if (err) console.error("❌ ERREUR CONNEXION DB:", err.stack);
    else console.log("✅ CONNECTÉ À LA BASE DE DONNÉES");
});

async function envoyerWhatsApp(to, texte) {
    try {
        console.log(`--- Tentative d'envoi à ${to} ---`);
        const response = await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
        console.log("✅ Message envoyé avec succès");
    } catch (e) {
        console.error("❌ ERREUR WHATSAPP:", e.response ? e.response.data : e.message);
    }
}

async function consulterBibliotheque(phrase) {
    console.log(`🔎 Recherche SQL pour: "${phrase}"`);
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = nettoyer(phrase).replace(/[?.,!]/g, "").split(" ");

    for (let mot of mots) {
        if (mot.length < 4) continue;
        try {
            const res = await pool.query(
                `SELECT province, chef_lieu, territoires FROM drc_population_villes
                 WHERE LOWER(province) ILIKE $1 OR LOWER(territoires) ILIKE $1 LIMIT 1`,
                [`%${mot}%`]
            );
            if (res.rows.length > 0) {
                console.log("📍 Données trouvées dans le SQL");
                return res.rows[0];
            }
        } catch (e) { console.error("❌ Erreur SQL:", e.message); }
    }
    console.log("⚠️ Aucune donnée SQL trouvée");
    return null;
}

// --- VERIFICATION DU WEBHOOK (Obligatoire pour Meta) ---
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode && token === "MWALIMU_TOKEN") { // Remplace par ton verify_token si différent
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

app.post("/webhook", async (req, res) => {
    console.log("📩 Nouveau message reçu sur le Webhook");
    res.sendStatus(200);

    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        if (!user) {
            console.log("🆕 Nouvel utilisateur détecté");
            await pool.query("INSERT INTO conversations (phone, historique) VALUES ($1, '[]')", [from]);
            user = { phone: from, historique: '[]' };
        }

        const info = await consulterBibliotheque(text);
        let hist = JSON.parse(user.historique || '[]');

        console.log("🤖 Appel à OpenAI...");
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "Tu es Mwalimu, un mentor congolais expert. Réponds en 3 parties : 🔵 Anecdote, 🟡 Savoir (utilise le SQL fourni), 🔴 Conseil." },
                { role: "system", content: info ? `DONNÉES SQL: ${JSON.stringify(info)}` : "Pas de données SQL." },
                ...hist.slice(-4),
                { role: "user", content: text }
            ],
            temperature: 0
        });

        const reponse = completion.choices[0].message.content;
        console.log("✍️ Réponse générée par l'IA");

        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [
            JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10)),
            from
        ]);

        await envoyerWhatsApp(from, reponse);

    } catch (e) {
        console.error("❌ ERREUR GLOBALE WEBHOOK:", e);
    }
});

// --- CRON JOB ---
cron.schedule("0 7 * * *", async () => {
    console.log("⏰ Lancement du rappel matinal...");
    try {
        const res = await pool.query("SELECT phone FROM conversations");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            await envoyerWhatsApp(user.phone, `🔵 Bonjour !\n\n🟡 ${cit}\n\n🔴 Prêt pour aujourd'hui ?`);
        }
    } catch (e) { console.error("❌ Erreur Cron:", e); }
}, { timezone: "Africa/Lubumbashi" });

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 SERVEUR PRÊT SUR LE PORT ${PORT}`));
