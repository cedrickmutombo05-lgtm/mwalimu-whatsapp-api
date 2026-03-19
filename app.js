
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

// --- RÈGLE D'OR : IDENTITÉ & CITATIONS ---
const HEADER_MWALIMU = "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

const CITATIONS = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
    "***« Ne demande pas ce que ton pays peut faire pour toi, mais ce que tu peux faire pour le Congo. »***"
];

// --- 1. RAPPEL DU MATIN (07:00 Africa/Lubumbashi) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            const msgMatin = `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${eleve.nom}** !\n\nUne nouvelle journée se lève pour bâtir ton excellence. Prépare ton esprit, le Congo compte sur toi.\n\n${cit}\n\nExcellente journée d'études !`;
            await envoyerWhatsApp(eleve.phone, msgMatin);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- 2. OUTILS DE NETTOYAGE ---
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

// --- 3. RECHERCHE SQL PUISSANTE (On prend 5 lignes pour fusionner le savoir) ---
async function consulterBibliotheque(question) {
    if (!question || question.length < 3) return null;
    try {
        const clean = question.toLowerCase().trim();
        const mots = clean.split(/\s+/).filter(m => m.length > 4);
        const patterns = mots.map(m => `%${m.substring(0, 5)}%`);
        if (patterns.length === 0) patterns.push(`%${clean.substring(0, 5)}%`);

        // On cherche les 5 meilleures fiches. Cela permet de lire "Province" + "Volcans" + "Mazuku" en même temps.
        const query = `
            SELECT sujet, contenu FROM bibliotheque_mwalimu
            WHERE unaccent(sujet) ILIKE ANY($1) OR unaccent(contenu) ILIKE ANY($1)
            ORDER BY (CASE WHEN unaccent(sujet) ILIKE ANY($1) THEN 10 ELSE 1 END) DESC
            LIMIT 5`;

        const res = await pool.query(query, [patterns]);
        if (res.rows.length > 0) {
            return res.rows.map(r => `FICHE [${r.sujet}] : ${r.contenu}`).join("\n\n");
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

        // SEQUENCE D'INSCRIPTION
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.\n\n🟡 Quel est ton **prénom** ?`);
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

        // PRÉPARATION DE LA RÉPONSE
        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        const systemPrompt = `Tu es Mwalimu EdTech, un Mentor National Congolais, chaleureux et pédagogue.
        ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : Devenir ${user.reve}.
       
        DONNÉES DE LA BIBLIOTHÈQUE :
        """
        ${savoirSQL || "Information non répertoriée dans ma bibliothèque officielle."}
        """

        CONSIGNES :
        1. Utilise les données fournies pour répondre avec une précision de professeur.
        2. Si la bibliothèque mentionne "Mazuku", "100 km/h" ou des territoires précis, cite-les absolument.
        3. Ne confonds jamais le fleuve Lualaba avec la province du Lualaba.
        4. STRUCTURE DE RÉPONSE OBLIGATOIRE :
           🔵 [VÉCU] : Contextualisation humaine ou patriotique.
           🟡 [SAVOIR] : Les faits exacts et le savoir technique.
           🔴 [INSPIRATION] : Conseil lié au rêve de devenir ${user.reve}.
           ❓ [CONSOLIDATION] : Une question pour tester l'élève.
           👉 [OUVERTURE] : Parole charnière pour inviter à continuer.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-4), { role: "user", content: text }],
            temperature: 0.3, // Équilibre parfait entre humain et précis
        });

        const reponseIA = completion.choices[0].message.content;
       
        // Sauvegarde de la mémoire
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponseIA });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-10)), from]);

        const messageFinal = `${HEADER_MWALIMU}\n________________________________\n\n${reponseIA}\n\n\n${CITATIONS[Math.floor(Math.random() * CITATIONS.length)]}`;
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) { console.error("Erreur Webhook"); }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech opérationnel.`));
