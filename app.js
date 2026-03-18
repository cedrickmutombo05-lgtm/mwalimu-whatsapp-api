
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

// --- RAPPEL AUTOMATIQUE DU MATIN (07:00) ---
cron.schedule('0 7 * * *', async () => {
    try {
        console.log("Exécution du rappel du matin...");
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const citation = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            const message = `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour **${eleve.nom}** !\n\nC'est l'heure de te lever pour bâtir ton avenir et celui du Grand Congo.\n\n${citation}\n\nExcellente journée d'études !`;
            await envoyerWhatsApp(eleve.phone, message);
        }
    } catch (e) { console.error("Erreur Cron :", e.message); }
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
    } catch (e) { console.error("Erreur WA"); }
}

// --- RECHERCHE SQL AMÉLIORÉE (Ultra-sensible) ---
async function consulterBibliotheque(question) {
    if (!question) return null;
    try {
        const clean = question.toLowerCase().trim();
        const mots = clean.split(/\s+/).filter(m => m.length > 3);
       
        // On cherche chaque mot important dans le sujet OU le contenu
        const conditions = mots.map(m => `(unaccent(sujet) ILIKE '%${m}%' OR unaccent(contenu) ILIKE '%${m}%')`).join(' OR ');
       
        if (!conditions) return null;

        const res = await pool.query(`SELECT contenu FROM bibliotheque_mwalimu WHERE ${conditions} LIMIT 2`);
        const finalData = res.rows.length > 0 ? res.rows.map(r => r.contenu).join("\n\n") : null;
       
        console.log("DEBUG DATABASE RESULT:", finalData ? "TROUVÉ ✅" : "RIEN TROUVÉ ❌");
        return finalData;
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

        // 1. INSCRIPTION
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`);
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
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔴 Magnifique ! Je t'aiderai à devenir **${reve}**.\n\nPose-moi ta question sur la RDC.`);
        }

        // 2. RÉCUPÉRATION DES DONNÉES
        const savoirSQL = await consulterBibliotheque(text);
        const citAleatoire = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
        let historique = JSON.parse(user.historique || "[]");

        // 3. SYSTEM PROMPT (Inflexible)
        const systemPrompt = `Tu es Mwalimu EdTech, mentor d'élite en RDC.
        ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : ${user.reve}.

        INSTRUCTIONS DE RÉPONSE :
        1. SOURCE OFFICIELLE : ${savoirSQL || "AUCUNE DONNÉE DANS LA BIBLIOTHÈQUE."}
        2. Si la SOURCE OFFICIELLE contient des informations, tu DOIS les utiliser en priorité. Ne les résume pas : cite le "Mazuku", "l'OVG", "100 km/h", "Masisi", etc.
        3. Si la SOURCE est vide, réponds avec tes connaissances mais admets que tu n'as pas la fiche officielle.
       
        STRUCTURE OBLIGATOIRE :
        🔵 [VÉCU] : Anecdote courte.
        🟡 [SAVOIR] : Transposition stricte des données de la SOURCE.
        🔴 [INSPIRATION] : Lien avec le rêve de devenir ${user.reve}.
        ❓ [CONSOLIDATION] : Une question de test.
        👉 [PAROLE CHARNIÈRE] : Phrase d'ouverture pour dire que tu es prêt pour d'autres questions.

        INTERDICTIONS :
        - Ne dis jamais "Dora" ou "Mbote" dans le corps du texte.
        - Ne termine pas par des émojis IA comme 🌟 ou 🚀.
        - Termine TOUJOURS par la Parole Charnière avant la citation.`;

        // 4. APPEL IA
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-4), { role: "user", content: text }],
            temperature: 0.1, // Précision maximale
        });

        const reponseIA = completion.choices[0].message.content;

        // Historique
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponseIA });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-10)), from]);

        // 6. ENVOI FINAL
        const messageFinal = `${HEADER_MWALIMU}\n________________________________\n\n${reponseIA}\n\n\n${citAleatoire}`;
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) { console.error("Erreur Webhook :", e.message); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel.`));
