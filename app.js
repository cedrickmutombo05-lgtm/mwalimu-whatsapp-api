
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

// --- RAPPEL AUTOMATIQUE DU MATIN (07:00) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const citation = citations[Math.floor(Math.random() * citations.length)];
            const messageMatinal = `${HEADER_MWALIMU}\n\n________________________________\n\n☀️ Bonjour **${eleve.nom}** !\n\nC'est l'heure de te lever pour bâtir ton avenir et celui du Grand Congo.\n\n\n${citation}`;
            await envoyerWhatsApp(eleve.phone, messageMatinal);
        }
    } catch (e) { console.error("Erreur Cron :", e.message); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- TA FONCTION DE RECHERCHE OPTIMISÉE (SCHÉMA JURIDIQUE) ---
async function consulterBibliotheque(question) {
    if (!question) return null;

    const texteNettoye = question.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[?.,!;:()"]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const motsVides = new Set([
        "quels", "quelles", "quel", "quelle", "sont", "est", "les", "des", "du", "de",
        "la", "le", "l", "en", "dans", "sur", "pour", "avec", "et", "ou", "donne",
        "moi", "territoires", "province", "provinces", "ville", "villes", "chef", "lieu"
    ]);

    const motsUtiles = texteNettoye.split(" ").filter(m => m.length >= 3 && !motsVides.has(m));
    const recherchePropre = motsUtiles.join("%");

    try {
        const res = await pool.query(
            `SELECT * FROM entites_administratives
             WHERE unaccent(lower(nom_entite)) LIKE unaccent(lower($1))
             OR unaccent(lower(description_tuteur)) LIKE unaccent(lower($1))
             ORDER BY nom_entite LIMIT 1`,
            [`%${recherchePropre}%`]
        );
        return res.rows[0] || null;
    } catch (e) {
        console.error("Erreur SQL :", e.message);
        return null;
    }
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WA"); }
}

// --- WEBHOOK PRINCIPAL ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`);
        }

        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = JSON.parse(user.historique || "[]");

        const systemPrompt = `Tu es Mwalimu EdTech, mentor d'élite en RDC. Ton ton est humain et chaleureux.
        ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}
        DONNÉES SQL (VÉRITÉ ABSOLUE) : ${info ? JSON.stringify(info) : "AUCUNE DONNÉE TROUVÉE."}

        STRUCTURE DE RÉPONSE OBLIGATOIRE (AÉRER AVEC DOUBLES SAUTS DE LIGNE) :

        Mbote ${user.nom} ! [Salutation vive et humaine]

        🔵 [VÉCU]
        [Anecdote ou fait marquant sur le lieu]

        🟡 [SAVOIR]
        ⚠️ RÈGLE D'OR : Recopie les données SQL fournies. Si 6 territoires sont listés (Kasenga, Kipushi, Mitwaba, Pweto, Sakania, Kambove), cite les 6. Ne résume jamais.

        🔴 [INSPIRATION]
        [Lien entre ce savoir et le rêve de l'élève : ${user.reve}]

        ❓ [CONSOLIDATION]
        [Question pour faire réfléchir]

        Je reste disponible pour toute question éventuelle !

        \n\n\n ${citAleatoire}

        CONSIGNE : Laisse TOUJOURS deux lignes vides entre chaque section.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-2), { role: "user", content: text }],
            temperature: 0.1,
        });

        const reponseAI = completion.choices[0].message.content;
        const messageFinal = `${HEADER_MWALIMU}\n\n________________________________\n\n${reponseAI}`;

        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: messageFinal }].slice(-6));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) { console.error("Erreur Bot :", e.message); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech opérationnel.`));
