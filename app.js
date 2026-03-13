
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

// --- IDENTITÉ ET SAGESSE ---
const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba",
    "« L'excellence n'est pas une action, c'est une habitude. »"
];

// --- FONCTION D'ENVOI ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur API WhatsApp"); }
}

// --- LE RAPPEL DU MATIN (7H00 LUBUMBASHI) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const messageMatin = `🔵 Bonjour cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Aujourd'hui, chaque effort compte pour ton rêve de devenir ${user.reve || 'un leader'}.`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur Cron matinal"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE SQL SÉCURISÉE ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = nettoyer(phrase).replace(/[?.,!]/g, "").split(" ");

    for (let mot of mots) {
        if (mot.length < 4) continue;
        try {
            const res = await pool.query(
                `SELECT * FROM drc_population_villes WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1 LIMIT 1`,
                [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows[0];
        } catch (e) { console.error("Erreur SQL recherche"); }
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
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?");
        }
        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${text}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté. Quel est ton plus grand **rêve** professionnel ?`);
        }
        if (!user.reve) {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir **${text}**.\n\n🟡 Pose-moi ta question.`);
        }

        // --- TRAITEMENT DE LA QUESTION ---
        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
       
        // Sécurité SQL -> IA
        let fluxDonnees = "AUCUNE DONNÉE";
        if (info) {
            const v = Object.values(info); // Protection anti-undefined
            fluxDonnees = `PROVINCE: ${info.province || v[1]} | CHEF-LIEU: ${info.chef_lieu || v[2]} | TERRITOIRES: ${info.territoires || v[3]}`;
        }

        let hist = [];
        try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

        const systemPrompt = `
Tu es Mwalimu, Mentor Congolais.
ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : ${user.reve}

<SOURCE_VERIFIEE>
${fluxDonnees}
</SOURCE_VERIFIEE>

<INSTRUCTIONS_ANECDOTES>
Utilise ces anecdotes pour le bloc 🔵 :
- Matadi : Port vital de la RDC.
- Kisangani : Chutes Wagenia et pêche courageuse.
- Katanga : Richesse minière et résilience.
- Maniema : Train Colombe et lien social.
</INSTRUCTIONS_ANECDOTES>

<STRUCTURE_OBLIGATOIRE>
🔵 [VÉCU] : Anecdote sur la RDC pour ${user.nom}.
🟡 [SAVOIR] : Si <SOURCE_VERIFIEE> n'est pas "AUCUNE DONNÉE", recopie exactement Chef-lieu et Territoires.
🔴 [INSPIRATION] : Relie le savoir au rêve (${user.reve}). Termine par : "${citAleatoire}".
</STRUCTURE_OBLIGATOIRE>

RÈGLE : Température 0. Si VIDE, demande de nommer une province.
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0
        });

        const reponse = completion.choices[0].message.content;
        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) { console.error("Crash Webhook:", e.message); }
});

app.listen(process.env.PORT || 10000);
