
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

// --- 1. INITIALISATION DB & INDEXATION ---
const initDB = async () => {
    try {
        await pool.query("CREATE EXTENSION IF NOT EXISTS unaccent;");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS processed_messages (
                msg_id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_processed_created ON processed_messages(created_at);
        `);
        console.log("✅ Système de données industriel prêt.");
    } catch (e) { console.error("Init Error:", e.message); }
};
initDB();

const HEADER_MWALIMU = "🔴🟡🔵 **Mwalimu EdTech : Ton Mentor pour l'Excellence** 🇨🇩";
const CITATIONS = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***"
];

// --- 2. TÂCHES AUTOMATISÉES (CRON) ---

// A. RAPPEL DU MATIN (07:00 Africa/Lubumbashi) - Envoi massif par lots
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom != ''");
        const batchSize = 30;
        for (let i = 0; i < eleves.length; i += batchSize) {
            const batch = eleves.slice(i, i + batchSize);
            await Promise.all(batch.map(u => {
                const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
                return envoyerWhatsApp(u.phone, `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${u.nom}** !\n\nUne nouvelle journée se lève pour bâtir ton excellence. Prépare ton esprit.\n\n${cit}\n\nExcellente journée d'études !`);
            }));
            await new Promise(r => setTimeout(r, 300));
        }
    } catch (e) { console.error("Cron Morning Error"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// B. NETTOYAGE DE NUIT (03:00) - Supprime les vieux IDs de messages (> 48h)
cron.schedule('0 3 * * *', async () => {
    try {
        await pool.query("DELETE FROM processed_messages WHERE created_at < NOW() - INTERVAL '2 days'");
        console.log("🧹 Nettoyage de la base de données effectué.");
    } catch (e) { console.error("Cleanup Error"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });


// --- 3. RECHERCHE & CACHE ---
const cacheSavoir = new Map();

async function consulterBibliotheque(question) {
    if (!question || question.length < 3) return null;
    const cleanQ = question.toLowerCase().trim();
    if (cacheSavoir.has(cleanQ)) return cacheSavoir.get(cleanQ);

    try {
        const words = cleanQ.split(/\s+/).filter(w => w.length > 2);
        const searchPatterns = words.map(w => `%${w}%`);

        const query = `
            SELECT sujet, contenu,
            (CASE WHEN unaccent(sujet) ILIKE ANY($1) THEN 15 ELSE 1 END) as score
            FROM bibliotheque_mwalimu
            WHERE unaccent(sujet) ILIKE ANY($1) OR unaccent(contenu) ILIKE ANY($1)
            ORDER BY score DESC LIMIT 2`;

        const res = await pool.query(query, [searchPatterns]);
        if (res.rows.length > 0) {
            const data = res.rows.map(r => `[NOTE: ${r.sujet.toUpperCase()}] : ${r.contenu}`).join("\n\n");
            if (cacheSavoir.size > 200) cacheSavoir.clear(); // Gestion mémoire
            cacheSavoir.set(cleanQ, data);
            return data;
        }
        return null;
    } catch (e) { return null; }
}

// --- 4. OUTILS ---
function nettoyer(t) {
    return t.replace(/mon prénom est|je m'appelle|mon nom est|je suis en|ma classe est|mon rêve est/gi, "")
            .replace(/[.,!?;: ]+/g, " ").trim();
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            { messaging_product: "whatsapp", to, text: { body: texte } },
            { headers: { Authorization: `Bearer ${process.env.TOKEN}` }, timeout: 12000 }
        );
    } catch (e) { console.error(`Err WA ${to}`); }
}

// --- 5. WEBHOOK (Le Cœur du Mentor) ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200); // Accusé de réception immédiat

    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;
   
    const from = msg.from;
    const text = msg.text.body;
    const msgId = msg.id;

    try {
        // Anti-doublon réel
        const check = await pool.query("INSERT INTO processed_messages (msg_id) VALUES ($1) ON CONFLICT DO NOTHING", [msgId]);
        if (check.rowCount === 0) return;

        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // --- INSCRIPTION ---
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.\n\n🟡 Quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            const nom = nettoyer(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return await envoyerWhatsApp(from, `🤝 Enchanté **${nom}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            const cl = nettoyer(text);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [cl, from]);
            return await envoyerWhatsApp(from, `🟡 C'est noté. Quel est ton plus grand **rêve** professionnel ?`);
        }
        if (!user.reve) {
            const rv = nettoyer(text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [rv, from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔴 Magnifique ! Devenir **${rv}** est une noble ambition. Pose-moi ta question, je t'écoute.`);
        }

        // --- GÉNÉRATION PÉDAGOGIQUE ---
        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        // Contrôle de Timeout OpenAI
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 22000);

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: `Tu es Mwalimu EdTech, précepteur d'élite congolais. Ton ton est chaleureux et exigeant.
                    ÉLÈVE : ${user.nom}, future ${user.reve}.
                    SOURCE : """${savoirSQL || "Information non répertoriée."}"""
                   
                    CONSIGNES :
                    - Intègre impérativement les détails techniques de la SOURCE (Mazuku, OVG, chiffres, Territoires précis).
                    - Sois d'une précision chirurgicale mais reste digeste (pas de paragraphes trop longs).
                    - STRUCTURE : 🔵 [VÉCU], 🟡 [SAVOIR], 🔴 [INSPIRATION], ❓ [CONSOLIDATION], 👉 [OUVERTURE].` },
                    ...historique.slice(-4),
                    { role: "user", content: text }
                ],
                temperature: 0.2
            }, { signal: controller.signal });

            clearTimeout(timeoutId);
            const reponse = completion.choices[0].message.content;

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
        await envoyerWhatsApp(from, "🔵 [VÉCU] : Même les plus grands maîtres ont parfois besoin d'une pause technique. Repose ta question dans une minute, mon cher enfant !");
    }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Mwalimu 1.0 (Enterprise) opérationnel sur le port ${PORT}`));
