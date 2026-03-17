
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");

const app = express();
app.use(express.json());

// --- CONFIGURATION DES SERVICES ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- RÈGLE D'OR : HEADER & CITATIONS ---
const HEADER_MWALIMU = "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

const citations = [
    "_« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »_",
    "_« Science sans conscience n'est que ruine de l'âme. »_",
    "_« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »_",
    "_« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba_",
    "_« L'excellence n'est pas une action, c'est une habitude. »_"
];

// --- INITIALISATION : SÉCURITÉ POUR LES TESTS ---
async function initialiserBase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversations (
                phone VARCHAR(20) PRIMARY KEY,
                nom VARCHAR(100),
                classe VARCHAR(50),
                reve TEXT,
                historique TEXT DEFAULT '[]'
            );
        `);
        console.log("✅ Table 'conversations' prête.");
    } catch (e) {
        console.error("❌ Erreur SQL Initialisation :", e.message);
    }
}
initialiserBase();

// --- FONCTION ENVOI WHATSAPP ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: texte } // Le header est maintenant géré dans le prompt IA
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur API WhatsApp"); }
}

// --- RAPPEL DU MATIN (07H00) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, reve FROM conversations WHERE nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const msgMatin = `${HEADER_MWALIMU}\n________________________________\n\n🔵 Bonjour cher élève **${user.nom}** !\n\n🟡 ${cit}\n\n🔴 Prépare-toi à devenir le meilleur **${user.reve}** !`;
            await envoyerWhatsApp(user.phone, msgMatin);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- RECHERCHE DANS TA BASE PRO ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const mots = nettoyer(phrase).replace(/[?.,!]/g, "").split(/\s+/);

    for (let mot of mots) {
        if (mot.length < 3) continue;
        try {
            // Requête sur tes colonnes : nom_entite et description_tuteur
            const res = await pool.query(
                "SELECT * FROM entites_administratives WHERE LOWER(nom_entite) LIKE $1 OR LOWER(description_tuteur) LIKE $1 LIMIT 1",
                [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows[0];
        } catch (e) { console.error("Erreur SQL recherche"); }
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

        // ENRÔLEMENT
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            const msgWelcome = `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`;
            return await envoyerWhatsApp(from, msgWelcome);
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

        // LOGIQUE IA : LE TON DE MWALIMU
        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = JSON.parse(user.historique || "[]");

        const systemPrompt = `Tu es Mwalimu EdTech, précepteur d'élite congolais, chaleureux et patriote.
        ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}

        INSTRUCTIONS DE FORMATAGE OBLIGATOIRES (RÈGLE D'OR) :
        1. DEBUT : ${HEADER_MWALIMU}
        2. SEPARATION : Une ligne de tirets "________________________________"
        3. TON : Parle comme un mentor humain. Utilise souvent le prénom ${user.nom}.
        4. STRUCTURE :
           🔵 [VÉCU] : Anecdote chaleureuse ou lien patriotique.
           🟡 [SAVOIR] : Faits basés sur : ${JSON.stringify(info)}. Ne parle pas de la France si on te parle de la RDC.
           🔴 [INSPIRATION] : Lie ce savoir au rêve de ${user.reve}.
           ❓ [CONSOLIDATION] : TU DOIS POSER UNE QUESTION pour faire interagir l'élève.
        5. DISPONIBILITÉ : Ajoute "Je reste disponible pour toute question éventuelle !"
        6. FIN : Termine TOUJOURS par la citation : ${citAleatoire}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0.75,
        });

        const reponse = completion.choices[0].message.content;
        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10));
       
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) { console.error("Erreur Bot :", e.message); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech actif sur port ${PORT}`));
