
require('dotenv').config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");

const app = express();
app.use(express.json());

// Configuration OpenAI et PostgreSQL
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Ton Header exact avec la règle d'or (Capitalisation et astérisques)
const HEADER_MWALIMU = "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

// Fonction de recherche SQL améliorée
async function consulterBibliotheque(question) {
    if (!question) return null;
    const clean = question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
   
    // Extraction du mot-clé principal (ex: "Tshopo" ou "Lualaba")
    const mots = clean.split(/\s+/).filter(m => m.length > 3 && !["province", "quels", "sont", "donne"].includes(m));
    const recherche = mots.length > 0 ? `%${mots[mots.length - 1]}%` : `%${clean}%`;

    try {
        const res = await pool.query(
            "SELECT * FROM entites_administratives WHERE unaccent(lower(nom_entite)) LIKE unaccent(lower($1)) LIMIT 1",
            [recherche]
        );
        return res.rows[0] || null;
    } catch (e) {
        console.error("Erreur SQL:", e.message);
        return null;
    }
}

// Envoi vers l'API WhatsApp Cloud
async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to: to,
            text: { body: texte }
        }, {
            headers: { Authorization: `Bearer ${process.env.TOKEN}` }
        });
    } catch (e) {
        console.error("Erreur d'envoi WhatsApp:", e.response ? e.response.data : e.message);
    }
}

// Webhook principal
app.post("/webhook", async (req, res) => {
    // Vérification du message entrant
    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const msg = entry?.messages?.[0];
   
    if (!msg?.text?.body) return res.sendStatus(200);

    const from = msg.from;
    const text = msg.text.body;

    try {
        // 1. Récupérer ou créer l'utilisateur
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, historique) VALUES ($1, '', '[]')", [from]);
            const welcome = `${HEADER_MWALIMU}\n\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`;
            await envoyerWhatsApp(from, welcome);
            return res.sendStatus(200);
        }

        // 2. Chercher dans la base de données (Géographie/Territoires)
        const info = await consulterBibliotheque(text);
       
        // 3. Préparer le prompt pour l'IA
        const systemPrompt = `Tu es Mwalimu EdTech, mentor éducatif en RDC.
        IDENTITÉ : ${user.nom || "Élève"}
        DONNÉES SQL (VÉRITÉ ABSOLUE) : ${info ? JSON.stringify(info) : "AUCUNE DONNÉE TROUVÉE"}.

        CONSIGNES STRICTES :
        1. Utilise TOUJOURS les données SQL pour remplir la section 🟡 [SAVOIR].
        2. Si les données SQL contiennent la géographie (relief, hydrographie, climat, territoires), cite tout précisément.
        3. Ne dis JAMAIS "Je n'ai pas de données" si le JSON ci-dessus contient du texte.
        4. STRUCTURE DE RÉPONSE :
           🔵 [VÉCU] : Anecdote locale.
           🟡 [SAVOIR] : Faits géographiques et administratifs issus du SQL.
           🔴 [INSPIRATION] : Encouragement lié à la carrière d'avocat.
           ❓ [CONSOLIDATION] : Question de réflexion.
       
        Sépare chaque section par DEUX sauts de ligne.`;

        // 4. Appel à OpenAI
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ],
            temperature: 0.1, // Pour éviter toute invention (hallucination)
        });

        const reponseAI = completion.choices[0].message.content;
        const messageFinal = `${HEADER_MWALIMU}\n\n________________________________\n\n${reponseAI}\n\n***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***`;

        // 5. Envoyer le message
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) {
        console.error("Erreur globale:", e.message);
    }
    res.sendStatus(200);
});

// Vérification du Webhook (Meta)
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode && token === process.env.VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Serveur Mwalimu actif sur le port ${PORT}`));
