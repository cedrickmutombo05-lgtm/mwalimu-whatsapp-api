
require('dotenv').config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");

const app = express();
app.use(express.json());

// --- CONFIGURATION ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- RÈGLE D'OR : IDENTITÉ VISUELLE & CITATIONS ---
const HEADER_MWALIMU = "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

const CITATIONS = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
    "***« Ne demande pas ce que ton pays peut faire pour toi, mais ce que tu peux faire pour le Congo. »***"
];

// --- 1. RAPPEL DU MATIN (07:00) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            const message = `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${eleve.nom}** !\n\nUne nouvelle journée commence pour bâtir ton excellence. Prépare ton esprit, le Congo compte sur toi.\n\n${cit}\n\nExcellente journée d'études !`;
            await envoyerWhatsApp(eleve.phone, message);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- 2. OUTILS DE NETTOYAGE ---
function nettoyerEntree(texte) {
    if (!texte) return "";
    return texte.replace(/mon prénom est|je m'appelle|mon nom est|je suis|en classe de|mon rêve est de devenir|mon plus grand rêve professionnel est de devenir|je voudrais devenir|je veux devenir|je rêve d'être/gi, "").replace(/[.!]*/g, "").trim();
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WhatsApp"); }
}

// --- 3. RECHERCHE SQL ANTI-HALLUCINATION (Système de Score) ---
async function consulterBibliotheque(question) {
    if (!question || question.length < 3) return null;
    try {
        const clean = question.toLowerCase().trim();
        const mots = clean.split(/\s+/).filter(m => m.length > 4);
        const patterns = mots.map(m => `%${m.substring(0, 5)}%`);

        // On donne un score de 10 si le mot est dans le SUJET, 1 si c'est dans le CONTENU
        // LIMIT 1 pour éviter que Mwalimu ne mélange deux provinces différentes
        const query = `
            SELECT contenu, sujet,
            (CASE WHEN unaccent(sujet) ILIKE ANY($1) THEN 10 ELSE 0 END +
             CASE WHEN unaccent(contenu) ILIKE ANY($1) THEN 1 ELSE 0 END) as score
            FROM bibliotheque_mwalimu
            WHERE unaccent(sujet) ILIKE ANY($1) OR unaccent(contenu) ILIKE ANY($1)
            ORDER BY score DESC
            LIMIT 1`;

        const res = await pool.query(query, [patterns]);
        return res.rows.length > 0 ? res.rows[0].contenu : null;
    } catch (e) { return null; }
}

// --- 4. WEBHOOK PRINCIPAL ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // --- SEQUENCE D'INSCRIPTION ---
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.\n\n🟡 Pour commencer, quel est ton **prénom** ?`);
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
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔴 Magnifique ! Je t'aiderai à devenir **${reve}**.\n\nPose-moi ta question sur les provinces de la RDC ou tes cours.`);
        }

        // --- TRAITEMENT DE LA QUESTION ---
        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        const systemPrompt = `Tu es Mwalimu EdTech, Mentor National et Professeur d'élite en RDC.
        L'ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : ${user.reve}.

        CONSIGNES DE RIGUEUR GÉOGRAPHIQUE :
        1. SOURCE OFFICIELLE : """${savoirSQL || "Information non répertoriée dans ma bibliothèque."}"""
        2. ANTI-CONFUSION : Si l'élève parle du "Lualaba", vérifie s'il parle de la PROVINCE ou du FLEUVE. Ne cite les territoires que s'ils appartiennent à la province concernée dans la SOURCE.
        3. RECOPIE : Tu as l'OBLIGATION de citer les faits techniques de la SOURCE (Mazuku, OVG, 100 km/h, noms des territoires, 384m, etc.). NE RÉSUME PAS les chiffres.
        4. SI VIDE : Si la SOURCE est absente, dis-le poliment puis donne tes connaissances générales en précisant qu'elles sont générales.

        STRUCTURE DE RÉPONSE OBLIGATOIRE :
        🔵 [VÉCU] : (Une anecdote chaleureuse ou lien avec la réalité congolaise)
        🟡 [SAVOIR] : (L'explication rigoureuse basée sur la SOURCE SQL)
        🔴 [INSPIRATION] : (Conseil motivant pour devenir ${user.reve})
        ❓ [CONSOLIDATION] : (Une question de test sur la leçon)
        👉 [OUVERTURE] : (Parole charnière pour inviter à la suite)

        TON : Professionnel, pédagogue, paternel/fraternel. Finis par 👉 [OUVERTURE].`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-4), { role: "user", content: text }],
            temperature: 0, // Zéro créativité pour stopper les hallucinations
        });

        const reponseIA = completion.choices[0].message.content;

        // Sauvegarde historique
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponseIA });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-10)), from]);

        const messageFinal = `${HEADER_MWALIMU}\n________________________________\n\n${reponseIA}\n\n\n${CITATIONS[Math.floor(Math.random() * CITATIONS.length)]}`;
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) {
        console.error("Erreur Webhook :", e.message);
        const msgErreur = `${HEADER_MWALIMU}\n________________________________\n\n🔵 [VÉCU] : Même les plus grands professeurs ont parfois une extinction de voix.\n\n🟡 [SAVOIR] : Mon système rencontre une petite saturation.\n\n❓ Repose ta question dans une minute, mon cher ${user.nom}.`;
        await envoyerWhatsApp(from, msgErreur);
    }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech opérationnel.`));
