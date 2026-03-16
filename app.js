
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

// --- RECHERCHE SQL ET PRÉ-FORMATAGE (LA CLÉ DE LA RIGUEUR) ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = nettoyer(phrase).replace(/[?.,!]/g, "").split(/\s+/);
    for (let mot of mots) {
        if (mot.length < 3) continue;
        try {
            const res = await pool.query(
                `SELECT * FROM drc_population_villes WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1 OR LOWER(chef_lieu) LIKE $1 OR LOWER(villes) LIKE $1 LIMIT 1`, [`%${mot}%`]
            );
            if (res.rows.length > 0) {
                const row = res.rows[0];
                // On transforme la chaîne "Fizi, Idjwi..." en liste numérotée ici, en JS, pas dans l'IA
                const listeT = row.territoires ? row.territoires.split(',').map((t, i) => `${i + 1}. ${t.trim()}`).join('\n     ') : "Aucun";
                return { ...row, listeTerritoiresFormatee: listeT };
            }
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
        if (!user.nom || !user.classe || !user.reve) {
            // (Logique d'enrôlement identique à la précédente pour rester stable)
            if (!user.nom) {
                const nomNettoye = text.replace(/Mon prénom est|Je m'appelle|Moi c'est/gi, "").trim();
                await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nomNettoye, from]);
                return await envoyerWhatsApp(from, `🔵 Enchanté **${nomNettoye}** ! En quelle **classe** es-tu ?`);
            }
            if (!user.classe) {
                await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
                return await envoyerWhatsApp(from, `🔵 C'est noté. Quel est ton plus grand **rêve** professionnel ?`);
            }
            if (!user.reve) {
                const revePur = text.replace(/Bonjour Mwalimu|Bonjour|Mon rêve est/gi, "").trim();
                await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [revePur, from]);
                return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir **${revePur}**.\n\n🟡 Pose-moi ta question.`);
            }
        }

        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = [];
        try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

        const systemPrompt = `
Tu es Mwalimu EdTech, précepteur d'élite congolais.
ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}

<RÈGLE_D_OR_RADICALE>
1. Tu ne modifies JAMAIS la liste des territoires fournie. Tu l'insères telle quelle.
2. Tu respectes STRICTEMENT la distinction entre VILLES et TERRITOIRES.
3. Si une ville est listée dans "VILLES", elle ne doit pas apparaître dans "TERRITOIRES".
4. Tu restes pédagogue, vivant et tu parles du VÉCU congolais.
</RÈGLE_D_OR_RADICALE>

<SOURCE_SQL_VERIFIEE>
Province: ${info ? info.province : "Inconnue"}
Chef-lieu: ${info ? info.chef_lieu : "Inconnu"}
Villes: ${info ? info.villes : "Aucune"}
Liste_Territoires:
     ${info ? info.listeTerritoiresFormatee : "Aucun"}
Richesses: ${info ? info.nature_richesses : "À déterminer"}
</SOURCE_SQL_VERIFIEE>

<STRUCTURE_IMPOSEE>
🔵 [VÉCU] : [Anecdote vivante sur la région]

🟡 [SAVOIR] :
   - Chef-lieu : ${info ? info.chef_lieu : "[Nom]"}
   - Villes : ${info ? info.villes : "[Liste]"}
   - Territoires :
     ${info ? info.listeTerritoiresFormatee : "[Liste]"}
   - Nature & Richesses : ${info ? info.nature_richesses : "[Détails]"}

🔴 [INSPIRATION] : [Motivation liée au rêve de devenir ${user.reve}].

❓ [CONSOLIDATION] : [Question de cours pour ${user.nom}].
</STRUCTURE_IMPOSEE>
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0.3
        });

        const reponseIA = completion.choices[0].message.content;
        await envoyerWhatsApp(from, `${reponseIA}\n\n${citAleatoire}`);

    } catch (e) { console.error(e); }
});

app.listen(process.env.PORT || 10000);
