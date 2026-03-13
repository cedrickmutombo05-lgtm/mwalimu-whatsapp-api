
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

// --- IDENTITÉ VISUELLE ---
const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "_« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »_",
    "_« Science sans conscience n'est que ruine de l'âme. »_",
    "_« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »_",
    "_« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba_",
    "_« L'excellence n'est pas une action, c'est une habitude. »_"
];

// --- FONCTION D'ENVOI ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur API WhatsApp"); }
}

// --- RAPPEL DU MATIN (7H00 LUBUMBASHI) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, reve FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const messageMatin = `🔵 Bonjour cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Aujourd'hui, prépare-toi à devenir le ${user.reve || 'pilier'} dont le Congo a besoin.`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE SQL PRÉCISE ---
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
                 OR LOWER(chef_lieu) LIKE $1 OR LOWER(villes) LIKE $1
                 LIMIT 1`, [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows[0];
        } catch (e) { console.error("Erreur SQL de recherche"); }
    }
    return null;
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

        // 1. CYCLE D'ENRÔLEMENT
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?");
        }
        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${text}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté. Quel est ton plus grand **rêve** professionnel ?`);
        }
        if (!user.reve) {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir **${text}**.\n\n🟡 Pose-moi ta question.`);
        }

        // 2. PRÉPARATION DE LA LEÇON
        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = [];
        try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

        const systemPrompt = `
Tu es Mwalimu EdTech, un précepteur congolais d'exception. Tu enseignes avec clarté, étape par étape, avec l'autorité bienveillante d'un maître.
ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : ${user.reve}

<DIRECTIVES_PEDAGOGIQUES>
1. SALUTATION : Alterne entre "Ebwe" (Kikongo), "Mbote" (Lingala), "Jambo" (Swahili), "Moyo" (Tshiluba), "Betu" ou "Bonjour/Bonsoir".
2. STYLE ENSEIGNANT : Utilise des expressions comme "Retiens bien ceci...", "Étape par étape...", "C'est un point capital...". Sois clair et structuré (1, 2, 3).
3. INTERROGATION : Termine CHAQUE leçon par une question directe à ${user.nom} pour consolider les acquis.
</DIRECTIVES_PEDAGOGIQUES>

<RIGUEUR_DES_DONNEES>
SOURCE_SQL : ${info ? JSON.stringify(info) : "VIDE"}
- TERRITOIRES : Ne résume JAMAIS. Liste l'intégralité de la colonne 'territoires'. Vérifie deux fois pour ne rien oublier.
- DISTINCTION VILLES : Rappelle que Zongo, Beni, Butembo, Uvira, Baraka, Likasi, et Boma sont des Villes et non des Territoires.
- RICHESSE TOTALE : Exploite les données sur le Relief, l'Hydrographie (Fleuve, affluents, biefs), le Climat, la Biodiversité et les Parcs.
</RIGUEUR_DES_DONNEES>

<STRUCTURE_MESSAGE>
🔵 [VÉCU] : Une anecdote humaine pour introduire le sujet.
🟡 [SAVOIR] (La Leçon) :
   1. Chef-lieu et Villes (Précision chirurgicale).
   2. Liste complète des Territoires.
   3. Nature et Géographie (Climat, Relief, Hydrographie, Parcs).
   4. Richesses et potentialités économiques.
🔴 [INSPIRATION] : Pourquoi ce savoir est précieux pour ton rêve de devenir ${user.reve}.
❓ [CONSOLIDATION] : Pose une question à l'élève.

Finis par la citation EN ITALIQUE : ${citAleatoire}.
</STRUCTURE_MESSAGE>
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0.5 // Rigueur maximale
        });

        const reponse = completion.choices[0].message.content;
        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) { console.error("Erreur Webhook:", e.message); }
});

app.listen(process.env.PORT || 10000);
