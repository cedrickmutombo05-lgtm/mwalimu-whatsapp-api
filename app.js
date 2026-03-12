
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

// --- LA RÈGLE D'OR (STRICTE) ---
const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba"
];

// --- FONCTION D'ENVOI ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WhatsApp"); }
}

// --- RAPPEL MATINAL (7h00 LUBUMBASHI) ---
cron.schedule("0 7 * * *", async () => {
    console.log("Exécution du rappel matinal...");
    try {
        const res = await pool.query("SELECT phone, nom, sexe FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const salut = user.sexe === 'F' ? "ma chère élève" : "mon cher élève";
            await envoyerWhatsApp(user.phone, `🔵 Bonjour ${salut} ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) pour une journée d'excellence ?`);
        }
    } catch (e) { console.error("Erreur Cron Morning"); }
}, { timezone: "Africa/Lubumbashi" });

// --- ANTI-SOMMEIL (Pour Render/Railway) ---
setInterval(() => {
    console.log("Mwalimu reste éveillé...");
    // Cette fonction simule une activité interne pour éviter que le serveur ne s'éteigne
}, 600000); // Toutes les 10 minutes

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

        // LOGIQUE D'INSCRIPTION (CASCADE)
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, sexe, classe, reve, historique) VALUES ($1, '', '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Quel est ton **prénom** ?");
        }
        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté, **${text}** !\n\n🟡 Es-tu un garçon ou une fille ?`);
        }
        if (!user.sexe) {
            const s = text.toLowerCase().includes("fille") ? "F" : "M";
            await pool.query("UPDATE conversations SET sexe=$1 WHERE phone=$2", [s, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté.\n\n🟡 En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Très bien.\n\n🟡 Quel est ton plus grand **rêve** ? 🌟`);
        }
        if (!user.reve) {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique rêve ! Je t'aiderai à devenir ${text}.\n\n🟡 Quelle est ta question ?`);
        }

        // TUTORAT
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: "Tu es Mwalimu, précepteur congolais." }, { role: "user", content: text }],
            temperature: 0.2
        });
        await envoyerWhatsApp(from, completion.choices[0].message.content);

    } catch (e) {
        await envoyerWhatsApp(from, "🔴 Désolé, j'ai une distraction technique.");
    }
});

app.listen(process.env.PORT || 10000);
