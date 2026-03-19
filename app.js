
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
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
    "***« Ne demande pas ce que ton pays peut faire pour toi, mais ce que tu peux faire pour le Congo. »***"
];

// --- 1. LE RAPPEL DU MATIN (La Voix du Maître à l'aube) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows } = await pool.query("SELECT phone, nom FROM conversations WHERE nom != ''");
        for (let user of rows) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            const messageMatin = `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${user.nom}** !\n\nLe soleil se lève sur notre grand pays. C'est une nouvelle chance pour toi de grandir en sagesse. Prépare ton esprit, car le Grand Congo compte sur ton génie.\n\n${cit}\n\nExcellente journée d'études !`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Cron Error"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- 2. OUTILS ---
function nettoyer(t) { return t ? t.replace(/mon prénom est|je m'appelle|mon nom est|je suis en|mon rêve est/gi, "").replace(/[.!]*/g, "").trim() : ""; }

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WA"); }
}

// --- 3. RECHERCHE SQL (Système de Priorité Absolue) ---
async function consulterBibliotheque(question) {
    if (!question) return null;
    try {
        const words = question.toLowerCase().trim().split(/\s+/).filter(w => w.length > 4);
        const search = words.length > 0 ? `%${words[0]}%` : `%${question}%`;
        const res = await pool.query(
            "SELECT contenu FROM bibliotheque_mwalimu WHERE unaccent(sujet) ILIKE $1 OR unaccent(contenu) ILIKE $1 ORDER BY (unaccent(sujet) ILIKE $1) DESC LIMIT 1",
            [search]
        );
        return res.rows[0]?.contenu || null;
    } catch (e) { return null; }
}

// --- 4. WEBHOOK (L'Interaction Vibrante) ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;
    const from = msg.from;
    const text = msg.text.body;

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // --- ONBOARDING HUMAIN ---
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.\n\n🟡 Je vais t'accompagner dans tes études pour faire de toi une élite. Dis-moi, quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            const nom = nettoyer(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return await envoyerWhatsApp(from, `🤝 Enchanté **${nom}** ! Un futur bâtisseur du pays. En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            const cl = nettoyer(text);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [cl, from]);
            return await envoyerWhatsApp(from, `🟡 C'est noté. La classe de **${cl}** demande de la rigueur. Quel est ton plus grand **rêve** professionnel ?`);
        }
        if (!user.reve) {
            const rv = nettoyer(text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [rv, from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔴 Magnifique ! Devenir **${rv}**, c'est servir la Nation. Je serai à tes côtés pour t'aider à comprendre.\n\nPose-moi maintenant ta question, mon cher enfant.`);
        }

        // --- LA LEÇON DU MAÎTRE ---
        const savoir = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        const systemPrompt = `Tu es Mwalimu EdTech, un précepteur congolais d'élite. Ton ton est celui d'un Maître d'école : exigeant, aimant, paternel et très méthodique.
        ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : Devenir ${user.reve}.

        IDENTITÉ : Tu n'es pas une IA, tu es un mentor qui maîtrise l'échange. Tu t'adresses à l'élève comme s'il était assis en face de toi.
       
        MÉTHODE PÉDAGOGIQUE :
        - Explique avec des analogies (ex: comparer le fleuve Congo à une artère vitale).
        - Si la SOURCE cite "Mazuku", "100 km/h", "OVG", ou des territoires précis, tu DOIS les expliquer comme un professeur passionné au tableau.
        - SOURCE : """${savoir || "Information non répertoriée dans ma bibliothèque officielle."}"""

        STRUCTURE OBLIGATOIRE :
        🔵 [VÉCU] : Connecte chaleureusement le sujet au quotidien congolais.
        🟡 [SAVOIR] : Explique la notion avec détails, pédagogie et rigueur scientifique.
        🔴 [INSPIRATION] : Montre comment ce savoir servira à ${user.nom} dans sa future robe d'${user.reve}.
        ❓ [CONSOLIDATION] : Pose une question de réflexion profonde pour stimuler son esprit.
        👉 [OUVERTURE] : Une parole humaine et vibrante pour l'inviter à poursuivre l'échange.

        INTERDIT : Pas d'introduction IA ("En tant que..."). Pas de "Bonjour" (le Header suffit). Pas de formules robotiques.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-4), { role: "user", content: text }],
            temperature: 0.2, // Faible pour la précision, mais assez pour l'âme.
        });

        const reponse = completion.choices[0].message.content;
       
        // Sauvegarde historique
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponse });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-10)), from]);

        await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n${reponse}\n\n\n${CITATIONS[Math.floor(Math.random() * CITATIONS.length)]}`);

    } catch (e) { console.error("Webhook Error"); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech opérationnel.`));
