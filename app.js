
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

// --- RAPPEL DU MATIN (RÈGLE D'OR : RÉALITÉ DU RÊVE) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, reve FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const reveAffiche = user.reve.replace(/Quels sont|territoires|Bonjour|Mwalimu|\?|!/gi, "").trim() || "grand leader";
            const messageMatin = `🔵 Mbote cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Aujourd'hui, prépare-toi à devenir le **${reveAffiche}** dont le Congo a besoin.`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE SQL STRICTE ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = nettoyer(phrase).replace(/[?.,!]/g, "").split(/\s+/);
    for (let mot of mots) {
        if (mot.length < 3 || ["quels", "sont"].includes(mot)) continue;
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

        // --- CYCLE D'ENRÔLEMENT ---
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
            const revePur = text.replace(/Bonjour Mwalimu|Bonjour|Mon rêve est|Je veux devenir/gi, "").replace(/[.!]/g, "").trim();
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [revePur, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir **${revePur}**.\n\n🟡 Pose-moi ta question.`);
        }

        // --- TRAITEMENT DE LA QUESTION AVEC RÈGLE D'OR ---
        const info = await consulterBibliotheque(text);
       
        // Extraction forcée pour éviter les hallucinations de l'IA
        const d = info ? {
            p: info.province,
            c: info.chef_lieu,
            v: info.villes || "Aucune ville spécifique",
            t: info.territoires,
            r: info.nature_richesses || "Information en cours d'actualisation"
        } : null;

        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = [];
        try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

        const systemPrompt = `
Tu es Mwalimu EdTech, précepteur présent, vivant et pédagogue.
Ton élève : ${user.nom} | Son rêve : ${user.reve}

<RÈGLE_D_OR_INVIOLABLE>
1. Tu ne résumes JAMAIS les territoires. Tu les listes tous.
2. Tu ne mélanges jamais les villes et les territoires.
3. Si les données sont présentes ci-dessous, tu les utilises. Si elles manquent, tu dis poliment que tu mets à jour tes archives pour cette zone précise.
</RÈGLE_D_OR_INVIOLABLE>

<SOURCE_SQL_DU_JOUR>
Province: ${d ? d.p : "Inconnue"}
Chef-lieu: ${d ? d.c : "Inconnu"}
Villes: ${d ? d.v : "Aucune"}
Territoires: ${d ? d.t : "Aucun"}
Richesses: ${d ? d.r : "À découvrir"}
</SOURCE_SQL_DU_JOUR>

<STRUCTURE_DE_REPONSE_STRICTE>
🔵 [VÉCU] : [Anecdote humaine liant la région au quotidien des Congolais]

🟡 [SAVOIR] :
   - Chef-lieu : ${d ? d.c : "[Nom]"}
   - Villes : ${d ? d.v : "[Liste]"}
   - Territoires :
     [Ici, transforme la liste "${d ? d.t : ""}" en une liste numérotée 1, 2, 3...]
   - Nature & Richesses : ${d ? d.r : "[Détails]"}

🔴 [INSPIRATION] : [Lien entre ce savoir et le rêve de ${user.nom} de devenir ${user.reve}].

❓ [CONSOLIDATION] : [Question de cours précise pour ${user.nom}].
</STRUCTURE_DE_REPONSE_STRICTE>
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0.5
        });

        const reponseIA = completion.choices[0].message.content;
        const reponseFinale = `${reponseIA}\n\n${citAleatoire}`;

        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponseIA }].slice(-10));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
        await envoyerWhatsApp(from, reponseFinale);

    } catch (e) { console.error("Erreur Webhook"); }
});

app.listen(process.env.PORT || 10000);
