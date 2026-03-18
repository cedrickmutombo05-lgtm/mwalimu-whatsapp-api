
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
    "***« L'excellence n'est pas une action, c'est une habitute. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***"
];

// --- RAPPEL DU MATIN (07:00) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            const message = `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour **${eleve.nom}** !\n\nC'est l'heure de te lever pour bâtir ton avenir.\n\n${cit}\n\nExcellente journée d'études !`;
            await envoyerWhatsApp(eleve.phone, message);
        }
    } catch (e) { console.error("Cron Error"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

function nettoyerEntree(texte) {
    if (!texte) return "";
    return texte.replace(/mon prénom est|je m'appelle|mon nom est|je suis|en classe de|mon rêve est de devenir|mon plus grand rêve professionnel est de devenir|je voudrais devenir|je veux devenir|je rêve d'être/gi, "").replace(/[.!]*/g, "").trim();
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("WA Error"); }
}

async function consulterBibliotheque(question) {
    if (!question) return null;
    try {
        const mots = question.toLowerCase().replace(/[?.,!]/g, "").split(/\s+/).filter(m => m.length > 3);
        if (mots.length === 0) return null;
        const patterns = mots.map(m => `%${m.substring(0, 5)}%`);
        const query = `SELECT contenu FROM bibliotheque_mwalimu WHERE unaccent(sujet) ILIKE ANY($1) OR unaccent(contenu) ILIKE ANY($1) LIMIT 1`;
        const res = await pool.query(query, [patterns]);
        return res.rows.length > 0 ? res.rows[0].contenu : null;
    } catch (e) { return null; }
}

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
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            const nom = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${nom}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            const classe = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [classe, from]);
            return await envoyerWhatsApp(from, "🟡 C'est noté. Quel est ton plus grand **rêve** professionnel ?");
        }
        if (!user.reve) {
            const reve = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reve, from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n🔴 Magnifique ! Je t'aiderai à devenir **${reve}**.\n\nPose-moi ta question sur la RDC.`);
        }

        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        const systemPrompt = `Tu es Mwalimu EdTech, Mentor d'Élite.
        ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}.

        CONSIGNE DE SOURCE (CRITIQUE) :
        - SOURCE : ${savoirSQL || "VIDE"}.
        - Tu DOIS inclure tous les faits techniques de la SOURCE : "100 km/h", "Mazuku", "OVG", "347m", "384m", etc.
        - NE RÉSUME PAS. Si tu vois un chiffre ou un terme scientifique, recopie-le.
       
        FORMAT DE RÉPONSE OBLIGATOIRE :
        🔵 [VÉCU] : ...
        🟡 [SAVOIR] : (Ici, tu recopies les données de la SOURCE sans les diluer)
        🔴 [INSPIRATION] : (Lien avec le futur métier de ${user.reve})
        ❓ [CONSOLIDATION] : (Question de test)
        👉 [OUVERTURE] : (Ta parole charnière pour inviter à une autre question)

        RÈGLE : Pas de "Bonjour Dora", pas d'émojis IA. Finir par la section 👉 [OUVERTURE].`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-4), { role: "user", content: text }],
            temperature: 0.1 // Précision maximale
        });

        const reponseIA = completion.choices[0].message.content;
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponseIA });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-10)), from]);

        const messageFinal = `${HEADER_MWALIMU}\n________________________________\n\n${reponseIA}\n\n\n${CITATIONS[Math.floor(Math.random() * CITATIONS.length)]}`;
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) { console.error(e); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech opérationnel.`));
