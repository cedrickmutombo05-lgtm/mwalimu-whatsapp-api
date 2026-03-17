
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

// --- RAPPEL MATIN 07:00 ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const msg = `${HEADER_MWALIMU}\n\n________________________________\n\n☀️ Bonjour **${eleve.nom}** !\n\nC'est l'heure de bâtir le Grand Congo.\n\n\n${cit}`;
            await envoyerWhatsApp(eleve.phone, msg);
        }
    } catch (e) { console.error(e); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- RECHERCHE SQL (TON SCHÉMA) ---
async function consulterBibliotheque(question) {
    if (!question) return null;
    const texte = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[?.,!;:()"]/g, " ").trim();
    try {
        const res = await pool.query(
            `SELECT * FROM entites_administratives
             WHERE unaccent(lower(nom_entite)) LIKE unaccent(lower($1))
             OR unaccent(lower(description_tuteur)) LIKE unaccent(lower($1)) LIMIT 1`,
            [`%${texte}%`]
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

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`);
        }
       
        // (Logique d'enrôlement Nom/Classe/Rêve ici...)

        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = JSON.parse(user.historique || "[]");

        const systemPrompt = `Tu es Mwalimu EdTech, un mentor humain, chaleureux et très pédagogique.
        ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}

        ORDRE DE RÉPONSE OBLIGATOIRE (AÉRER AVEC DOUBLES SAUTS DE LIGNE) :
        1. SALUTATION : "Mbote ${user.nom} !" suivi d'une phrase d'accueil vivante.
        2. VÉCU : 🔵 [VÉCU] (Raconte une anecdote ou un fait humain sur le lieu).
        3. SAVOIR : 🟡 [SAVOIR] Utilise UNIQUEMENT ces données : ${JSON.stringify(info)}.
           ⚠️ RÈGLE D'OR : Si les données listent 6 territoires, cite les 6. Ne suis PAS tes propres connaissances si elles disent 5.
        4. INSPIRATION : 🔴 [INSPIRATION] (Lien avec le rêve de l'élève).
        5. CONSOLIDATION : ❓ [CONSOLIDATION] (Une question pour faire réfléchir).
        6. DISPONIBILITÉ : "Je reste disponible pour toute question éventuelle !"
        7. CITATION : À la toute fin, après 3 lignes vides : \n\n\n ${citAleatoire}

        CONSIGNE DE FORME : Saute TOUJOURS deux lignes entre chaque section pour que ce soit propre.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0.2, // Précision maximale
        });

        const reponse = completion.choices[0].message.content;
        const reponseFinale = `${HEADER_MWALIMU}\n\n________________________________\n\n${reponse}`;

        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponseFinale }].slice(-10));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
        await envoyerWhatsApp(from, reponseFinale);
    } catch (e) { console.error(e); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech en ligne.`));
