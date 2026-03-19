
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

// --- 1. RAPPEL DU MATIN (RESTAURÉ - 07:00) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            const message = `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${eleve.nom}** !\n\nUne nouvelle journée se lève pour bâtir ton excellence. Prépare ton esprit, le Congo compte sur toi.\n\n${cit}\n\nExcellente journée d'études !`;
            await envoyerWhatsApp(eleve.phone, message);
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

// --- 3. RECHERCHE SQL "SÉCURISÉE" ---
async function consulterBibliotheque(question) {
    if (!question || question.length < 3) return null;
    try {
        const clean = question.toLowerCase().trim();
        const mots = clean.split(/\s+/).filter(m => m.length > 4);
        const patterns = mots.map(m => `%${m.substring(0, 5)}%`);

        // Priorité absolue au Sujet (Titre de la fiche)
        const query = `
            SELECT sujet, contenu FROM bibliotheque_mwalimu
            WHERE unaccent(sujet) ILIKE ANY($1)
            OR unaccent(contenu) ILIKE ANY($1)
            ORDER BY (CASE WHEN unaccent(sujet) ILIKE ANY($1) THEN 10 ELSE 1 END) DESC
            LIMIT 2`;

        const res = await pool.query(query, [patterns]);
        if (res.rows.length > 0) {
            return res.rows.map(r => `[FICHE OFFICIELLE SUR ${r.sujet.toUpperCase()}] : ${r.contenu}`).join("\n\n");
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

        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        // --- PROMPT DE RIGUEUR (ANTI-HALLUCINATION) ---
        const systemPrompt = `Tu es Mwalimu EdTech, Mentor National Congolais.
        ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : ${user.reve}.

        CONSIGNES DE SÉCURITÉ :
        1. TA SEULE SOURCE DE VÉRITÉ : """${savoirSQL || "INFO_NON_DISPONIBLE_DANS_LA_BIBLIOTHÈQUE"}"""
        2. SI LA SOURCE EST "INFO_NON_DISPONIBLE" : Ne donne pas de chiffres précis. Dis que tu n'as pas encore la fiche officielle.
        3. SI LA SOURCE EST DISPONIBLE : Tu DOIS recopier les noms des territoires et villes EXACTEMENT comme ils sont écrits. Ne transforme pas une ville en territoire.
        4. CHIFFRES OBLIGATOIRES : Cite impérativement "Mazuku", "100 km/h", "OVG", "384m", "347m" si présents dans la source.

        STRUCTURE DE RÉPONSE (ORDRE STRICT) :
        🔵 [VÉCU] : (Doit être la TOUTE PREMIÈRE section. Parle de l'importance du sujet pour le Congo).
        🟡 [SAVOIR] : (L'enseignement basé EXCLUSIVEMENT sur la source SQL).
        🔴 [INSPIRATION] : (Conseil motivant lié au rêve de ${user.nom}).
        ❓ [CONSOLIDATION] : (Question de test sur un détail précis du savoir donné).
        👉 [OUVERTURE] : (Parole charnière pour inviter à continuer).

        INTERDIT : Ne dis pas "Bonjour", pas d'IA blabla. Finis par 👉 [OUVERTURE].`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-4), { role: "user", content: text }],
            temperature: 0,
        });

        const reponseIA = completion.choices[0].message.content;
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
app.listen(PORT, () => console.log(`Mwalimu opérationnel.`));
