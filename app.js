
const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const { Pool } = require("pg");
require("dotenv").config();

const app = express().use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "_« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »_",
    "_« Science sans conscience n'est que ruine de l'âme. »_",
    "_« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »_",
    "_« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba_",
    "_« L'excellence n'est pas une action, c'est une habitude. »_"
];

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur API WhatsApp"); }
}

// --- RAPPEL DU MATIN (Restauration du style original) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, reve FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const sal = ["Mbote", "Jambo", "Moyo", "Ebwe", "Betu"][Math.floor(Math.random() * 5)];
            const msg = `🔵 ${sal} cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Le Congo compte sur toi pour devenir ${user.reve}. Es-tu prêt à apprendre ?`;
            await envoyerWhatsApp(user.phone, msg);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE SQL (Version 80% stabilisée) ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = nettoyer(phrase).replace(/[?.,!]/g, "").split(/\s+/);
    for (let mot of mots) {
        if (mot.length < 3) continue;
        try {
            const res = await pool.query(
                `SELECT * FROM drc_population_villes
                 WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1
                 OR LOWER(chef_lieu) LIKE $1 OR LOWER(villes) LIKE $1 LIMIT 1`, [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows[0];
        } catch (e) { console.error("Erreur SQL"); }
    }
    return null;
}

// --- WEBHOOK (Ajustements point par point) ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // --- ENRÔLEMENT (SÉCURISATION NOM) ---
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Quel est ton **prénom** ?");
        }
        if (!user.nom) {
            const nomNettoye = text.replace(/Mon prénom est|Je m'appelle|Moi c'est/gi, "").trim();
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nomNettoye, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${nomNettoye}** ! En quelle **classe** es-tu ?`);
        }
        // ... (Reste de l'enrôlement identique)

        const info = await consulterBibliotheque(text);
        const cit = citations[Math.floor(Math.random() * citations.length)];
        let hist = [];
        try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

        const systemPrompt = `
Tu es Mwalimu EdTech, précepteur d'élite congolais. Ton style est Chaleureux, Pédagogique et Chirurgical.
ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}

<DIRECTIVES_PRÉCEPTEUR>
1. SALUTATION : Alterne entre Ebwe, Mbote, Jambo, Moyo, Betu ou Bonjour.
2. ÉTAPE PAR ÉTAPE : Explique les notions géographiques avec clarté (Situation, Relief, Hydrographie).
3. RIGUEUR SQL : Liste TOUS les territoires de la source. Ne résume jamais.
4. DISTINCTION : Sépare les Villes (Boma, Zongo, Beni, Butembo, Uvira, Baraka, Likasi) des Territoires.
</DIRECTIVES_PRÉCEPTEUR>

<DONNEES_SQL>
${info ? JSON.stringify(info) : "AUCUNE"}
</DONNEES_SQL>

<STRUCTURE_ACQUISE>
🔵 [VÉCU] : Anecdote humaine liant la province au vécu congolais.
🟡 [SAVOIR] :
   - Chef-lieu : [Nom]
   - Villes : [Liste des villes uniquement]
   - Territoires : [Liste exhaustive des territoires]
   - Géographie : Situation, Relief, Hydrographie, Climat, Parcs (Selon SQL).
   - Richesses : Potentiel économique.
🔴 [INSPIRATION] : Motivation pour ${user.nom} selon son rêve de devenir ${user.reve}.
❓ [CONSOLIDATION] : Question pédagogique sur la leçon.

Citation en italique : ${cit}
</STRUCTURE_ACQUISE>
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0.3 // Précision sans perte d'humanité
        });

        const reponse = completion.choices[0].message.content;
        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) { console.error(e.message); }
});

app.listen(process.env.PORT || 10000);
