
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

// TEST DE RÉALITÉ (Diagnostic au démarrage)
pool.query("SELECT COUNT(*) FROM entites_administratives", (err, res) => {
    if (err) console.error("❌ Erreur : La table n'existe pas !");
    else console.log(`✅ La bibliothèque contient ${res.rows[0].count} entrées.`);
});

const HEADER_MWALIMU = "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

// FONCTION DE RECHERCHE BLINDÉE (Photo 1000523922.jpg)
async function consulterBibliotheque(question) {
    if (!question) return null;
    const recherche = question.trim().toLowerCase();
    try {
        const res = await pool.query(
            `SELECT * FROM entites_administratives
             WHERE unaccent(lower(nom_entite)) ILIKE unaccent(lower($1))
             OR unaccent(lower(description_tuteur)) ILIKE unaccent(lower($1)) LIMIT 1`,
            [`%${recherche}%`]
        );
        return res.rows[0] || null;
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
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];
        if (!user) return; // (Gestion enrôlement simplifiée ici pour l'exemple)

        const info = await consulterBibliotheque(text);
       
        // On définit la citation ici (Règle d'Or)
        const citation = "***« L'excellence n'est pas une action, c'est une habitude. »***";

        const systemPrompt = `Tu es Mwalimu EdTech, un mentor humain, chaleureux et très pédagogique.
        ÉLÈVE : ${user.nom} | RÊVE : ${user.reve}
        CONTEXTE LOCAL : ${info ? JSON.stringify(info) : "Aucune donnée spécifique."}

        INSTRUCTIONS DE MISE EN PAGE :
        1. Commence par : "Mbote ${user.nom} !" suivi d'une salutation chaleureuse.
        2. Saute DEUX lignes.
        3. 🔵 [VÉCU] : Partage une anecdote vivante.
        4. Saute DEUX lignes.
        5. 🟡 [SAVOIR] : Utilise UNIQUEMENT le contexte local fourni.
           ⚠️ ATTENTION : Si le contexte mentionne 6 territoires (comme Kambove), tu DOIS citer les 6. Ne te fie pas à ta mémoire.
        6. Saute DEUX lignes.
        7. 🔴 [INSPIRATION] : Relie ces savoirs au rêve de l'élève (${user.reve}).
        8. Saute DEUX lignes.
        9. ❓ [CONSOLIDATION] : Pose une question pédagogique.
        10. "Je reste disponible pour toute question éventuelle !"
        11. Saute TROIS lignes, puis termine par : ${citation}`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ],
            temperature: 0.2, // Très bas pour ne pas inventer !
        });

        const reponseAI = completion.choices[0].message.content;
        const messageFinal = `${HEADER_MWALIMU}\n\n________________________________\n\n${reponseAI}`;

        await envoyerWhatsApp(from, messageFinal);
    } catch (e) { console.error(e); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu opérationnel sur le port ${PORT}`));
