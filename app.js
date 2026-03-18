
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
    "***« L'excellence n'est pas une action, c'est une habitude. » - Aristote***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***"
];

const SALUTATIONS = ["Mbote", "Jambo", "Moyo", "Ebwe"];
const obtenirSalutation = () => SALUTATIONS[Math.floor(Math.random() * SALUTATIONS.length)];
const obtenirCitation = () => CITATIONS[Math.floor(Math.random() * CITATIONS.length)];

// --- RECHERCHE SQL AMÉLIORÉE ---
async function consulterBibliotheque(question) {
    if (!question) return null;
    try {
        const clean = question.toLowerCase().trim();
        const mots = clean.split(/\s+/).filter(m => m.length > 4);
        const motCle = mots.length > 0 ? `%${mots[mots.length - 1]}%` : `%${clean}%`;

        // Note: Si unaccent pose problème, utilise ILIKE seul
        const res = await pool.query(
            "SELECT description_tuteur FROM entites_administratives WHERE nom_entite ILIKE $1 OR description_tuteur ILIKE $1 LIMIT 1",
            [motCle]
        );
        return res.rows[0]?.description_tuteur || null;
    } catch (e) {
        console.error("Erreur SQL:", e.message);
        return null;
    }
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur d'envoi WhatsApp"); }
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

        // 1. GESTION DE L'INSCRIPTION
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique) VALUES ($1, '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `Merci **${text}** ! C'est enregistré. Pose-moi ta première question sur tes cours ou sur la RDC.`);
        }

        // 2. PRÉPARATION DE L'HISTORIQUE (MEMOIRE)
        let historique = [];
        try {
            historique = JSON.parse(user.historique || "[]");
        } catch (e) { historique = []; }

        const savoirSQL = await consulterBibliotheque(text);
       
        // 3. SYSTEM PROMPT STRICT (Correction Identité)
        const systemPrompt = `Tu es Mwalimu EdTech, le Mentor National de la RDC.
        TON IDENTITÉ : Tu es l'enseignant. Ne te fais jamais passer pour l'élève.
        L'ÉLÈVE : Il s'appelle ${user.nom}. Adresse-toi à lui en tant que son mentor.
       
        CONTEXTE GÉOGRAPHIQUE (Utilise ceci si pertinent) : ${savoirSQL || "Utilise tes propres connaissances précises sur la RDC"}.

        STRUCTURE DE RÉPONSE :
        🔵 [VÉCU] : Une courte mise en contexte ou anecdote.
        🟡 [SAVOIR] : L'explication claire et pédagogique.
        🔴 [INSPIRATION] : Un encouragement lié au futur de la RDC.
        ❓ [CONSOLIDATION] : Une question pour faire réfléchir l'élève.`;

        // 4. APPEL IA AVEC HISTORIQUE
        const messagesIA = [
            { role: "system", content: systemPrompt },
            ...historique.slice(-6), // On prend les 6 derniers messages pour la continuité
            { role: "user", content: text }
        ];

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messagesIA,
            temperature: 0.3,
        });

        const reponseIA = completion.choices[0].message.content;

        // 5. SAUVEGARDE DE LA CONVERSATION
        historique.push({ role: "user", content: text });
        historique.push({ role: "assistant", content: reponseIA });
        const historiqueMaj = JSON.stringify(historique.slice(-10)); // Garde les 10 derniers messages
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [historiqueMaj, from]);

        // 6. ENVOI DU MESSAGE FINAL
        const salutation = `${obtenirSalutation()} **${user.nom}** !`;
        const messageFinal = `${HEADER_MWALIMU}\n\n________________________________\n\n${salutation}\n\n${reponseIA}\n\n${obtenirCitation()}`;
       
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) {
        console.error("Erreur générale:", e);
        await envoyerWhatsApp(from, "Désolé, j'ai une petite fatigue technique. Repose ta question dans un instant !");
    }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

app.listen(process.env.PORT || 10000, () => console.log("Mwalimu est en ligne !"));
