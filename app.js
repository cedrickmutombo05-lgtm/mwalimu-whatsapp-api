
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

// --- RÈGLE D'OR : IDENTITÉ VISUELLE ---
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
    } catch (e) { console.error("Erreur API WhatsApp"); }
}

// --- RAPPEL 7H00 (LUBUMBASHI) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            await envoyerWhatsApp(user.phone, `🔵 Bonjour mon cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) pour une journée d'excellence pour notre pays ?`);
        }
    } catch (e) { console.error("Erreur Cron Morning"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE SQL (STRICTE) ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const mots = phrase.toLowerCase().replace(/[?.,!]/g, "").split(" ");
    for (let mot of mots) {
        if (mot.length < 4) continue;
        try {
            const res = await pool.query(
                `SELECT province, chef_lieu, territoires FROM drc_population_villes
                 WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1 LIMIT 1`,
                [`%${mot}%`]
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

        // 1. PHASE D'ENRÔLEMENT
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour commencer, quel est ton **prénom** ?");
        }
        else if (!user.nom || user.nom === "") {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté, **${text}** !\n\n🟡 En quelle **classe** es-tu ?`);
        }
        else if (!user.classe || user.classe === "") {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté.\n\n🟡 Quel est ton plus grand **rêve** pour plus tard ? 🌟`);
        }
        else if (!user.reve || user.reve === "") {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique rêve ! Je t'aiderai à devenir **${text}**.\n\n🟡 Quelle est ta question pour aujourd'hui ?`);
        }
       
        // 2. PHASE DE TUTORAT (TEMPÉRATURE 0)
        else {
            const info = await consulterBibliotheque(text);
            let hist = [];
            try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

            const systemPrompt = `
TU ES MWALIMU, PRÉCEPTEUR CONGOLAIS ET MENTOR HUMAIN.
TON OBJECTIF : Répondre avec rigueur et humanité.

<CONTEXTE_ELEVE>
- Nom : ${user.nom}
- Classe : ${user.classe}
- Rêve : ${user.reve}
</CONTEXTE_ELEVE>

<CONTRAINTES_STRICTES>
1. TEMPÉRATURE 0 : Ne jamais inventer de données.
2. SOURCE DE VÉRITÉ : Utilise EXCLUSIVEMENT les données ci-dessous pour la géographie.
3. EXHAUSTIVITÉ : Si des territoires sont listés, tu DOIS tous les citer sans exception.
</CONTRAINTES_STRICTES>

<DATA_SQL>
${info ? `PROVINCE: ${info.province} | CHEF-LIEU: ${info.chef_lieu} | TERRITOIRES: ${info.territoires}` : "AUCUNE DONNÉE TROUVÉE"}
</DATA_SQL>

<FORMAT_REPONSE>
🔵 INTRODUCTION : Accueil chaleureux pour ${user.nom} avec un détail du vécu congolais (ex: transport, climat, fierté nationale).
🟡 DÉVELOPPEMENT : Si <DATA_SQL> existe, cite le Chef-lieu et la liste INTÉGRALE des territoires.
🔴 CONCLUSION : Motivation puissante liée au rêve de devenir ${user.reve}.
</FORMAT_REPONSE>
`;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...hist.slice(-4),
                    { role: "user", content: text }
                ],
                temperature: 0 // AUCUNE HALLUCINATION TOLÉRÉE
            });

            const reponse = completion.choices[0].message.content;
            await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10)), from]);
            await envoyerWhatsApp(from, reponse);
        }
    } catch (e) { console.error("Erreur Webhook:", e); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Mwalimu EdTech (Précision SQL) opérationnel."));
