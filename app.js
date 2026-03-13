
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

// --- RAPPEL 7H00 ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            await envoyerWhatsApp(user.phone, `🔵 Bonjour mon cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) pour une journée d'excellence ?`);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE SQL FLEXIBLE (EVITE LE "JE NE DISPOSE PAS DES INFOS") ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = nettoyer(phrase).replace(/[?.,!]/g, "").split(" ");

    for (let mot of mots) {
        if (mot.length < 4) continue;
        try {
            // On cherche dans la province OU dans les territoires directement
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

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour commencer, quel est ton **prénom** ?");
        }
        else if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté, **${text}** !\n\n🟡 En quelle **classe** es-tu ?`);
        }
        else if (!user.classe) {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté.\n\n🟡 Quel est ton plus grand **rêve** pour plus tard ? 🌟`);
        }
        else if (!user.reve) {
            // Filtrage anti-salutation pour le rêve
            const salutations = ["bonjour", "mbote", "mwalimu", "hello"];
            if (salutations.some(s => text.toLowerCase().includes(s)) && text.split(" ").length < 4) {
                return await envoyerWhatsApp(from, "🔵 Bonjour ! Mais dis-moi d'abord, quel est ton plus grand **rêve** professionnel ?");
            }
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique rêve ! Je t'aiderai à devenir **${text}**.\n\n🟡 Quelle est ta question pour aujourd'hui ?`);
        }
        else {
            const info = await consulterBibliotheque(text);
            let hist = [];
            try { hist = JSON.parse(user.historique); } catch(e) { hist = []; }

            const systemPrompt = `
<persona>
Tu es Mwalimu, le précepteur humain de la RDC. Ton ton est chaleureux, grand frère, et rempli de "vécu congolais".
</persona>

<source_de_verite>
IMPORTANT : Tu DOIS utiliser les données ci-dessous. Ne résume jamais. Cite TOUT.
${info ? `PROVINCE: ${info.province} | CHEF-LIEU: ${info.chef_lieu} | TERRITOIRES: ${info.territoires}` : "AUCUNE DONNÉE SQL TROUVÉE. Parle en mentor mais reste général."}
</source_de_verite>

<framework_reponse>
1. 🔵 [VÉCU] : Accueil pour ${user.nom}. Anecdote sur la RDC (climat, transport, ambiance).
2. 🟡 [SAVOIR] : Si des données SQL sont présentes, cite le Chef-lieu et TOUS les territoires de la liste. Sans exception.
3. 🔴 [RÊVE] : Motivation finale pour devenir ${user.reve}.
</framework_reponse>

<regles>
- TEMPÉRATURE 0 : Précision maximale.
- Ne mentionne jamais que tu es une IA.
- Respecte l'ordre 🔵, 🟡, 🔴.
</regles>`;

            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: systemPrompt },
                    ...hist.slice(-4),
                    { role: "user", content: text }
                ],
                temperature: 0
            });

            const reponse = completion.choices[0].message.content;
            await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10)), from]);
            await envoyerWhatsApp(from, reponse);
        }
    } catch (e) { console.error(e); }
});

app.listen(process.env.PORT || 10000);
