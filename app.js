
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

const HEADER = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba"
];

// --- 1. FONCTION D'ENVOI WHATSAPP ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
        { messaging_product: "whatsapp", to, text: { body: `${HEADER}\n\n${texte}` } },
        { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WhatsApp:", e.message); }
}

// --- 2. RAPPEL DU MATIN (Règle d'or : 07h00) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const citation = citations[Math.floor(Math.random() * citations.length)];
            const msg = `🔵 Bonjour cher ${user.nom} !\n\n🟡 ${citation}\n\n🔴 Prêt pour une nouvelle journée d'apprentissage ? Que révisons-nous aujourd'hui ?`;
            await envoyerWhatsApp(user.phone, msg);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- 3. RECHERCHE BIBLIOTHÈQUE (Géo, Histoire, Culture) ---
async function consulterBibliotheque(question) {
    const q = question.toLowerCase().trim();
    if (q.length < 3) return null;
    try {
        const query = `
            SELECT reponse as resultat FROM questions_reponses WHERE LOWER(question) ILIKE $1
            UNION ALL
            SELECT caracteristiques FROM drc_hydrographie WHERE LOWER(element) ILIKE $1
            UNION ALL
            SELECT 'Chef-lieu: ' || chef_lieu || ' | Territoires: ' || territoires FROM drc_population_villes WHERE LOWER(province) ILIKE $1
            LIMIT 1
        `;
        const res = await pool.query(query, [`%${q}%`]);
        return res.rows.length > 0 ? res.rows[0].resultat : null;
    } catch (e) { return null; }
}

// --- 4. WEBHOOK AVEC MÉMOIRE ÉVOLUTIVE ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = userRes.rows[0];

        // ÉTAPE A : Nouvel élève
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique, reve) VALUES ($1, '', '[]', '')", [from]);
            return await envoyerWhatsApp(from, "Bonjour ! Je suis Mwalimu EdTech, ton mentor éducatif.\n\n🟡 Quel est ton nom et en quelle classe es-tu ?");
        }

        // ÉTAPE B : Capture du Nom
        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `Enchanté ${text} ! 🎉\n\n🟡 Quel est ton plus grand rêve ? Que veux-tu devenir pour servir notre Congo ?`);
        }

        // ÉTAPE C : Capture du Rêve (Pour l'ambiance humaine)
        if (!user.reve) {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `C'est un rêve magnifique ! 😍 Je vais t'aider à devenir ce ${text} dont le pays a besoin.\n\n🔴 Quelle est ta première question aujourd'hui ?`);
        }

        // ÉTAPE D : Dialogue avec Mémoire et Bibliothèque
        const infoBase = await consulterBibliotheque(text);
        const historique = JSON.parse(user.historique || "[]");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, mentor de ${user.nom}. Son rêve est de devenir ${user.reve}.
                    INFOS_BASE : ${infoBase || "Utilise tes connaissances générales sur la RDC"}.
                    CONSIGNE : Sois très humain, utilise son prénom. Si l'info est dans la base, utilise-la. Réponds en 3-4 lignes.`
                },
                ...historique.slice(-8),
                { role: "user", content: text }
            ]
        });

        const reponseMwalimu = completion.choices[0].message.content;

        // Mise à jour de l'historique
        const nouvelHist = [...historique, { role: "user", content: text }, { role: "assistant", content: reponseMwalimu }].slice(-10);
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(nouvelHist), from]);

        await envoyerWhatsApp(from, reponseMwalimu);

    } catch (e) {
        console.error("Erreur Webhook :", e);
        await envoyerWhatsApp(from, `Désolé ${user?.nom || "cher ami"}, j'ai eu un petit souci technique. Peux-tu répéter ?`);
    }
});

app.listen(process.env.PORT || 10000);
