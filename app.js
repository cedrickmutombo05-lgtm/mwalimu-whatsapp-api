
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

// LA RÈGLE D'OR
const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba"
];

// --- ENVOI WHATSAPP ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WhatsApp"); }
}

// --- RAPPEL MATINAL ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, sexe FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const salut = user.sexe === 'F' ? "ma chère élève" : "mon cher élève";
            await envoyerWhatsApp(user.phone, `🔵 Bonjour ${salut} ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) pour une journée d'excellence ?`);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- BIBLIOTHÈQUE ---
async function consulterBibliotheque(phrase) {
    const mots = phrase.toLowerCase().replace(/[?.,!]/g, "").split(" ").filter(m => m.length > 2);
    for (let mot of mots) {
        try {
            const res = await pool.query(
                `SELECT province, chef_lieu, territoires FROM drc_population_villes
                 WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1 OR LOWER(chef_lieu) LIKE $1 LIMIT 1`,
                [`%${mot}%`]
            );
            if (res.rows.length > 0) {
                const r = res.rows[0];
                return `PROVINCE: ${r.province} | CHEF-LIEU: ${r.chef_lieu} | TERRITOIRES: ${r.territoires}`;
            }
        } catch (e) { continue; }
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

        // 1. CRÉATION DU PROFIL
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique, sexe) VALUES ($1, '', '', '', '[]', '')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour commencer notre voyage, quel est ton prénom ?");
        }

        // 2. PROTOCOLE D'ACCUEIL (VIVANT & HUMAIN)
        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté ${text} !\n\n🟡 En quelle classe es-tu ? (Ex: 6e primaire, 3e secondaire...)`);
        }
        if (!user.classe) {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté. Et quel est ton plus grand rêve pour plus tard ? 🌟`);
        }
        if (!user.reve) {
            // Détection automatique du sexe pour l'adressage futur
            const aiSexe = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: `L'élève s'appelle ${user.nom} et veut devenir ${text}. Déduis le sexe (M ou F). Réponds juste par la lettre.` }]
            });
            const sexe = aiSexe.choices[0].message.content.trim().toUpperCase();
            await pool.query("UPDATE conversations SET reve=$1, sexe=$2 WHERE phone=$3", [text, sexe, from]);
            const salut = sexe === 'F' ? "ma chère élève" : "mon cher élève";
            return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir ${text}, ${salut}.\n\n🟡 Quelle est ta question pour aujourd'hui ?`);
        }

        // 3. TUTORAT APPROFONDI
        const infoBase = await consulterBibliotheque(text);
        let hist = JSON.parse(user.historique || "[]");

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, un précepteur humain d'une précision absolue.
                    ÉLÈVE: ${user.nom}, Classe: ${user.classe}, Rêve: ${user.reve}.
                    ADRESSAGE: "${user.sexe === 'F' ? 'ma chère élève' : 'mon cher élève'}".

                    RÈGLES DE RÉPONSE :
                    1. IDENTIFICATION : Présente toujours le Chef-lieu (Ville) séparément des territoires.
                    2. INTÉGRITÉ : Liste TOUS les territoires fournis dans l'INFO_BASE. Ne résume jamais.
                    3. VÉCU CONGOLAIS : Parle avec chaleur. Explique que le chef-lieu est le cœur administratif et les territoires sont nos racines.
                    4. ASPIRATION : Rappelle que cette connaissance est vitale pour son avenir de ${user.reve}.
                    5. ZÉRO EXCUSE : Ne dis jamais "l'info n'est pas dans la base". Si la base est vide, utilise ta sagesse de mentor.

                    INFO_BASE : ${infoBase || "Utilise ton savoir de précepteur sur le Congo."}`
                },
                ...hist.slice(-4),
                { role: "user", content: text }
            ],
            temperature: 0.2
        });

        const reponse = completion.choices[0].message.content;
        const newHist = [...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10);
       
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(newHist), from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) {
        console.error(e);
        await envoyerWhatsApp(from, "🔴 Mon cher élève, j'ai eu une petite distraction technique. Reposons la question !");
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Mwalimu est opérationnel."));
