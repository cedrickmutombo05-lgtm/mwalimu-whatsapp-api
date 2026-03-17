
require('dotenv').config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");

const app = express();
app.use(express.json());

// --- CONFIGURATION ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- RÈGLE D'OR : IDENTITÉ VISUELLE ---
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

// --- RAPPEL DU MATIN (07:00) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const citation = citations[Math.floor(Math.random() * citations.length)];
            const message = `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour **${eleve.nom}** !\n\nC'est l'heure de te lever pour bâtir ton avenir et celui du Grand Congo.\n\n\n${citation}`;
            await envoyerWhatsApp(eleve.phone, message);
        }
    } catch (e) { console.error("Erreur Cron :", e.message); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- TON SCHÉMA DE RECHERCHE OPTIMISÉ ---
async function consulterBibliotheque(question) {
    if (!question) return null;

    const texte = question
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[?.,!;:()"]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const motsVides = new Set([
        "quels", "quelles", "quel", "quelle", "sont", "est", "les", "des", "du", "de",
        "la", "le", "l", "en", "dans", "sur", "pour", "avec", "et", "ou", "donne",
        "moi", "territoires", "province", "provinces", "ville", "villes", "chef", "lieu"
    ]);

    const motsUtiles = texte.split(" ").filter(m => m.length >= 3 && !motsVides.has(m));

    try {
        // 1. Recherche large sur la phrase
        let res = await pool.query(
            `SELECT * FROM entites_administratives WHERE
             unaccent(lower(nom_entite)) LIKE unaccent(lower($1)) OR
             unaccent(lower(description_tuteur)) LIKE unaccent(lower($1))
             LIMIT 5`, [`%${texte}%`]
        );
        if (res.rows.length > 0) return res.rows;

        // 2. Recherche par mots-clés utiles
        for (const mot of motsUtiles) {
            res = await pool.query(
                `SELECT * FROM entites_administratives WHERE
                 unaccent(lower(nom_entite)) LIKE unaccent(lower($1)) OR
                 unaccent(lower(description_tuteur)) LIKE unaccent(lower($1))
                 LIMIT 5`, [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows;
        }
        return null;
    } catch (e) { return null; }
}

// --- ENVOI WHATSAPP ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WhatsApp"); }
}

// --- WEBHOOK ---
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
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${text}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, "🟡 C'est noté. Quel est ton plus grand **rêve** professionnel ?");
        }
        if (!user.reve) {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔴 Magnifique ! Je t'aiderai à devenir **${text}**.\n\nPose-moi ta question sur la RDC.`);
        }

        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = JSON.parse(user.historique || "[]");

        const systemPrompt = `Tu es Mwalimu EdTech, mentor d'élite en RDC.
        ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}
       
        MODÈLE DE RÉPONSE STRICT :
        1. HEADER : ${HEADER_MWALIMU}
        2. SÉPARATION : "________________________________"
        3. CONTENU : Réponds en utilisant 🔵 [VÉCU], 🟡 [SAVOIR], 🔴 [INSPIRATION].
        4. SOURCE : Utilise EXCLUSIVEMENT ces données : ${JSON.stringify(info)}. Si 6 territoires sont listés, cite-les TOUS.
        5. QUESTION : Termine par une question de consolidation ❓ [CONSOLIDATION].
        6. DISPONIBILITÉ : Ajoute "Je reste disponible pour toute question éventuelle !"
        7. CITATION : La citation DOIT être à la fin, décalée par 3 sauts de ligne, en italique et gras.

        Citation à utiliser : ${citAleatoire}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0.2,
        });

        const reponse = completion.choices[0].message.content;
        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10));
       
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) { console.error("Erreur :", e.message); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech en ligne.`));
