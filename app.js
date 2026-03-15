
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

// --- CORRECTIF 1 : RAPPEL DU MATIN SANS ERREUR DE NOM ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, reve FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const salutations = ["Ebwe", "Mbote", "Jambo", "Moyo", "Bonjour"];
            const sal = salutations[Math.floor(Math.random() * salutations.length)];
           
            // On s'assure que le rêve n'est pas une phrase de salutation polluée
            const reveAffiche = user.reve && user.reve.length < 50 ? user.reve : "pilier de la nation";
           
            const messageMatin = `🔵 ${sal} cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Aujourd'hui, prépare-toi à devenir le **${reveAffiche}** dont le Congo a besoin.`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const texteNettoye = nettoyer(phrase);
    const mots = texteNettoye.replace(/[?.,!]/g, "").split(/\s+/);
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

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // --- CORRECTIF 2 : NETTOYAGE CHIRURGICAL DU PRÉNOM ET DU RÊVE ---
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?");
        }
       
        if (!user.nom) {
            // Supprime les "Mon prénom est", "Moi c'est", etc.
            const prenomUniquement = text.replace(/Mon prénom est|Je m'appelle|Moi c'est|Moi c|Je suis/gi, "").replace(/[.!]/g, "").trim();
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [prenomUniquement, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${prenomUniquement}** ! En quelle **classe** es-tu ?`);
        }
       
        if (!user.classe) {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté. Quel est ton plus grand **rêve** professionnel ?`);
        }
       
        if (!user.reve) {
            // Supprime les salutations si l'élève commence par "Bonjour Mwalimu, mon rêve est..."
            const reveNettoye = text.replace(/Bonjour Mwalimu|Mon reve est|Je veux devenir/gi, "").replace(/[.!]/g, "").trim();
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reveNettoye, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir **${reveNettoye}**.\n\n🟡 Pose-moi ta question.`);
        }

        // --- LA SUITE RESTE INCHANGÉE (RÈGLE D'OR) ---
        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = [];
        try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

        const systemPrompt = `
Tu es Mwalimu EdTech, précepteur d'élite et mentor chaleureux en RDC.
ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}

<DIRECTIVES_STYLE>
1. SALUTATION : Alterne entre "Ebwe" (Kikongo), "Mbote", "Jambo", "Moyo" ou "Bonjour/Bonsoir".
2. TON : Pédagogique, fier, expert. Explique étape par étape.
3. SQL : Liste TOUS les territoires de la source SQL sans exception.
4. DISTINCTION : Sépare les Villes (Zongo, Beni, Butembo, Uvira, Baraka, Likasi, Boma) des Territoires.
5. CONSOLIDATION : Finis par une question de cours pour ${user.nom}.
</DIRECTIVES_STYLE>

<DONNEES_SQL>
${info ? JSON.stringify(info) : "AUCUNE"}
</DONNEES_SQL>

<STRUCTURE_PROVINCE>
🔵 [VÉCU] : Anecdote humaine liant la province au vécu congolais.
🟡 [SAVOIR] :
   - Chef-lieu & Villes : [Lister séparément].
   - Liste des Territoires : [RECOPIER CHAQUE NOM SANS OUBLI].
   - Nature & Richesses : [Relief, Hydrographie complète, Climat, Parcs, Mines].
🔴 [INSPIRATION] : Pourquoi ce savoir est utile pour ton rêve de devenir ${user.reve}.
❓ [CONSOLIDATION] : Question pédagogique pour l'élève.

Citation en italique : ${citAleatoire}
</STRUCTURE_PROVINCE>
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0.2
        });

        const reponse = completion.choices[0].message.content;
        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) { console.error(e.message); }
});

app.listen(process.env.PORT || 10000);
