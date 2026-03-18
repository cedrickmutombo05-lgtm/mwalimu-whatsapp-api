
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
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***"
];

// Salutations alternées en langues nationales
const SALUTATIONS = ["Mbote", "Jambo", "Moyo", "Kiau"];
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
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n________________________________\n\nMerci **${text}** ! C'est enregistré. De quelle province souhaites-tu étudier la géographie ?`);
        }

        const savoirSQL = await consulterBibliotheque(text);
        const salutationAleatoire = `${obtenirSalutation()} ${user.nom} ! 😊`;
       
        const systemPrompt = `Tu es Mwalimu EdTech. Élève : ${user.nom}.
        DONNÉES SQL (VÉRITÉ) : ${savoirSQL || "NON_TROUVE"}.

        CONSIGNES :
        1. DEBUT : Commence DIRECTEMENT par 🔵 [VÉCU]. Ne salue pas, le code s'en charge.
        2. STRUCTURE : 🔵 [VÉCU], 🟡 [SAVOIR], 🔴 [INSPIRATION], ❓ [CONSOLIDATION].
        3. RÈGLE D'OR : Dans 🟡 [SAVOIR], RECOPIE TOUT le SQL (ex: Kambove doit apparaître pour le Haut-Katanga).
        4. FIN : Ajoute "Je reste disponible pour toute question éventuelle !"
        5. INTERDICTION : Ne génère JAMAIS de header, de salutation, ni de citation.`;

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
                temperature: 0,
            });

            let content = completion.choices[0].message.content;
           
            // Assemblage final : Salutation + Réponse IA + Citation
            const messageFinal = `${HEADER_MWALIMU}\n\n________________________________\n\n${salutationAleatoire}\n\n${content}\n\n${obtenirCitation()}`;
            await envoyerWhatsApp(from, messageFinal);

        } catch (err) {
            // Message d'indisponibilité en cas d'erreur token
            const msgUrgence = `${HEADER_MWALIMU}\n\n________________________________\n\n🔵 ${salutationAleatoire}\n\n🟡 Je rencontre une petite fatigue technique.\n\n🔴 Je recharge mes batteries pour toi.\n\n❓ Peux-tu réessayer dans un instant ?\n\nJe reste disponible !\n\n${obtenirCitation()}`;
            await envoyerWhatsApp(from, msgUrgence);
        }
    } catch (e) { console.error("Erreur"); }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

app.listen(process.env.PORT || 10000);
