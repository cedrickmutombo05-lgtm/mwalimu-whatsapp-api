
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

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba"
];

const safeParseHistory = (historyStr) => {
    try {
        if (!historyStr) return [];
        const parsed = JSON.parse(historyStr);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

async function sendWhatsApp(to, bodyText) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            { messaging_product: "whatsapp", to, text: { body: bodyText } },
            { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
        );
    } catch (e) {
        console.error("Erreur WhatsApp :", e.message);
    }
}

/* RAPPEL MATIN */
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        const citation = citations[Math.floor(Math.random() * citations.length)];

        for (const user of res.rows) {
            const msg = `${HEADER}

🔵 Bonjour mon cher ${user.nom}

🟡 "${citation}"

🔴 Prêt pour tes révisions aujourd'hui ?`;

            await sendWhatsApp(user.phone, msg);
        }
    } catch {
        console.error("Erreur Cron");
    }
}, { timezone: "Africa/Lubumbashi" });

/* RECHERCHE DANS LA BASE */
async function chercherDansBibliotheque(question) {
    try {

        const q = question.toLowerCase();

        /* 1 QUESTIONS_REPONSES */
        let res = await pool.query(
            `SELECT reponse
             FROM questions_reponses
             WHERE LOWER(question) ILIKE '%' || LOWER($1) || '%'
             LIMIT 1`,
            [question]
        );

        if (res.rows.length > 0) {
            return res.rows[0].reponse;
        }

        /* 2 HYDROGRAPHIE */
        res = await pool.query(
            `SELECT caracteristiques
             FROM drc_hydrographie
             WHERE LOWER(element) ILIKE '%' || LOWER($1) || '%'
                OR LOWER(caracteristiques) ILIKE '%' || LOWER($1) || '%'
             LIMIT 1`,
            [question]
        );

        if (res.rows.length > 0) {
            return res.rows[0].caracteristiques;
        }

        /* 3 PROVINCES */
        const provRes = await pool.query(
            `SELECT province, chef_lieu, territoires
             FROM drc_population_villes`
        );

        const provinceTrouvee = provRes.rows.find(row =>
            q.includes((row.province || "").toLowerCase())
        );

        if (provinceTrouvee) {

            if (q.includes("territoire")) {
                return `Les territoires de la province du ${provinceTrouvee.province} sont : ${provinceTrouvee.territoires}.`;
            }

            if (q.includes("chef-lieu") || q.includes("chef lieu")) {
                return `Le chef-lieu de la province du ${provinceTrouvee.province} est ${provinceTrouvee.chef_lieu}.`;
            }

            return `${provinceTrouvee.province} a pour chef-lieu ${provinceTrouvee.chef_lieu}. Ses territoires sont : ${provinceTrouvee.territoires}.`;
        }

        return null;

    } catch (e) {
        console.error("Erreur bibliothèque :", e.message);
        return null;
    }
}

/* WEBHOOK */
app.post("/webhook", async (req, res) => {

    res.sendStatus(200);

    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {

        const userRes = await pool.query("SELECT * FROM conversations WHERE phone=$1",[from]);
        let user = userRes.rows[0];

        if (!user) {

            await pool.query(
                "INSERT INTO conversations (phone,historique,nom) VALUES ($1,$2,$3)",
                [from,'[]','']
            );

            const welcome = `${HEADER}

🔵 Bonjour jeune patriote

🟡 Je suis Mwalimu

🔴 Dis-moi ton nom et ta classe`;

            return await sendWhatsApp(from,welcome);
        }

        if (!user.nom || user.nom.trim()==="") {

            await pool.query(
                "UPDATE conversations SET nom=$1 WHERE phone=$2",
                [text,from]
            );

            const ambition = `${HEADER}

🔵 Ravi de te connaître ${text}

🟡 Quel est ton rêve ?

🔴 Que veux-tu devenir plus tard ?`;

            return await sendWhatsApp(from,ambition);
        }

        const reponseBase = await chercherDansBibliotheque(text);
        const history = safeParseHistory(user.historique);

        if (reponseBase) {

            const newHistory = [
                ...history,
                { role:"user",content:text },
                { role:"assistant",content:reponseBase }
            ].slice(-10);

            await pool.query(
                "UPDATE conversations SET historique=$1 WHERE phone=$2",
                [JSON.stringify(newHistory),from]
            );

            return await sendWhatsApp(from,`${HEADER}

${reponseBase}`);
        }

        /* OPENAI SI BASE VIDE */
        const completion = await openai.chat.completions.create({
            model:"gpt-4o",
            messages:[
                {
                    role:"system",
                    content:`Tu es MWALIMU.
Réponds en maximum 3 lignes.
Si tu ne sais pas dis : "Je n’ai pas encore cette donnée dans ma bibliothèque."`
                },
                ...history.slice(-8),
                { role:"user",content:text }
            ]
        });

        const aiReply = completion.choices[0].message.content;

        const newHistory = [
            ...history,
            { role:"user",content:text },
            { role:"assistant",content:aiReply }
        ].slice(-10);

        await pool.query(
            "UPDATE conversations SET historique=$1 WHERE phone=$2",
            [JSON.stringify(newHistory),from]
        );

        await sendWhatsApp(from,`${HEADER}

${aiReply}`);

    } catch(e){

        console.error(e);

        await sendWhatsApp(from,`${HEADER}

🔴 Petit souci technique. Répète ta question.`);
    }
});

app.listen(process.env.PORT || 10000);
