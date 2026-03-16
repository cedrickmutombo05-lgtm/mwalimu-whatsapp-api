
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

// --- RAPPEL DU MATIN : NETTOYAGE RADICAL ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, reve FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
           
            // On nettoie le nom et le rêve des scories (ex: "Mon prénom est", "Quels sont les...")
            const nomPropre = user.nom.replace(/Mon prénom est|Je m'appelle|Moi c'est|Dora|!|\./gi, "").trim() || "élève";
            const revePropre = user.reve.replace(/Quels sont|territoires|Sud-Ubangi|Bonjour|Mwalimu|\?|!/gi, "").trim() || "citoyen modèle";

            const messageMatin = `🔵 Mbote cher élève ${nomPropre} !\n\n🟡 ${cit}\n\n🔴 Aujourd'hui, prépare-toi à devenir le **${revePropre}** dont le Congo a besoin.`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = nettoyer(phrase).replace(/[?.,!]/g, "").split(/\s+/);
    for (let mot of mots) {
        if (mot.length < 4) continue; // On ignore les petits mots
        try {
            const res = await pool.query(
                `SELECT * FROM drc_population_villes WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1 OR LOWER(chef_lieu) LIKE $1 OR LOWER(villes) LIKE $1 LIMIT 1`, [`%${mot}%`]
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

        // --- ENRÔLEMENT (SÉCURITÉ ANTI-MÉLANGE) ---
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
        // Si le message ressemble à une question géographique, on ne l'enregistre PAS comme rêve
        if (!user.reve && !text.toLowerCase().includes("territoire") && !text.toLowerCase().includes("province")) {
            const revePur = text.replace(/Bonjour Mwalimu|Mon rêve est|Je veux devenir/gi, "").replace(/[.!]/g, "").trim();
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [revePur, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir **${revePur}**.\n\n🟡 Pose-moi ta question sur la RDC.`);
        }

        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = [];
        try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

        const systemPrompt = `
Tu es Mwalimu EdTech, précepteur d'élite. Tu ne parles QUE de ce qui est dans la SOURCE_SQL.
IMPORTANT : Si la SOURCE_SQL dit qu'une ville est dans une province, ne la déplace pas. Likasi est dans le HAUT-KATANGA, pas au Lualaba.

<DIRECTIVES_STRICTES>
1. RÈGLE D'OR : Liste les Villes (Boma, Zongo, Beni, Butembo, Uvira, Baraka, Likasi) SEULEMENT si elles sont dans la SOURCE_SQL.
2. TERRITOIRES : Liste TOUS les territoires de la SOURCE_SQL. Ne pas en oublier (ex: Kambove pour Haut-Katanga).
3. INTERDICTION D'INVENTER : Si une info n'est pas dans le JSON, dis que tu ne sais pas.
</DIRECTIVES_STRICTES>

<SOURCE_SQL>
${info ? JSON.stringify(info) : "AUCUNE DONNÉE TROUVÉE"}
</SOURCE_SQL>

<STRUCTURE_REPONSE>
🔵 [VÉCU] : Anecdote sur la province (Source : ${info ? info.province : 'RDC'}).
🟡 [SAVOIR] :
   - Chef-lieu : [Nom]
   - Villes : [Lister uniquement les villes de la source]
   - Territoires : [Lister TOUS les territoires de la source]
   - Richesses : [Détails source].
🔴 [INSPIRATION] : Motivation pour devenir ${user.reve}.
❓ [CONSOLIDATION] : Question de cours pour ${user.nom}.
</STRUCTURE_REPONSE>
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0.0 // ROULETTE RUSSE : AUCUNE INVENTION POSSIBLE
        });

        const reponseIA = completion.choices[0].message.content;
        const reponseFinale = `${reponseIA}\n\n${citAleatoire}`;

        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponseIA }].slice(-10));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
        await envoyerWhatsApp(from, reponseFinale);

    } catch (e) { console.error(e.message); }
});

app.listen(process.env.PORT || 10000);
