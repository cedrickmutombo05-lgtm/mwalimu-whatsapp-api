
require('dotenv').config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");

const app = express();
app.use(express.json({ limit: '1mb' }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- INITIALISATION ---
const initDB = async () => {
    try {
        await pool.query("CREATE EXTENSION IF NOT EXISTS unaccent;");
        await pool.query(`CREATE TABLE IF NOT EXISTS processed_messages (msg_id TEXT PRIMARY KEY, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
        console.log("✅ Système de données prêt.");
    } catch (e) { console.error("❌ Erreur Init DB:", e.message); }
};
initDB();

const HEADER_MWALIMU = "🔴🟡🔵 **Mwalimu EdTech : Ton Mentor pour l'Excellence** 🇨🇩";
const CITATIONS = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***"
];

// --- 1. RAPPEL DU MATIN ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows } = await pool.query("SELECT phone, nom FROM conversations WHERE nom != ''");
        for (const u of rows) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            await envoyerWhatsApp(u.phone, `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${u.nom}** !\n\nLe Congo compte sur toi. Prépare ton esprit.\n\n${cit}`);
            await new Promise(r => setTimeout(r, 400));
        }
    } catch (e) { console.error("Cron Error"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- 2. RECHERCHE SQL (Version Simplifiée et Bavarde) ---
async function consulterBibliotheque(question) {
    if (!question || question.length < 3) return null;
    const cleanQ = question.toLowerCase().trim();
   
    try {
        // On prend le mot le plus long de la question (souvent le sujet : "Kindu", "Drapeau", "Maniema")
        const words = cleanQ.split(/\s+/).filter(w => w.length > 3);
        const keyword = words.length > 0 ? `%${words[words.length - 1]}%` : `%${cleanQ}%`;

        console.log(`🔎 Mwalimu fouille la DB pour le mot-clé : ${keyword}`);

        const query = `
            SELECT sujet, contenu FROM bibliotheque_mwalimu
            WHERE unaccent(sujet) ILIKE $1 OR unaccent(contenu) ILIKE $1
            ORDER BY (unaccent(sujet) ILIKE $1) DESC LIMIT 1`;
       
        const res = await pool.query(query, [keyword]);

        if (res.rows.length > 0) {
            console.log(`✅ TROUVÉ dans la DB : ${res.rows[0].sujet}`);
            return `FICHE OFFICIELLE [${res.rows[0].sujet}] : ${res.rows[0].contenu}`;
        } else {
            console.log(`❌ RIEN TROUVÉ dans la DB pour : ${keyword}`);
            return null;
        }
    } catch (e) {
        console.error("❌ Erreur SQL Recherché :", e.message);
        return null;
    }
}

// --- 3. OUTILS ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            { messaging_product: "whatsapp", to, text: { body: texte } },
            { headers: { Authorization: `Bearer ${process.env.TOKEN}` }, timeout: 10000 }
        );
    } catch (e) { console.error(`Err WA ${to}`); }
}

function nettoyer(t) {
    return t.replace(/mon prénom est|je m'appelle|mon nom est|je suis en|ma classe est|mon rêve est/gi, "")
            .replace(/[.,!?;: ]+/g, " ").trim();
}

// --- 4. WEBHOOK ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;
   
    const from = msg.from;
    const text = msg.text.body;
    const msgId = msg.id;

    try {
        const check = await pool.query("INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT DO NOTHING", [msgId]);
        if (check.rowCount === 0) return;

        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // Inscription
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor. Quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            const nom = nettoyer(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return await envoyerWhatsApp(from, `🤝 Enchanté **${nom}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            const classe = nettoyer(text);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [classe, from]);
            return await envoyerWhatsApp(from, `🟡 Quel est ton plus grand **rêve** professionnel ?`);
        }
        if (!user.reve) {
            const reve = nettoyer(text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reve, from]);
            return await envoyerWhatsApp(from, `🔴 Magnifique ! Devenir **${reve}** est une noble ambition. Pose-moi ta question.`);
        }

        // IA
        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: `Tu es Mwalimu EdTech, mentor congolais. Ton ton est chaleureux, exigeant et pédagogue.
                S'ADRESSER À : ${user.nom}, future ${user.reve}.
                SOURCE DE VÉRITÉ : """${savoirSQL || "Savoir général."}"""
                RÈGLE : Si la SOURCE est présente, utilise ses chiffres et détails précis. Si elle est absente, explique que tu n'as pas encore la fiche officielle.
                ORDRE : 🔵[VÉCU], 🟡[SAVOIR], 🔴[INSPIRATION], ❓[CONSOLIDATION], 👉[OUVERTURE].` },
                ...historique.slice(-4),
                { role: "user", content: text }
            ],
            temperature: 0.2
        });

        const reponse = completion.choices[0].message.content;
        const nHist = JSON.stringify([...historique, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nHist, from]);

        const messageFinal = savoirSQL ? `${HEADER_MWALIMU}\n________________________________\n\n${reponse}\n\n\n${CITATIONS[0]}` : `🎓 **Mwalimu** :\n\n${reponse}`;
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) {
        console.error("Master Error:", e.message);
        await envoyerWhatsApp(from, "🔵 [VÉCU] : Mon esprit a besoin d'une pause technique. Repose ta question dans une minute !");
    }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Mwalimu prêt sur port ${PORT}`));
