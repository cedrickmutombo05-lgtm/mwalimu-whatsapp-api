
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

// Ta bibliothèque de citations complète
const CITATIONS = [
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. » - Aristote***",
    "***« L'éducation est l'arme la plus puissante pour changer le monde. » - Nelson Mandela***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***"
];

const obtenirCitation = () => CITATIONS[Math.floor(Math.random() * CITATIONS.length)];

// Recherche SQL insensible aux accents et à la casse
async function consulterBibliotheque(question) {
    if (!question) return null;
    const mots = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/);
    const motsCles = mots.filter(m => m.length > 3 && !["province", "quels", "donne"].includes(m));
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

        // 1. Inscription du nouvel utilisateur
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique) VALUES ($1, '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`);
        }

        // 2. Capture du prénom
        if (!user.nom || user.nom === '') {
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n________________________________\n\nMerci **${text}** ! C'est enregistré. De quelle province souhaites-tu étudier la géographie aujourd'hui ?`);
        }

        // 3. Traitement pédagogique
        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");
        historique.push({ role: "user", content: text });
        if (historique.length > 10) historique.shift(); // Garde les 10 derniers messages

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: `Tu es Mwalimu EdTech. Élève : ${user.nom}.
                    DONNÉES SQL (VÉRITÉ) : ${savoirSQL || "Indisponible"}.
                    STRUCTURE : 1. Salue "Mbote ${user.nom} ! 😊". 2. 🔵 [VÉCU]. 3. 🟡 [SAVOIR] (Recopie SQL). 4. 🔴 [INSPIRATION]. 5. ❓ [CONSOLIDATION]. 6. "Je reste disponible pour toute question éventuelle !".
                    Sépare par deux sauts de ligne.` },
                    ...historique
                ],
                temperature: 0.1,
            });

            const reponseAI = completion.choices[0].message.content;
            historique.push({ role: "assistant", content: reponseAI });
           
            // Mise à jour de l'historique en base de données
            await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique), from]);

            await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n________________________________\n\n${reponseAI}\n\n${obtenirCitation()}`);

        } catch (error) {
            // Gestion de l'épuisement des tokens
            await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n\n________________________________\n\n🔵 Cher(e) élève,\n\n🟡 Je rencontre une indisponibilité temporaire.\n\n🔴 Je recharge mes énergies.\n\n❓ Réessaye dans un instant.\n\nJe reste disponible !\n\n${obtenirCitation()}`);
        }

    } catch (e) { console.error("Erreur Serveur"); }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

app.listen(process.env.PORT || 10000);
