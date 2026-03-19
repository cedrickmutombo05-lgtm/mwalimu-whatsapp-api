
require('dotenv').config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const HEADER_MWALIMU = "🔴🟡🔵 **Mwalimu EdTech : Ton Mentor pour l'Excellence** 🇨🇩";

const CITATIONS = [
    "***« L'éducation est l'arme la plus puissante pour changer le Congo. »***",
    "***« Le savoir d'aujourd'hui est le socle de la souveraineté de demain. »***",
    "***« Un DRC brillant demande des citoyens instègres et instruits. »***"
];

// --- 1. RAPPEL DU MATIN (La voix du précepteur) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom != ''");
        for (let eleve of eleves) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            const msg = `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${eleve.nom}** !\n\nLe soleil se lève sur notre beau pays. C'est une nouvelle chance pour toi de grandir. Prépare ton esprit, car le Grand Congo compte sur ton génie.\n\n${cit}\n\nExcellente journée d'études !`;
            await envoyerWhatsApp(eleve.phone, msg);
        }
    } catch (e) { console.error("Cron Error"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- 2. OUTILS ---
function nettoyer(t) { return t ? t.replace(/je m'appelle|mon nom est|je suis en|mon rêve est/gi, "").replace(/[.!]*/g, "").trim() : ""; }

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WA"); }
}

async function consulterBibliotheque(question) {
    if (!question) return null;
    try {
        const mots = question.toLowerCase().split(/\s+/).filter(m => m.length > 4);
        const search = mots.length > 0 ? `%${mots[0]}%` : `%${question}%`;
        const res = await pool.query(
            "SELECT contenu FROM bibliotheque_mwalimu WHERE unaccent(sujet) ILIKE $1 OR unaccent(contenu) ILIKE $1 LIMIT 1",
            [search]
        );
        return res.rows[0]?.contenu || null;
    } catch (e) { return null; }
}

// --- 3. WEBHOOK ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;
    const from = msg.from;
    const text = msg.text.body;

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // --- INSCRIPTION CHALEUREUSE ---
        if (!user) {
            await pool.query("INSERT INTO conversations (phone) VALUES ($1)", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Je vais t'accompagner dans tes études. Quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            const nom = nettoyer(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return await envoyerWhatsApp(from, `🤝 Enchanté **${nom}** ! Un futur bâtisseur du pays. En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            const classe = nettoyer(text);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [classe, from]);
            return await envoyerWhatsApp(from, `🟡 C'est noté. La classe de **${classe}** demande de la rigueur. Quel est ton plus grand **rêve** professionnel ?`);
        }
        if (!user.reve) {
            const reve = nettoyer(text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reve, from]);
            return await envoyerWhatsApp(from, `🔴 Magnifique ! Devenir **${reve}**, c'est servir la Nation. Pose-moi ta question, je vais t'aider à comprendre.`);
        }

        // --- MÉTHODOLOGIE PÉDAGOGIQUE ---
        const savoir = await consulterBibliotheque(text);
       
        const systemPrompt = `Tu es Mwalimu EdTech, un précepteur congolais d'élite. Ton ton est celui d'un maître d'école : exigeant, aimant, paternel et très méthodique.
        ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : ${user.reve}.

        MÉTHODE MWALIMU :
        - Tu ne donnes pas juste l'information, tu l'EXPLIQUES pédagogiquement.
        - Utilise des analogies congolaises pour faire comprendre (ex: comparer le fleuve à une artère du corps).
        - SOURCE : """${savoir || "Donnée absente. Utilise ta sagesse de précepteur."}"""
        - Si la SOURCE cite "Mazuku", "100 km/h", "OVG" ou "Masisi", tu DOIS les expliquer comme un professeur au tableau.

        STRUCTURE OBLIGATOIRE :
        🔵 [VÉCU] : Connecte le sujet au quotidien d'un enfant du Congo. Sois chaleureux.
        🟡 [SAVOIR] : Explique le concept avec détails et pédagogie (utilise les chiffres de la SOURCE).
        🔴 [INSPIRATION] : Montre comment ce savoir fera de ${user.nom} une meilleure ${user.reve}.
        ❓ [CONSOLIDATION] : Pose une question de réflexion (pas juste une question de mémoire).
        👉 [OUVERTURE] : Une phrase pour dire "Je suis là pour toi, continuons notre échange...".`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
            temperature: 0.3, // Un peu plus de chaleur humaine
        });

        const reponse = completion.choices[0].message.content;
        await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n${reponse}\n\n\n${CITATIONS[Math.floor(Math.random() * CITATIONS.length)]}`);

    } catch (e) { console.error(e); }
});

app.listen(process.env.PORT || 10000);
