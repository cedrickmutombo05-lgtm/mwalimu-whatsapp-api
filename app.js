
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

// --- RÈGLE D'OR VISUELLE : LE HEADER STRICT ---
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

// --- RÈGLE D'OR 1 : LE RAPPEL DU MATIN (07:00 LUBUMBASHI) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, reve FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const r = user.reve || "grand leader";
            const msgMatin = `🔵 Mbote cher élève **${user.nom}** !\n\n🟡 ${cit}\n\n🔴 Aujourd'hui, travaille avec courage pour devenir le **${r}** que notre pays attend.`;
            await envoyerWhatsApp(user.phone, msgMatin);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RÈGLE D'OR 2 : EXTRACTION SQL SANS DOUBLONS ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const clean = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = clean(phrase).replace(/[?.,!]/g, "").split(/\s+/);
   
    for (let mot of mots) {
        if (mot.length < 3) continue;
        try {
            const res = await pool.query(
                `SELECT * FROM drc_population_villes WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1 OR LOWER(chef_lieu) LIKE $1 OR LOWER(villes) LIKE $1 LIMIT 1`, [`%${mot}%`]
            );
           
            if (res.rows.length > 0) {
                const row = res.rows[0];
                let vArr = row.villes ? row.villes.split(',').map(v => v.trim()) : [];
                let tArr = row.territoires ? row.territoires.split(',').map(t => t.trim()) : [];
               
                // Filtrage mathématique : Un territoire ne peut pas être une ville
                let tFiltres = tArr.filter(t => !vArr.some(v => v.toLowerCase() === t.toLowerCase()));
               
                return `   - **Chef-lieu** : ${row.chef_lieu}
   - **Villes** : ${vArr.length > 0 ? vArr.join(', ') : "Aucune ville répertoriée"}
   - **Territoires** :
     ${tFiltres.map((t, i) => `${i + 1}. ${t}`).join('\n     ')}
   - **Nature & Richesses** : ${row.nature_richesses || "En cours de documentation"}`;
            }
        } catch (e) { console.error("Erreur SQL"); }
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

        // ENRÔLEMENT (Fondamental)
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?");
        }
        if (!user.nom || !user.classe || !user.reve) {
            if (!user.nom) {
                await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
                return await envoyerWhatsApp(from, `🔵 Enchanté **${text}** ! En quelle **classe** es-tu ?`);
            }
            if (!user.classe) {
                await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
                return await envoyerWhatsApp(from, `🔵 Quel est ton plus grand **rêve** professionnel ?`);
            }
            if (!user.reve) {
                await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
                return await envoyerWhatsApp(from, `🔵 Magnifique. Je t'aiderai à devenir **${text}**.\n\n🟡 Pose-moi ta question.`);
            }
        }

        const infoSavoir = await consulterBibliotheque(text);
        const cit = citations[Math.floor(Math.random() * citations.length)];

        const systemPrompt = `
Tu es Mwalimu EdTech. Élève : ${user.nom}, futur ${user.reve}.
CONSIGNE : Recopie le bloc SAVOIR sans rien inventer. Pas de Kolwezi si absent du SQL.
Structure : 🔵 [VÉCU], 🟡 [SAVOIR], 🔴 [INSPIRATION], ❓ [CONSOLIDATION].`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `SQL_DATA: ${infoSavoir || "Vide"}. Question: ${text}` }
            ],
            temperature: 0.2
        });

        await envoyerWhatsApp(from, `${completion.choices[0].message.content}\n\n${cit}`);

    } catch (e) { console.error(e); }
});

app.listen(process.env.PORT || 10000);
