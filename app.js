
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
        }, {
            headers: { Authorization: `Bearer ${process.env.TOKEN}` }
        });
    } catch (e) { console.error("Erreur WhatsApp"); }
}

// --- RAPPEL MATINAL ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, sexe FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const salutation = user.sexe === 'F' ? "ma chère élève" : "mon cher élève";
            await envoyerWhatsApp(user.phone, `🔵 Bonjour ${salutation} ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Es-tu prêt(e) pour une journée d'excellence ?`);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- BIBLIOTHÈQUE (RECHERCHE PLUS LARGE) ---
async function consulterBibliotheque(phrase) {
    const mots = phrase.toLowerCase().replace(/[?.,!]/g, "").split(" ").filter(m => m.length > 2);
    for (let mot of mots) {
        try {
            const res = await pool.query(
                `SELECT 'PROVINCE: '||province||' | CHEF-LIEU: '||chef_lieu||' | TERRITOIRES: '||territoires as info
                 FROM drc_population_villes WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1 OR LOWER(chef_lieu) LIKE $1 LIMIT 1`,
                [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows[0].info;
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
        let userRes = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = userRes.rows[0];

        // 1. Inscription
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique, sexe, reve) VALUES ($1, '', '[]', '', '')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor.\n\n🟡 Quel est ton prénom ?");
        }

        // 2. Profilage (Nom, Sexe, Rêve)
        if (!user.nom || user.sexe === "" || user.reve === "") {
            const ai = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "system", content: "Extrais les infos suivantes du texte: prénom, sexe (M/F), rêve (métier). Réponds uniquement en JSON: {\"n\":\"\",\"s\":\"\",\"r\":\"\"}" }, { role: "user", content: text }]
            });
            const data = JSON.parse(ai.choices[0].message.content);
           
            const nouveauNom = data.n || user.nom;
            const nouveauSexe = data.s || user.sexe;
            const nouveauReve = data.r || user.reve;

            await pool.query("UPDATE conversations SET nom=$1, sexe=$2, reve=$3 WHERE phone=$4", [nouveauNom, nouveauSexe, nouveauReve, from]);
           
            if (!nouveauNom) return await envoyerWhatsApp(from, "🟡 J'ai besoin de ton prénom pour commencer.");
            if (!nouveauSexe) return await envoyerWhatsApp(from, `🔵 Enchanté ${nouveauNom} ! Es-tu un garçon ou une fille ?`);
            if (!nouveauReve) return await envoyerWhatsApp(from, `🟡 Quel métier rêves-tu de faire plus tard ?`);
           
            return await envoyerWhatsApp(from, `🔵 C'est noté ! Je suis prêt à t'aider à devenir ${nouveauReve}. Pose-moi ta question !`);
        }

        // 3. Traitement avec Bibliothèque
        const infoBase = await consulterBibliotheque(text);
        let hist = [];
        try { hist = typeof user.historique === 'string' ? JSON.parse(user.historique) : (user.historique || []); } catch(e) { hist = []; }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es Mwalimu, le précepteur humain de ${user.nom}.
                    ADRESSAGE: "${user.sexe === 'F' ? 'ma chère élève' : 'mon cher élève'}".
                   
                    RÈGLES :
                    1. NE DIS JAMAIS "L'INFO_BASE ne fournit pas". Si tu n'as pas l'info, explique avec ton vécu de tuteur congolais.
                    2. Si l'INFO_BASE contient une liste (PROVINCE/TERRITOIRES), cite-la intégralement et fidèlement.
                    3. Encourage l'élève à devenir ${user.reve}.
                    4. Matadi, Bandundu, Kindu sont des VILLES (Chef-lieu), pas des territoires. Sois précis !
                   
                    BIBLIOTHÈQUE : ${infoBase || "Aucune donnée trouvée. Utilise ta culture générale de mentor congolais."}`
                },
                ...hist.slice(-6),
                { role: "user", content: text }
            ],
            temperature: 0.3
        });

        const reponse = completion.choices[0].message.content;
        const newHist = [...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10);
       
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(newHist), from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) {
        console.error(e);
        const salut = user?.sexe === 'F' ? "ma chère élève" : "mon cher élève";
        await envoyerWhatsApp(from, `🔴 Désolé ${salut}, j'ai eu une petite distraction technique.`);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Mwalimu EdTech est prêt."));
