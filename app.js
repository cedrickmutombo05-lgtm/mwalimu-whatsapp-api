
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

// --- RAPPEL DE 7H (RÈGLE D'OR) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »";
            await envoyerWhatsApp(user.phone, `🔵 Bonjour mon cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt pour l'excellence ?`);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WhatsApp"); }
}

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // ÉTAPE 0 : CRÉATION (SÉCURISÉE)
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?");
        }

        // ÉTAPE 1 : NOM
        if (!user.nom || user.nom === "") {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté, **${text}** !\n\n🟡 En quelle **classe** es-tu ?`);
        }

        // ÉTAPE 2 : CLASSE
        if (!user.classe || user.classe === "") {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Très bien.\n\n🟡 Quel est ton plus grand **rêve** ?`);
        }

        // ÉTAPE 3 : RÊVE
        if (!user.reve || user.reve === "") {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique rêve ! Je t'aiderai à devenir ${text}.\n\n🟡 Quelle est ta question ?`);
        }

        // ÉTAPE 4 : TUTORAT
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: "Tu es Mwalimu, précepteur congolais." }, { role: "user", content: text }],
            temperature: 0.2
        });
        await envoyerWhatsApp(from, completion.choices[0].message.content);

    } catch (e) {
        console.error(e);
        // Si ça plante ici, c'est un problème de colonnes SQL.
    }
});

app.listen(process.env.PORT || 10000);
