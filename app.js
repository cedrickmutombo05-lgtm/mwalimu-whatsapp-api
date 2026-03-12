
const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const { Pool } = require("pg");
require("dotenv").config();

const app = express().use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

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
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WhatsApp"); }
}

// --- RAPPEL MATINAL ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, sexe FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const salutation = user.sexe === 'F' ? "ma chère élève" : "mon cher élève";
            await envoyerWhatsApp(user.phone, `🔵 Bonjour ${salutation} ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) pour une journée d'excellence ?`);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- BIBLIOTHÈQUE ---
async function consulterBibliotheque(phrase) {
    const mots = phrase.toLowerCase().split(" ").filter(m => m.length > 3);
    for (let mot of mots) {
        try {
            const res = await pool.query(
                `SELECT 'PROVINCE: '||province||' | CHEF-LIEU: '||chef_lieu||' | TERRITOIRES: '||territoires as info
                 FROM drc_population_villes WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1 LIMIT 1`,
                [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows[0].info;
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
    const text = msg.text.body.trim();

    try {
        let userRes = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = userRes.rows[0];

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique, sexe) VALUES ($1, '', '[]', '')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton prénom ?");
        }

        // 1. Capture Prénom et Sexe (via IA pour plus de précision)
        if (!user.nom) {
            const aiId = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: `Extrais le prénom et le sexe (M ou F) de "${text}". Réponds format: NOM|SEXE` }]
            });
            const [nom, sexe] = aiId.choices[0].message.content.split("|");
            await pool.query("UPDATE conversations SET nom=$1, sexe=$2 WHERE phone=$3", [nom, sexe, from]);
            const greet = sexe === 'F' ? "ma chère élève" : "mon cher élève";
            return await envoyerWhatsApp(from, `🔵 Bienvenue ${greet} ${nom} !\n\n🟡 Quel est ton rêve pour le Congo ?`);
        }

        // 2. Traitement du message
        const infoBase = await consulterBibliotheque(text);
        let hist = [];
        try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, précepteur congolais.
                    ÉLÈVE: ${user.nom}, ${user.sexe === 'F' ? 'Féminin' : 'Masculin'}.
                    ADRESSAGE: "${user.sexe === 'F' ? 'ma chère élève' : 'mon cher élève'}".
                   
                    CONSIGNES:
                    1. Utilise l'INFO_BASE comme source unique. Ne la résume JAMAIS.
                    2. Ne confonds pas Chef-lieu (Ville) et Territoires.
                    3. Parle du vécu congolais avec chaleur et patriotisme.
                   
                    INFO_BASE: ${infoBase || "Aucune donnée. Réponds avec ta sagesse congolaise."}`
                },
                ...hist.slice(-4),
                { role: "user", content: text }
            ],
            temperature: 0.3
        });

        const reponse = completion.choices[0].message.content;
        const newHist = [...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10);
       
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(newHist), from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) {
        console.error(e);
        await envoyerWhatsApp(from, "🔴 Mon cher élève, j'ai eu une petite distraction technique. Reposons la question !");
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Mwalimu EdTech opérationnel."));
