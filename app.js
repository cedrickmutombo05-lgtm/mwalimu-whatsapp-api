
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- LA RÈGLE D'OR (HEADER) ---
const HEADER_MWALIMU = "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

const citations = [
    "_« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »_",
    "_« Science sans conscience n'est que ruine de l'âme. »_",
    "_« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »_",
    "_« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba_",
    "_« L'excellence n'est pas une action, c'est une habitude. »_"
];

// --- FONCTION ENVOYER (Telle que sur ta photo 1000523309) ---
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur API WhatsApp"); }
}

// --- RAPPEL DU MATIN (7H00 LUBUMBASHI) ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, reve FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const revePropre = user.reve.replace(/Bonjour Mwalimu|Bonjour|Mwalimu/gi, "").trim();
            const messageMatin = `🔵 Bonjour cher élève **${user.nom}** !\n\n🟡 ${cit}\n\n🔴 Aujourd'hui, prépare-toi à devenir le meilleur **${revePropre}** !`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- CONSULTER BIBLIOTHÈQUE (Adapté à ta NOUVELLE BASE PRO) ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const texteNettoye = nettoyer(phrase);
    const mots = texteNettoye.replace(/[?.,!]/g, "").split(/\s+/);

    for (let mot of mots) {
        if (mot.length < 3) continue;
        try {
            // CORRECTION : On pointe sur ta nouvelle table professionnelle
            const res = await pool.query(
                "SELECT * FROM entites_administratives WHERE LOWER(nom_entite) LIKE $1 LIMIT 1",
                [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows[0];
        } catch (e) { console.error("Erreur SQL"); }
    }
    return null;
}

// --- WEBHOOK (Ton flux exact des photos 1000523315 à 1000523319) ---
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
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?");
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
            const revePropre = text.replace(/Bonjour Mwalimu|Mon rêve est|Je veux devenir/gi, "").replace(/[.!]/g, "").trim();
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [revePropre, from]);
            return await envoyerWhatsApp(from, `🔴 Magnifique ! Je t'aiderai à devenir **${revePropre}**.\n\nPose-moi ta question sur la RDC.`);
        }

        // IA + LOGIQUE SQL
        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
        let hist = JSON.parse(user.historique || "[]");

        const systemPrompt = `
Tu es Mwalimu EdTech, précepteur d'élite et mentor chaleureux en RDC.
ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}

<DIRECTIVES_STYLE>
1. SALUTATION : Alterne entre "Ebwe", "Mbote", "Jambo", "Moyo" ou "Bonjour". Sois poli.
2. RIGUEUR : Liste TOUS les territoires de la source SQL. Ne résume JAMAIS.
3. DISTINCTION : Sépare strictement les Villes des Territoires.
4. CONSOLIDATION : Finis par une question de cours pour ${user.nom}.
</DIRECTIVES_STYLE>

<DONNEES_SQL>
${info ? JSON.stringify(info) : "AUCUNE"}
</DONNEES_SQL>

<STRUCTURE_PEDAGOGIQUE>
🔵 [VÉCU] : Anecdote humaine et patriotique.
🟡 [SAVOIR] :
   - Chef-lieu : [Nom]
   - Villes : [Uniquement les villes]
   - Territoires : [Uniquement les territoires, sans en oublier un seul]
   - Géographie & Nature : [Détails de la source].
🔴 [INSPIRATION] : Pourquoi ce savoir aide à devenir ${user.reve}.
❓ [CONSOLIDATION] : Question de cours pour ${user.nom}.
</STRUCTURE_PEDAGOGIQUE>

${citAleatoire}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...hist.slice(-4), { role: "user", content: text }],
            temperature: 0.3,
        });

        const reponse = completion.choices[0].message.content;
        const nouvelHist = JSON.stringify([...hist, { role: "user", content: text }, { role: "assistant", content: reponse }].slice(-10));
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [nouvelHist, from]);
        await envoyerWhatsApp(from, reponse);

    } catch (e) { console.error("Erreur Bot"); }
});

app.listen(process.env.PORT || 3000);
