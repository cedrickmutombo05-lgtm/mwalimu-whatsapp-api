
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

// RÈGLE D'OR : Italique pur, boules au début, drapeau à la fin, pas d'astérisques superflus
const HEADER = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. » - François Rabelais",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »"
];

async function sendWhatsApp(to, bodyText) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            { messaging_product: "whatsapp", to, text: { body: bodyText } },
            { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
        );
    } catch (e) { console.error("Erreur WhatsApp :", e.message); }
}

/* --- RAPPEL MATINAL (07:00 LUBUMBASHI) --- */
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations");
        const citation = citations[Math.floor(Math.random() * citations.length)];
        for (const user of res.rows) {
            const msg = `${HEADER}\n\n🔵 **Bonjour ${user.nom || "cher élève"} !**\n\n🟡 *"${citation}"*\n\n🔴 Le Congo compte sur ton génie. Prêt pour ton tutorat approfondi ?`;
            await sendWhatsApp(user.phone, msg);
        }
    } catch (e) { console.log("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

/* --- WEBHOOK : LOGIQUE DE TUTORAT ET MÉMOIRE --- */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
        let user = userRes.rows[0];

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, historique) VALUES ($1, $2)", [from, '[]']);
            return await sendWhatsApp(from, `${HEADER}\n\n🔵 **Bienvenu(e) jeune patriote !** 😊\n\n🟡 Je suis **Mwalimu EdTech**, ton précepteur.\n\n🔴 Quel est ton **nom** et ta **classe** ?`);
        }

        const resGeo = await pool.query(
            "SELECT nom, description FROM drc_data WHERE nom ILIKE $1 OR description ILIKE $1 LIMIT 5",
            [`%${text.toLowerCase()}%`]
        );
        let context = resGeo.rows.length > 0 ? resGeo.rows.map(r => `[SOURCE RDC : ${r.nom} : ${r.description}]`).join("\n") : "";

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es MWALIMU EDTECH. Méthode : Explique le concept, donne un exemple congolais, conclue avec précision. Source : ${context}.`
                },
                ...JSON.parse(user.historique || '[]').slice(-6),
                { role: "user", content: text }
            ]
        });

        const aiReply = completion.choices[0].message.content;
        await pool.query("UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2", [JSON.stringify([...JSON.parse(user.historique || '[]'), {role:"user", content:text}, {role:"assistant", content:aiReply}].slice(-10)), from]);

        await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);
    } catch (e) { await sendWhatsApp(from, `${HEADER}\n\n🔴 Oups ! Repose ta question.`); }
});

app.listen(process.env.PORT || 10000);
