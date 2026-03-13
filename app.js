
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

// --- RÈGLE D'OR : L'IDENTITÉ VISUELLE ---
const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

// --- LA SAGESSE DE MWALIMU ---
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

// --- LE RAPPEL HUMAIN (CRON 7H00 LUBUMBASHI) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const messageMatin = `🔵 Bonjour mon cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) à apprendre quelque chose de nouveau aujourd'hui pour faire briller notre DRC ?`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur lors du rappel matinal"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE SQL ROBUSTE ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = nettoyer(phrase).replace(/[?.,!]/g, "").split(" ");

    for (let mot of mots) {
        if (mot.length < 3) continue;
        try {
            const res = await pool.query(
                `SELECT province, chef_lieu, territoires FROM drc_population_villes
                 WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1
                 ORDER BY (LOWER(province) = $2) DESC LIMIT 1`,
                [`%${mot}%`, mot]
            );
            if (res.rows.length > 0) return res.rows[0];
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
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // --- ENRÔLEMENT ---
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour commencer, quel est ton **prénom** ?");
        } else if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté, **${text}** !\n\n🟡 En quelle **classe** es-tu ? (ex: 6ème Primaire, 4ème Humanités...)`);
        } else if (!user.classe) {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté.\n\n🟡 Quel est ton plus grand **rêve** professionnel ? 🌟`);
        } else if (!user.reve) {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique rêve ! Je t'aiderai à devenir **${text}**.\n\n🟡 Pose-moi ta question pour aujourd'hui.`);
        } else {
            // --- TUTORAT AVEC PRÉCISION ---
            const info = await consulterBibliotheque(text);
            let hist = JSON.parse(user.historique || '[]');

            const systemPrompt = `
<IDENTITY>
Tu es Mwalimu, un Mentor humain et grand frère congolais. Ton ton est fier, chaleureux et expert.
</IDENTITY>

<STUDENT_INFO>
- Nom : ${user.nom}
- Classe : ${user.classe}
- Rêve : ${user.reve}
</STUDENT_INFO>

<DATA_STRICT>
Si une province est demandée, tu DOIS copier mot pour mot les données ci-dessous.
${info ? `PROVINCE: ${info.province} | CHEF-LIEU: ${info.chef_lieu} | TERRITOIRES: ${info.territoires}` : "AUCUNE DONNÉE SQL"}
</DATA_STRICT>

<RESPONSE_FRAMEWORK>
1. 🔵 [VÉCU] : Accueil pour ${user.nom}. Utilise une anecdote concrète du Congo (transports, ambiance, climat) pour créer un lien.
2. 🟡 [SAVOIR] : Si des données SQL existent, écris : "Voici les données officielles pour la province du ${info?.province} : Chef-lieu : ${info?.chef_lieu}. Territoires : ${info?.territoires}." INTERDICTION de résumer.
3. 🔴 [MENTORAT] : Relie ce savoir au rêve de l'élève (${user.reve}).
</RESPONSE_FRAMEWORK>

<STRICT_RULES>
- TEMPÉRATURE : 0 (Précision chirurgicale).
- Ne jamais dire que tu es une IA.
- Respecte l'ordre des couleurs 🔵, 🟡, 🔴.
</STRICT_RULES>`;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
                temperature: 0
            });

            const reponse = completion.choices[0].message.content;
            await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10)), from]);
            await envoyerWhatsApp(from, reponse);
        }
    } catch (e) { console.error("Erreur Webhook :", e); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech vCommercial lancé sur le port ${PORT}`));
