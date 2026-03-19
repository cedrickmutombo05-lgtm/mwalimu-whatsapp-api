
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

const HEADER_MWALIMU = "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

const CITATIONS = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***"
];

// --- 1. RAPPEL DU MATIN ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            await envoyerWhatsApp(eleve.phone, `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${eleve.nom}** !\n\nUne nouvelle journée de savoir commence. Prépare ton esprit.\n\n${cit}\n\nExcellente journée d'études !`);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- 2. OUTILS ---
function nettoyerEntree(texte) {
    if (!texte) return "";
    return texte.replace(/mon prénom est|je m'appelle|mon nom est|je suis|en classe de|mon rêve est de devenir|mon plus grand rêve professionnel est de devenir/gi, "").replace(/[.!]*/g, "").trim();
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur d'envoi"); }
}

// --- 3. RECHERCHE SQL "MULTI-PASS" (Cherche chaque mot clé) ---
async function consulterBibliotheque(question) {
    if (!question || question.length < 3) return null;
    try {
        const clean = question.toLowerCase().trim();
        const mots = clean.split(/\s+/).filter(m => m.length > 4);
        const patterns = mots.map(m => `%${m.substring(0, 5)}%`);
        if (patterns.length === 0) patterns.push(`%${clean.substring(0, 5)}%`);

        // Recherche augmentée : On cherche TOUS les mots et on les fusionne
        const query = `
            SELECT sujet, contenu FROM bibliotheque_mwalimu
            WHERE unaccent(sujet) ILIKE ANY($1)
            OR unaccent(contenu) ILIKE ANY($1)
            ORDER BY (CASE WHEN unaccent(sujet) ILIKE ANY($1) THEN 10 ELSE 1 END) DESC
            LIMIT 3`;

        const res = await pool.query(query, [patterns]);
        if (res.rows.length > 0) {
            // Fusion de toutes les fiches trouvées pour donner un maximum de contexte
            return res.rows.map(r => `FICHE [${r.sujet.toUpperCase()}] : ${r.contenu}`).join("\n\n");
        }
        return null;
    } catch (e) { return null; }
}

// --- 4. WEBHOOK ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor.\n\n🟡 Quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            const nom = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${nom}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            const classe = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [classe, from]);
            return await envoyerWhatsApp(from, `🟡 C'est noté. Quel est ton plus grand **rêve** professionnel ?`);
        }
        if (!user.reve) {
            const reve = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reve, from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n🔴 Magnifique ! Je t'aiderai à devenir **${reve}**.\n\nPose-moi ta question sur la RDC.`);
        }

        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        // --- PROMPT DE RIGUEUR TOTALE ---
        const systemPrompt = `Tu es Mwalimu EdTech, Mentor National.
        ÉLÈVE : ${user.nom} | RÊVE : Devenir ${user.reve}.

        LOI N°1 : TA SEULE SOURCE EST : """${savoirSQL || "AUCUNE_FICHE_TROUVÉE"}"""
        LOI N°2 : Si la source est "AUCUNE_FICHE", dis-le : "Je n'ai pas encore cette fiche dans ma bibliothèque".
        LOI N°3 : Si la source contient "Nord-Kivu" ou "Sud-Kivu", ne parle SURTOUT PAS du Haut-Katanga.
        LOI N°4 : Recopie les mots techniques : "Mazuku", "100 km/h", "OVG", "347m", "384m".

        ORDRE DE RÉPONSE OBLIGATOIRE (Si tu changes l'ordre, tu échoues) :
        1. 🔵 [VÉCU] : (Importance du sujet pour le citoyen congolais).
        2. 🟡 [SAVOIR] : (Recopie fidèle des données techniques de la SOURCE).
        3. 🔴 [INSPIRATION] : (Lien avec le rêve d'avocate de ${user.nom}).
        4. ❓ [CONSOLIDATION] : (Question sur un détail technique cité).
        5. 👉 [OUVERTURE] : (Parole charnière pour la suite).

        INTERDIT : Ne dis jamais "Bonjour", ne termine pas par "Dora". Température : 0.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-2), { role: "user", content: text }],
            temperature: 0,
        });

        const reponseIA = completion.choices[0].message.content;
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponseIA });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-6)), from]);

        await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n${reponseIA}\n\n\n${CITATIONS[Math.floor(Math.random() * CITATIONS.length)]}`);

    } catch (e) { console.error("Erreur Webhook"); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel sur le port ${PORT}`));
