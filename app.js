
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

const HEADER = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const safeParseHistory = (historyStr) => {
    try {
        if (!historyStr) return [];
        const parsed = JSON.parse(historyStr);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
};

async function sendWhatsApp(to, bodyText) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            { messaging_product: "whatsapp", to, text: { body: bodyText } },
            { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
        );
    } catch (e) { console.error("Erreur WhatsApp :", e.message); }
}

/* --- WEBHOOK : RELATION PRÉCEPTEUR-ÉLÈVE --- */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
        let user = userRes.rows[0];

        // ÉTAPE A : ACCUEIL CHALEUREUX
        if (!user) {
            // Initialisation avec historique vide et nom vide
            await pool.query("INSERT INTO conversations (phone, historique, nom) VALUES ($1, $2, $3)", [from, '[]', '']);
            const welcome = `${HEADER}\n\n🔵 **Bonjour jeune patriote !** Quel bonheur de te voir ici. 😊\n\n🟡 Je suis **Mwalimu**, ton mentor dévoué.\n\n🔴 Pour commencer, **quel est ton nom et ta classe ?**`;
            return await sendWhatsApp(from, welcome);
        }

        // ÉTAPE B : COLLECTE DU NOM ET DE LA CLASSE
        if (!user.nom || user.nom.trim() === "") {
            await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [text, from]);
            const nextStep = `${HEADER}\n\n🔵 Ravi de te connaître, **${text}** ! 🤝\n\n🟡 Dis-moi, mon cher élève : **Quel est ton plus grand rêve ? Que veux-tu devenir plus tard pour servir notre pays ?** 🇨🇩`;
            return await sendWhatsApp(from, nextStep);
        }

        // ÉTAPE C : TRAITEMENT DE LA QUESTION
        const history = safeParseHistory(user.historique);
       
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es MWALIMU EDTECH, le mentor chaleureux de ${user.nom}.
                    Style : Précepteur humain, encourageant, utilise 🔵, 🟡, 🔴.`
                },
                ...history.slice(-6),
                { role: "user", content: text }
            ]
        });

        const aiReply = completion.choices[0].message.content;
        const newHistory = [...history, { role: "user", content: text }, { role: "assistant", content: aiReply }].slice(-10);
       
        await pool.query("UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2", [JSON.stringify(newHistory), from]);
        await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

    } catch (e) {
        console.error("ERREUR WEBHOOK:", e);
        // On n'envoie le message d'erreur que si ce n'est pas un problème mineur
        await sendWhatsApp(from, `${HEADER}\n\n🔴 Oh, pardonne-moi, j'ai eu un petit souci. Peux-tu me répéter ta question ?`);
    }
});

app.listen(process.env.PORT || 10000);
