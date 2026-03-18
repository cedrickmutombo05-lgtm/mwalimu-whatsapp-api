
require('dotenv').config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const HEADER_MWALIMU = "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

const CITATIONS = [
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitidue. » - Aristote***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***"
];

const SALUTATIONS = ["Mbote", "Jambo", "Moyo", "Ebwe"];
const obtenirSalutation = () => SALUTATIONS[Math.floor(Math.random() * SALUTATIONS.length)];
const obtenirCitation = () => CITATIONS[Math.floor(Math.random() * CITATIONS.length)];

async function consulterBibliotheque(question) {
    if (!question) return null;
    const clean = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const mots = clean.split(/\s+/).filter(m => m.length > 3 && !["province", "quels", "donne"].includes(m));
    const recherche = mots.length > 0 ? `%${mots[mots.length - 1]}%` : `%${clean}%`;
    try {
        const res = await pool.query(
            "SELECT description_tuteur FROM entites_administratives WHERE unaccent(lower(nom_entite)) LIKE unaccent(lower($1)) LIMIT 1",
            [recherche]
        );
        return res.rows[0]?.description_tuteur || null;
    } catch (e) { return null; }
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WA"); }
}

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique) VALUES ($1, '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`);
        }

        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n________________________________\n\nMerci **${text}** ! C'est enregistré. De quelle province souhaites-tu étudier la géographie aujourd'hui ?`);
        }

        const savoirSQL = await consulterBibliotheque(text);
       
        // CORRECTION : L'IA ne doit JAMAIS dire "Mon prénom est..."
        const systemPrompt = `Tu es Mwalimu EdTech, l'enseignant. Ton élève s'appelle ${user.nom}.
        NE CONFONDS PAS : Toi tu es Mwalimu, elle c'est ${user.nom}.
       
        SOURCE GÉOGRAPHIQUE : ${savoirSQL || "NON_TROUVE"}.

        CONSIGNES :
        1. NE SALUE PAS (le code le fait).
        2. STRUCTURE : 🔵 [VÉCU], 🟡 [SAVOIR], 🔴 [INSPIRATION], ❓ [CONSOLIDATION].
        3. 🟡 [SAVOIR] : Recopie la SOURCE GÉOGRAPHIQUE. Interdiction de parler de SQL ou d'informatique.
        4. SI "NON_TROUVE" : Demande la province de RDC.
        5. FIN : "Je reste disponible pour toute question éventuelle !"`;

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
                temperature: 0,
            });

            let content = completion.choices[0].message.content;
            const salutation = `${obtenirSalutation()} ${user.nom} ! 😊`;
           
            const messageFinal = `${HEADER_MWALIMU}\n\n________________________________\n\n${salutation}\n\n${content}\n\n${obtenirCitation()}`;
            await envoyerWhatsApp(from, messageFinal);

        } catch (err) {
            await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n________________________________\n\n🔵 Désolé ${user.nom}, je recharge mes batteries.\n\n${obtenirCitation()}`);
        }
    } catch (e) { console.error("Erreur"); }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

app.listen(process.env.PORT || 10000);
