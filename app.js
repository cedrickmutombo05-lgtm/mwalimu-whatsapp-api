
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

// --- RAPPEL DE 07H00 (RÈGLE D'OR : PRÉSENCE CONSTANTE) ---
// Configuration explicite pour Africa/Lubumbashi (UTC+2)
cron.schedule("0 7 * * *", async () => {
    console.log("Déclenchement du rappel de 07:00...");
    try {
        const res = await pool.query("SELECT phone, nom, reve FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        const salutations = ["Ebwe", "Mbote", "Jambo", "Moyo", "Bonjour"];
       
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const sal = salutations[Math.floor(Math.random() * salutations.length)];
            // Nettoyage pour ne pas inclure "Bonjour Mwalimu" dans le message
            const reveAffiche = user.reve.replace(/Quels sont|territoires|Bonjour|Mwalimu|\?|!/gi, "").trim() || "grand bâtisseur";
           
            const messageMatin = `🔵 ${sal} cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Aujourd'hui, prépare-toi à devenir le **${reveAffiche}** dont le Congo a besoin.`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur lors du cron de 07h00:", e); }
}, {
    scheduled: true,
    timezone: "Africa/Lubumbashi"
});

// --- RECHERCHE SQL AVEC ANTI-DOUBLON (VILLES VS TERRITOIRES) ---
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
                let villesTab = row.villes ? row.villes.split(',').map(v => v.trim()) : [];
                let territoiresTab = row.territoires ? row.territoires.split(',').map(t => t.trim()) : [];
               
                // Filtre : On enlève des territoires tout ce qui est déjà listé comme ville (ex: Uvira)
                let tFiltres = territoiresTab.filter(t => !villesTab.some(v => v.toLowerCase() === t.toLowerCase()));
               
                return {
                    ...row,
                    vPropres: villesTab.join(', '),
                    tNum: tFiltres.map((t, i) => `${i + 1}. ${t}`).join('\n     ')
                };
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
            if (!user.nom) {
                const n = text.replace(/Mon prénom est|Je m'appelle|Moi c'est/gi, "").trim();
                await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [n, from]);
                return await envoyerWhatsApp(from, `🔵 Enchanté **${n}** ! En quelle **classe** es-tu ?`);
            }
            if (!user.classe) {
                await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
                return await envoyerWhatsApp(from, `🔵 C'est noté. Quel est ton plus grand **rêve** professionnel ?`);
            }
            if (!user.reve) {
                const r = text.replace(/Mon rêve est|Je veux devenir/gi, "").trim();
                await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [r, from]);
                return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir **${r}**.\n\n🟡 Pose-moi ta question.`);
            }
        }

        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = [];
        try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

        const systemPrompt = `
Tu es Mwalimu EdTech, précepteur d'élite congolais.
ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}

<RÈGLE_D_OR_MWALIMU>
1. Tu ne mélanges jamais les VILLES et les TERRITOIRES.
2. Tu recopies la liste numérotée exactement comme fournie par le système.
3. Tu as une âme de mentor : ton ton est chaleureux, pédagogue et inspirant.
</RÈGLE_D_OR_MWALIMU>

<SOURCE_SQL_NETTOYEE>
Province: ${info ? info.province : "Non trouvée"}
Chef-lieu: ${info ? info.chef_lieu : "Non trouvé"}
Villes: ${info ? info.vPropres : "Aucune"}
Territoires (Triés) :
     ${info ? info.tNum : "Aucun"}
</SOURCE_SQL_NETTOYEE>

<STRUCTURE_DE_REPONSE_STRICTE>
🔵 [VÉCU] : [Anecdote chaleureuse sur la vie en RDC]

🟡 [SAVOIR] :
   - Chef-lieu : ${info ? info.chef_lieu : "[Nom]"}
   - Villes : ${info ? info.vPropres : "[Liste]"}
   - Territoires :
     ${info ? info.tNum : "[Liste]"}
   - Nature & Richesses : ${info ? info.nature_richesses : "[Détails]"}

🔴 [INSPIRATION] : [Lien avec le rêve de ${user.nom} de devenir ${user.reve}].

❓ [CONSOLIDATION] : [Question de cours précise].
</STRUCTURE_DE_REPONSE_STRICTE>
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0.5
        });

        const reponseIA = completion.choices[0].message.content;
        await envoyerWhatsApp(from, `${reponseIA}\n\n${citAleatoire}`);

        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponseIA }].slice(-10));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);

    } catch (e) { console.error("Erreur Webhook", e); }
});

app.listen(process.env.PORT || 10000);
