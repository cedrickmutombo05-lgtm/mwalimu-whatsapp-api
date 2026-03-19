
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

// --- 1. RAPPEL DU MATIN (07:00 Africa/Lubumbashi) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            await envoyerWhatsApp(eleve.phone, `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${eleve.nom}** !\n\nC'est l'heure de te lever pour bâtir ton avenir. Le Grand Congo compte sur toi.\n\n${cit}\n\nExcellente journée d'études !`);
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
    } catch (e) { console.error("Erreur WA"); }
}

// --- 3. RECHERCHE SQL "CERVEAU GÉOGRAPHIQUE" ---
async function consulterBibliotheque(question) {
    if (!question) return null;
    try {
        const clean = question.toLowerCase().trim();
        // Liste des provinces pour forcer la priorité
        const provinces = ["haut-katanga", "lualaba", "sud-kivu", "nord-kivu", "maniema", "kongo-central"];
        let provinceTrouvee = provinces.find(p => clean.includes(p));

        let query, params;
        if (provinceTrouvee) {
            // Si une province est citée, on ne cherche QUE les fiches de cette province
            query = `SELECT sujet, contenu FROM bibliotheque_mwalimu
                     WHERE (unaccent(sujet) ILIKE $1 OR unaccent(contenu) ILIKE $1)
                     AND (unaccent(sujet) ILIKE '%territoire%' OR unaccent(sujet) ILIKE '%ville%' OR unaccent(sujet) ILIKE '%province%')
                     LIMIT 3`;
            params = [`%${provinceTrouvee}%`];
        } else {
            // Sinon recherche classique par mots-clés
            const mots = clean.split(/\s+/).filter(m => m.length > 4);
            const patterns = mots.map(m => `%${m.substring(0, 5)}%`);
            query = `SELECT sujet, contenu FROM bibliotheque_mwalimu WHERE unaccent(sujet) ILIKE ANY($1) OR unaccent(contenu) ILIKE ANY($1) LIMIT 2`;
            params = [patterns];
        }

        const res = await pool.query(query, params);
        if (res.rows.length > 0) {
            return res.rows.map(r => `[FICHE: ${r.sujet.toUpperCase()}] : ${r.contenu}`).join("\n\n");
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

        // --- INSCRIPTION ---
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor.\n\n🟡 Quel est ton **prénom** ?`);
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
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔴 Magnifique ! Je t'aiderai à devenir **${reve}**.\n\nPose-moi ta question sur la RDC.`);
        }

        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        // --- PROMPT DE RIGUEUR ABSOLUE ---
        const systemPrompt = `Tu es Mwalimu EdTech, Mentor National.
        ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : ${user.reve}.

        LOI N°1 (SOURCE) : """${savoirSQL || "AUCUNE_FICHE"}"""
        LOI N°2 (VÉRITÉ) : Si la source est "AUCUNE_FICHE", dis "Je n'ai pas encore cette fiche officielle". Ne devine pas les territoires.
        LOI N°3 (RECOPIE) : Tu as l'OBLIGATION de citer TOUS les territoires de la source. Cite "Mazuku", "100 km/h", "OVG", "Shituru" si présents.

        ORDRE DE RÉPONSE INVIOLABLE :
        1. 🔵 [VÉCU] : (Importance du sujet pour le Congo).
        2. 🟡 [SAVOIR] : (Recopie exacte des faits de la SOURCE).
        3. 🔴 [INSPIRATION] : (Lien avec le futur métier de ${user.reve}).
        4. ❓ [CONSOLIDATION] : (Question de test sur un chiffre cité).
        5. 👉 [OUVERTURE] : (Parole charnière pour la suite).

        INTERDIT : Pas d'introduction IA. Pas de "Dora" ou "Bonjour". Température: 0.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-2), { role: "user", content: text }],
            temperature: 0,
        });

        const reponseIA = completion.choices[0].message.content;
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponseIA });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-4)), from]);

        await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n${reponseIA}\n\n\n${CITATIONS[Math.floor(Math.random() * CITATIONS.length)]}`);

    } catch (e) { console.error("Erreur"); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel sur le port ${PORT}`));
