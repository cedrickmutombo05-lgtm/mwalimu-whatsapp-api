
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

// LA RÈGLE D'OR : Le Header sacré (Strictement respecté)
const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba"
];

// --- ENVOI WHATSAPP ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, {
            headers: { Authorization: `Bearer ${process.env.TOKEN}` }
        });
    } catch (e) {
        console.error("Erreur WhatsApp");
    }
}

// --- LE RAPPEL DU MATIN (Lubumbashi 07:00) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, sexe FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const salutation = user.sexe === 'F' ? "ma chère élève" : "mon cher élève";
            const messageMatin = `🔵 Bonjour ${salutation} ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) pour une nouvelle journée d'excellence pour notre grand Congo ?`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) {
        console.error("Erreur Cron");
    }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE BIBLIOTHÈQUE (Version "Zéro Échec") ---
async function consulterBibliotheque(phrase) {
    const texteNettoyé = phrase.toLowerCase().replace(/[?.,!]/g, "");
    const mots = texteNettoyé.split(" ").filter(m => m.length > 2);
   
    for (let motCle of mots) {
        try {
            // Recherche Géographique
            const queryGeo = `
                SELECT 'PROVINCE: ' || province || ' | CHEF-LIEU: ' || chef_lieu || ' | TERRITOIRES: ' || territoires as res
                FROM drc_population_villes
                WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1 OR LOWER(chef_lieu) LIKE $1
                LIMIT 1
            `;
            const resGeo = await pool.query(queryGeo, [`%${motCle}%`]);
            if (resGeo.rows.length > 0) return resGeo.rows[0].res;

            // Recherche Hydrographie & FAQ
            const queryAutre = `
                SELECT 'Élément: ' || element || ' | Caractéristiques: ' || caracteristiques as res FROM drc_hydrographie WHERE LOWER(element) LIKE $1
                UNION ALL
                SELECT reponse FROM questions_reponses WHERE LOWER(question) LIKE $1
                LIMIT 1
            `;
            const resAutre = await pool.query(queryAutre, [`%${motCle}%`]);
            if (resAutre.rows.length > 0) return resAutre.rows[0].res;
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
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = userRes.rows[0];

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique, reve, sexe) VALUES ($1, '', '[]', '', '')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour nous lancer dans cette aventure, quel est ton prénom ?");
        }

        const infoBase = await consulterBibliotheque(text);
       
        let hist = [];
        if (user.historique) {
            hist = (typeof user.historique === 'string') ? JSON.parse(user.historique) : user.historique;
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, un précepteur congolais d'exception qui explique avec le vécu de notre pays.
                    ÉLÈVE : ${user.nom}, sexe ${user.sexe === 'F' ? 'Féminin' : 'Masculin'}.
                    ADRESSAGE : "${user.sexe === 'F' ? 'ma chère élève' : 'mon cher élève'}".
                   
                    RÈGLES D'OR DE RÉPONSE :
                    1. Si l'INFO_BASE est vide, ne dis pas "je n'ai pas de données". Utilise tes connaissances de tuteur pour expliquer le vécu congolais.
                    2. Si l'INFO_BASE contient des territoires, cite-les TOUS. Matadi est une VILLE, Kimvula et Luozi sont des TERRITOIRES.
                    3. Sois présent, vivant et encourageant. Rappelle à l'élève son rêve de devenir ${user.reve}.
                   
                    INFO_BASE : ${infoBase ? infoBase : "Utilise tes connaissances de précepteur humain sur la RDC."}`
                },
                ...hist.slice(-4),
                { role: "user", content: text }
            ]
        });

        const reponse = completion.choices[0].message.content;
        const newHist = [...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10);
       
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(newHist), from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) {
        const salutation = user?.sexe === 'F' ? "ma chère élève" : "mon cher élève";
        await envoyerWhatsApp(from, `🔴 Désolé ${salutation}, j'ai eu une distraction technique : ${e.message}`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech prêt.`));
