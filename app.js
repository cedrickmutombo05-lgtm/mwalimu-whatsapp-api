
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

const citations = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***",
    "***« Aimer son pays, c'est aussi contribuer à sa force : payer son impôt, c'est bâtir nos propres écoles. »***",
    "***« Le patriotisme n'est pas un sentiment, c'est un acte de bâtisseur. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
    "***« Ne demande pas ce que ton pays peut faire pour toi, mais ce que tu peux faire pour le Congo. »***"
];

// --- RAPPEL DU MATIN 07:00 ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const message = `${HEADER_MWALIMU}\n\n________________________________\n\n☀️ Bonjour **${eleve.nom}** !\n\nC'est l'heure de te lever pour bâtir ton avenir et celui du Grand Congo.\n\n\n${cit}`;
            await envoyerWhatsApp(eleve.phone, message);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- RECHERCHE SQL AVEC UNACCENT ---
async function consulterBibliotheque(question) {
    if (!question) return null;
    const recherche = question.trim().toLowerCase();
    try {
        const res = await pool.query(
            `SELECT * FROM entites_administratives
             WHERE unaccent(lower(nom_entite)) ILIKE unaccent(lower($1))
             OR unaccent(lower(description_tuteur)) ILIKE unaccent(lower($1)) LIMIT 1`,
            [`%${recherche}%`]
        );
        return res.rows[0] || null;
    } catch (e) { return null; }
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WA"); }
}

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;
    const from = msg.from;
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];
        if (!user) return;

        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
       
        // --- LE SECRET : UN SYSTEM PROMPT ULTRA-STRICT ---
        const systemPrompt = `Tu es Mwalimu EdTech, mentor en RDC. Ton ton est humain, chaleureux et pédagogique.
        ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}
        DONNÉES SQL (VÉRITÉ ABSOLUE) : ${info ? JSON.stringify(info) : "Aucune donnée."}

        STRUCTURE DE RÉPONSE (RESPECTE LES SAUTS DE LIGNE) :
       
        Mbote ${user.nom} ! [Ajoute une salutation chaleureuse ici]

        🔵 [VÉCU]
        [Anecdote humaine ou historique sur le lieu demandé]

        🟡 [SAVOIR]
        ⚠️ RÈGLE D'OR : Recopie EXACTEMENT les informations de la 'DONNÉES SQL' ci-dessus.
        Si la donnée mentionne 6 territoires (Kasenga, Kipushi, Mitwaba, Pweto, Sakania ET Kambove), tu DOIS citer les 6.
        Il est INTERDIT d'en oublier un. Si tu n'as pas de données, dis que tu vas chercher dans les archives.

        🔴 [INSPIRATION]
        [Lien entre ce savoir et le rêve de l'élève : ${user.reve}]

        ❓ [CONSOLIDATION]
        [Question pour faire réfléchir l'élève]

        Je reste disponible pour toute question éventuelle !

        \n\n\n ${citAleatoire}

        IMPORTANT : Saute deux lignes entre chaque bloc pour une lecture propre.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
            temperature: 0.1, // On descend à 0.1 pour supprimer toute "créativité" factuelle
        });

        let reponseAI = completion.choices[0].message.content;
        const messageFinal = `${HEADER_MWALIMU}\n\n________________________________\n\n${reponseAI}`;

        await envoyerWhatsApp(from, messageFinal);
    } catch (e) { console.error(e); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel.`));
