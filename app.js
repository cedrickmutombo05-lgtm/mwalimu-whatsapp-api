
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

// --- RÈGLE D'OR : LE HEADER MWALIMU ---
const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba"
];

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WhatsApp"); }
}

// --- RAPPEL 7H00 (LUBUMBASHI) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            await envoyerWhatsApp(user.phone, `🔵 Bonjour mon cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) pour une journée d'excellence pour notre DRC ?`);
        }
    } catch (e) { console.error("Erreur Cron Morning"); }
}, { timezone: "Africa/Lubumbashi" });

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

        // 1. INITIALISATION
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour commencer, quel est ton **prénom** ?");
        }

        // 2. NOM
        else if (!user.nom || user.nom.trim() === "") {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté, **${text}** !\n\n🟡 En quelle **classe** es-tu ?`);
        }

        // 3. CLASSE
        else if (!user.classe || user.classe.trim() === "") {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté. Le niveau de **${text}** demande du courage.\n\n🟡 Quel est ton plus grand **rêve** pour plus tard ? 🌟`);
        }

        // 4. RÊVE
        else if (!user.reve || user.reve.trim() === "") {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique rêve ! Je t'aiderai à devenir **${text}**.\n\n🟡 Quelle est ta question pour aujourd'hui ?`);
        }

        // 5. TUTORAT VIVANT (PRÉCEPTEUR HUMAIN)
        else {
            let hist = [];
            try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Tu es Mwalimu, un précepteur humain, grand frère et mentor congolais.
                       
                        TON IDENTITÉ :
                        - Tu parles avec le cœur, en utilisant le vécu de la RDC (ex: parler des réalités du pays, de l'importance de reconstruire notre nation).
                        - Tu es chaleureux, pas un robot encyclopédique.
                        - Tu encourages ${user.nom} pour son rêve de devenir ${user.reve}.
                       
                        RÈGLE D'OR DU FORMATAGE :
                        - Chaque paragraphe d'explication DOIT impérativement commencer par une boule de couleur différente (🔵, 🟡, ou 🔴).
                        - Exemple :
                          🔵 [Ton introduction chaleureuse]
                          🟡 [Ton explication détaillée avec vécu congolais]
                          🔴 [Ton encouragement lié au rêve de l'élève]
                       
                        RIGOURE GEOGRAPHIQUE :
                        - Donne toujours le Chef-lieu et TOUS les territoires si on te pose une question sur une province.`
                    },
                    ...hist.slice(-4),
                    { role: "user", content: text }
                ],
                temperature: 0.8
            });

            const reponse = completion.choices[0].message.content;
            await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10)), from]);
            await envoyerWhatsApp(from, reponse);
        }

    } catch (e) { console.error("Erreur Webhook:", e); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Mwalimu prêt."));
