
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

// --- 1. INITIALISATION & OPTIMISATION DB ---
const initDB = async () => {
    try {
        await pool.query("CREATE EXTENSION IF NOT EXISTS unaccent;");
        // Table anti-doublon
        await pool.query(`CREATE TABLE IF NOT EXISTS processed_messages (
            msg_id TEXT PRIMARY KEY, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );`);
        // Indexation pour la vitesse de recherche à grande échelle
        await pool.query("CREATE INDEX IF NOT EXISTS idx_biblio_sujet ON bibliotheque_mwalimu USING gin(to_tsvector('french', sujet));");
        console.log("🚀 Bases de données optimisées.");
    } catch (e) { console.error("Init Error:", e.message); }
};
initDB();

const HEADER_MWALIMU = "🔴🟡🔵 **Mwalimu EdTech : Ton Mentor pour l'Excellence** 🇨🇩";
const CITATIONS = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***"
];

// --- 2. TÂCHES AUTOMATISÉES (CRON) ---

// A. RAPPEL DU MATIN (07:00) - Envoi Turbo par rafales
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom != ''");
        const batchSize = 25;
        for (let i = 0; i < eleves.length; i += batchSize) {
            const batch = eleves.slice(i, i + batchSize);
            await Promise.all(batch.map(u => {
                const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
                return envoyerWhatsApp(u.phone, `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${u.nom}** !\n\nLe soleil se lève. Prépare ton esprit, le Congo compte sur toi.\n\n${cit}`);
            }));
            await new Promise(r => setTimeout(r, 200)); // Protection CPU
        }
    } catch (e) { console.error("Cron Morning Error"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// B. NETTOYAGE DE NUIT (03:00) - Pour garder une DB légère
cron.schedule('0 3 * * *', async () => {
    await pool.query("DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '1 day'");
    console.log("🧹 Nettoyage des logs effectué.");
}, { scheduled: true, timezone: "Africa/Lubumbashi" });


// --- 3. LOGIQUE MÉTIER & RECHERCHE ---

const cacheSavoir = new Map(); // Cache simple en mémoire

async function consulterBibliotheque(question) {
    if (!question || question.length < 3) return null;
    const cleanQ = question.toLowerCase().trim();
   
    if (cacheSavoir.has(cleanQ)) return cacheSavoir.get(cleanQ);

    try {
        const words = cleanQ.split(/\s+/).filter(w => w.length > 2);
        const search = words.map(w => `%${w}%`);
        const query = `
            SELECT contenu FROM bibliotheque_mwalimu
            WHERE unaccent(sujet) ILIKE ANY($1) OR unaccent(contenu) ILIKE ANY($1)
            ORDER BY (unaccent(sujet) ILIKE ANY($1)) DESC LIMIT 3`;
       
        const res = await pool.query(query, [search]);
        const data = res.rows.length > 0 ? res.rows.map(r => r.contenu).join("\n\n") : null;
       
        if (data) cacheSavoir.set(cleanQ, data); // Mise en cache
        return data;
    } catch (e) { return null; }
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            { messaging_product: "whatsapp", to, text: { body: texte } },
            { headers: { Authorization: `Bearer ${process.env.TOKEN}` }, timeout: 10000 }
        );
    } catch (e) { console.error(`Err envoi ${to}`); }
}

function nettoyer(t) {
    return t.replace(/mon prénom est|je m'appelle|mon nom est|je suis en|ma classe est|mon rêve est/gi, "")
            .replace(/[.,!?;: ]+/g, " ").trim();
}

// --- 4. WEBHOOK (Cœur du Réacteur) ---

app.post("/webhook", async (req, res) => {
    res.sendStatus(200); // Libère Meta immédiatement

    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;
   
    const from = msg.from;
    const text = msg.text.body;
    const msgId = msg.id;

    try {
        // Idempotence réelle
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

        // IA avec TIMEOUT OpenAI (Garde-fou crucial)
        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 secondes max

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: `Mentor congolais. Ton: chaleureux/pédagogue. SOURCE: ${savoirSQL || "Général"}. Structure: 🔵[VÉCU], 🟡[SAVOIR], 🔴[INSPIRATION], ❓[CONSOLIDATION], 👉[OUVERTURE].` },
                    ...historique.slice(-4),
                    { role: "user", content: text }
                ],
                temperature: 0.3, max_tokens: 1000
            }, { signal: controller.signal });

            clearTimeout(timeoutId);
            const reponse = completion.choices[0].message.content;

            // Update historique
            const nHist = JSON.stringify([...historique, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10));
            await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nHist, from]);

            const finalMsg = savoirSQL ? `${HEADER_MWALIMU}\n________________________________\n\n${reponse}\n\n\n${CITATIONS[0]}` : `🎓 **Mwalimu** :\n\n${reponse}`;
            await envoyerWhatsApp(from, finalMsg);

        } catch (iaErr) {
            if (iaErr.name === 'AbortError') throw new Error("Timeout OpenAI");
            throw iaErr;
        }

    } catch (e) {
        console.error("Master Error:", e.message);
        await envoyerWhatsApp(from, "🔵 [VÉCU] : Mon esprit a besoin d'une petite pause. Repose ta question dans une minute !");
    }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Mwalimu Enterprise-Ready sur port ${PORT}`));
