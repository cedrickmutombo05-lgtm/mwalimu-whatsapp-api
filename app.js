
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

// --- 1. RAPPEL DU MATIN (Vocabulaire varié) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom != ''");
        for (let eleve of eleves) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            const salutationsMatin = [
                `☀️ Debout, mon cher **${eleve.nom}** ! Le Congo se réveille et attend ta contribution.`,
                `☀️ Bonjour, futur bâtisseur **${eleve.nom}** ! Une nouvelle page de ton savoir s'ouvre aujourd'hui.`,
                `☀️ Réveille-toi avec force, **${eleve.nom}** ! L'excellence est un voyage qui commence dès l'aube.`
            ];
            const msg = `${HEADER_MWALIMU}\n________________________________\n\n${salutationsMatin[Math.floor(Math.random() * salutationsMatin.length)]}\n\n${cit}\n\nExcellente journée d'études !`;
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
        const mots = question.toLowerCase().trim().split(/\s+/).filter(m => m.length > 4);
        const search = mots.length > 0 ? `%${mots[0]}%` : `%${question}%`;
        const res = await pool.query(
            "SELECT contenu FROM bibliotheque_mwalimu WHERE unaccent(sujet) ILIKE $1 OR unaccent(contenu) ILIKE $1 ORDER BY (unaccent(sujet) ILIKE $1) DESC LIMIT 1",
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

        if (!user) {
            await pool.query("INSERT INTO conversations (phone) VALUES ($1)", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.\n\n🟡 Je vais t'accompagner pour faire de toi une élite. Dis-moi, quel est ton **prénom** ?`);
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
            return await envoyerWhatsApp(from, `🔴 Magnifique ! Devenir **${reve}**, c'est servir la Nation avec dignité.\n\nPose-moi ta question, je suis prêt à t'expliquer.`);
        }

        const savoir = await consulterBibliotheque(text);
       
        const systemPrompt = `Tu es Mwalimu EdTech, un précepteur congolais d'élite, sage, pédagogue et éloquent.
        ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : Devenir ${user.reve}.

        TON STYLE :
        - Tu es un Maître qui parle avec amour, utilisant un vocabulaire riche et varié.
        - Ne répète jamais les mêmes formules d'un message à l'autre.
        - SOURCE : """${savoir || "Donnée absente."}"""

        CONSIGNE POUR 👉 [OUVERTURE] :
        - C'est la transition vers la suite du dialogue.
        - NE DIS JAMAIS "Je suis là pour t'aider" ou "N'hésite pas à poser des questions". C'est trop robotique.
        - Utilise des tournures humaines comme :
          * "Le fleuve de notre savoir ne s'arrête pas là, as-tu une autre curiosité ?"
          * "Chaque dossier que nous ouvrons ensemble te prépare à ta robe d'avocate. Sur quel sujet veux-tu plaider maintenant ?"
          * "La RDC est vaste comme ton intelligence. Quel autre recoin de notre patrie souhaites-tu explorer ?"
          * "Ton esprit est une terre fertile, quelle autre graine de savoir veux-tu y semer ?"

        STRUCTURE OBLIGATOIRE :
        🔵 [VÉCU] : Contextualisation humaine.
        🟡 [SAVOIR] : Explication pédagogique et détaillée (utilise Rubaya, Mazuku, etc., si présents dans la source).
        🔴 [INSPIRATION] : Lien avec son rêve d'avocate.
        ❓ [CONSOLIDATION] : Question de réflexion.
        👉 [OUVERTURE] : Parole charnière humaine et variée.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
            temperature: 0.4, // Augmenté pour la richesse du vocabulaire
        });

        const reponse = completion.choices[0].message.content;
        const messageFinal = `${HEADER_MWALIMU}\n________________________________\n\n${reponse}\n\n\n${CITATIONS[Math.floor(Math.random() * CITATIONS.length)]}`;
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) { console.error(e); }
});

app.listen(process.env.PORT || 10000);
