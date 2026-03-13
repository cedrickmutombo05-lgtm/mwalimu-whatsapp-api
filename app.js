
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

// --- CONFIGURATION VISUELLE ---
const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba",
    "« L'excellence n'est pas une action, c'est une habitude. »",
    "« Un peuple qui ne connaît pas son histoire est un peuple sans avenir. »"
];

// --- FONCTION D'ENVOI WHATSAPP ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, {
            headers: { Authorization: `Bearer ${process.env.TOKEN}` }
        });
    } catch (e) {
        console.error("Erreur API WhatsApp :", e.response ? e.response.data : e.message);
    }
}

// --- RECHERCHE SQL PRÉCISE ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = nettoyer(phrase).replace(/[?.,!]/g, "").split(" ");

    for (let mot of mots) {
        if (mot.length < 4) continue;
        try {
            // Recherche robuste sur Province OU Territoires
            const res = await pool.query(
                `SELECT province, chef_lieu, territoires
                 FROM drc_population_villes
                 WHERE LOWER(province) ILIKE $1
                 OR LOWER(territoires) ILIKE $1
                 LIMIT 1`,
                [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows[0];
        } catch (e) { console.error("Erreur SQL :", e); continue; }
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

        // --- PHASE 1 : ENRÔLEMENT ---
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour commencer, quel est ton **prénom** ?");
        }
       
        if (!user.nom) {
            const prenom = text.split(" ")[0]; // Évite les phrases longues
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [prenom, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté, **${prenom}** !\n\n🟡 En quelle **classe** es-tu ? (ex: 6ème Primaire, 4ème Humanités...)`);
        }
       
        if (!user.classe) {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté.\n\n🟡 Quel est ton plus grand **rêve** professionnel ? (ex: Médecin, Ingénieur, Ministre...) 🌟`);
        }
       
        if (!user.reve) {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique rêve ! Je t'aiderai à devenir **${text}**.\n\n🟡 Pose-moi ta question sur la RDC (Géographie, Histoire, Culture...).`);
        }

        // --- PHASE 2 : RÉPONSE INTELLIGENTE ---
        const info = await consulterBibliotheque(text);
        let hist = JSON.parse(user.historique || '[]');

        const systemPrompt = `
<IDENTITY>
Tu es Mwalimu, Mentor humain congolais. Tu n'es pas un robot. Ton ton est fier, chaleureux et direct.
</IDENTITY>

<STUDENT_INFO>
- Nom : ${user.nom}
- Classe : ${user.classe}
- Rêve : ${user.reve}
</STUDENT_INFO>

<DATA_STRICT>
Si une information géographique est trouvée dans le SQL, utilise-la fidèlement :
${info ? JSON.stringify(info) : "AUCUNE DONNÉE SQL TROUVÉE."}
</DATA_STRICT>

<STRICT_RULES>
1. **Distingue les Villes des Territoires** : En RDC, le Chef-lieu (souvent une Ville) est différent des Territoires ruraux. Ne les mélange pas.
2. **Complétude** : Liste TOUS les territoires mentionnés dans la colonne 'territoires'.
3. **Structure de réponse** :
   🔵 [VÉCU] : Salue ${user.nom} et donne une anecdote sur le lieu (ambiance, fleuve, ports).
   🟡 [SAVOIR] : Affiche les données SQL clairement. Exemple : "La province de X a pour Chef-lieu Y et compte les territoires suivants : Z, W, K..."
   🔴 [MENTORAT] : Encourage l'élève par rapport à son rêve (${user.reve}).
4. **Température** : 0. Ne brode pas sur les faits géographiques.
</STRICT_RULES>`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                ...hist.slice(-4),
                { role: "user", content: text }
            ],
            temperature: 0
        });

        const reponse = completion.choices[0].message.content;

        // Mise à jour de l'historique
        const nouvelHist = [...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10);
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(nouvelHist), from]);
       
        await envoyerWhatsApp(from, reponse);

    } catch (e) {
        console.error("Erreur Webhook :", e);
    }
});

// --- CRON JOB : RAPPEL MATINAL (7H00 LUBUMBASHI) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const messageMatin = `🔵 Bonjour mon cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) à apprendre quelque chose de nouveau aujourd'hui pour faire briller notre DRC ?`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) {
        console.error("Erreur Cron :", e);
    }
}, { timezone: "Africa/Lubumbashi" });

// --- LANCEMENT DU SERVEUR ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`✅ Mwalimu EdTech vCommercial actif sur le port ${PORT}`);
});
