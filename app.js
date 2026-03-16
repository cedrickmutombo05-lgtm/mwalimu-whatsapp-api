
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
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Science sans conscience n'est que ruine de l'âme. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***"
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

// --- RAPPEL DU MATIN (RÈGLE D'OR : NETTOYAGE DU RÊVE) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, reve FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            // On élague "Bonjour Mwalimu" et les questions égarées dans le rêve
            const revePur = user.reve.replace(/Quels sont|territoires|Bonjour|Mwalimu|\?|!/gi, "").trim() || "grand bâtisseur";
            const messageMatin = `🔵 Mbote cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Aujourd'hui, prépare-toi à devenir le **${revePur}** dont le Congo a besoin.`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE SQL (RETOUR À LA LOGIQUE STABLE) ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const texte = nettoyer(phrase).replace(/-/g, " ");
    const mots = texte.split(/\s+/).filter(m => m.length > 3);

    for (let mot of mots) {
        if (["quels", "sont", "dans"].includes(mot)) continue;
        try {
            const res = await pool.query(
                `SELECT * FROM drc_population_villes
                 WHERE LOWER(province) ILIKE $1 OR LOWER(territoires) ILIKE $1
                 OR LOWER(villes) ILIKE $1 OR LOWER(chef_lieu) ILIKE $1 LIMIT 1`, [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows[0];
        } catch (e) { console.error("Erreur SQL"); }
    }
    return null;
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

        // --- ENRÔLEMENT ---
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?");
        }
        if (!user.nom) {
            const nomNettoye = text.replace(/Mon prénom est|Je m'appelle|Moi c'est/gi, "").replace(/[.!]/g, "").trim();
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nomNettoye, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${nomNettoye}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté. Quel est ton plus grand **rêve** professionnel ?`);
        }
        if (!user.reve) {
            // ÉLAGAGE RADICAL LORS DE L'ENREGISTREMENT
            const reveNettoye = text.replace(/Bonjour Mwalimu|Bonjour|Mon rêve est|Je veux devenir/gi, "").replace(/[.!]/g, "").trim();
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reveNettoye, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir **${reveNettoye}**.\n\n🟡 Pose-moi ta question.`);
        }

        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = [];
        try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

        const systemPrompt = `
Tu es Mwalimu EdTech, précepteur d'élite et mentor chaleureux pour la jeunesse de la RDC.
ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}

<RÈGLE_D_OR_MWALIMU>
1. SALUTATION : Alterne entre Ebwe, Mbote, Jambo, Moyo ou Bonjour.
2. VILLES VS TERRITOIRES : Sépare STRICTEMENT les Villes (Boma, Zongo, Beni, Butembo, Uvira, Baraka, Likasi) des Territoires.
3. LISTE EXHAUSTIVE : Liste TOUS les territoires de la SOURCE_SQL un par un avec des numéros. Ne résume JAMAIS.
4. ABSENCE DE DONNÉES : Si SOURCE_SQL est "AUCUNE", réponds que tes archives pour cette province sont en cours de mise à jour, mais reste Mwalimu.
</RÈGLE_D_OR_MWALIMU>

<SOURCE_SQL>
${info ? JSON.stringify(info) : "AUCUNE DONNÉE TROUVÉE"}
</SOURCE_SQL>

<STRUCTURE_MWALIMU_STRICTE>
🔵 [VÉCU] : Anecdote humaine liant le sujet au vécu congolais.

🟡 [SAVOIR] :
   - Chef-lieu : [Nom]
   - Villes : [Lister les villes séparément]
   - Territoires :
     1. [Territoire 1]
     2. [Territoire 2]... (Lister TOUT le contenu de la source)
   - Nature & Richesses : [Relief, Hydrographie, Mines].

🔴 [INSPIRATION] : Motivation pour devenir ${user.reve}.

❓ [CONSOLIDATION] : Question de cours pour l'élève.
</STRUCTURE_MWALIMU_STRICTE>
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0.2
        });

        const reponseIA = completion.choices[0].message.content;
        const reponseFinale = `${reponseIA}\n\n${citAleatoire}`;

        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponseIA }].slice(-10));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
        await envoyerWhatsApp(from, reponseFinale);

    } catch (e) { console.error("Erreur Webhook"); }
});

app.listen(process.env.PORT || 10000);
