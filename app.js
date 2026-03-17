
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

// Recherche robuste pour capturer la province dans une phrase
async function consulterBibliotheque(question) {
    if (!question) return null;
    const mots = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/);
    const motsCles = mots.filter(m => m.length > 3 && !["quels", "sont", "donne", "province", "parle"].includes(m));
    if (motsCles.length === 0) return null;

    try {
        const res = await pool.query(
            "SELECT description_tuteur FROM entites_administratives WHERE unaccent(lower(nom_entite)) LIKE unaccent(lower($1)) LIMIT 1",
            [`%${motsCles[motsCles.length - 1]}%`]
        );
        return res.rows[0]?.description_tuteur || null;
    } catch (e) { return null; }
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur d'envoi WA"); }
}

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // Gestion du prénom si utilisateur inconnu
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique) VALUES ($1, '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`);
        }

        // Récupération du SAVOIR via SQL
        const savoirSQL = await consulterBibliotheque(text);
       
        const systemPrompt = `Tu es Mwalimu EdTech. Ton élève est ${user.nom || "Dora"}.
        DONNÉES SQL : ${savoirSQL || "Information non disponible dans la base"}.

        CONSIGNES DE RÉPONSE (STRICTES) :
        1. Salutation personnalisée : "Mbote ${user.nom || "Dora"} ! 😊"
        2. 🔵 [VÉCU] : Anecdote sur la province ou le métier d'avocat.
        3. 🟡 [SAVOIR] : Si DONNÉES SQL est disponible, RECOPIE-LES intégralement. Sinon, demande poliment de préciser la province.
        4. 🔴 [INSPIRATION] : Encourage l'élève dans son futur métier d'avocate.
        5. ❓ [CONSOLIDATION] : Question de réflexion sur le sujet.
        6. Disponibilité : "Je reste disponible pour toute question éventuelle !"

        FORMATAGE : Sépare chaque section par DEUX sauts de ligne. INTERDICTION de mentionner "SQL" ou "Base de données".`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
            temperature: 0.1,
        });

        const messageFinal = `${HEADER_MWALIMU}\n\n________________________________\n\n${completion.choices[0].message.content}\n\n***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***`;

        await envoyerWhatsApp(from, messageFinal);

    } catch (e) { console.error("Erreur Critique:", e.message); }
});

// Validation Meta obligatoire
app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

app.listen(process.env.PORT || 10000, () => console.log("Mwalimu Live"));
