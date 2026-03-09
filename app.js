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

const HEADER = "_🔵🟡🔴 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** cd_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. » - François Rabelais",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba",
    "« Le succès, c'est d'aller d'échec en échec sans perdre son enthousiasme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »"
];

const safeParseHistory = (historyStr) => {
    try {
        const parsed = JSON.parse(historyStr);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
};

async function sendWhatsApp(to, bodyText) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            { messaging_product: "whatsapp", to, text: { body: bodyText } },
            { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
        );
    } catch (e) { console.error("Erreur WhatsApp :", e.response?.data || e.message); }
}

/* --- LOGIQUE DE RECHERCHE DANS LA BIBLIOTHÈQUE --- */
function extraireMotsCles(question) {
    const stopwords = ["le", "la", "les", "un", "une", "des", "du", "de", "d", "et", "en", "au", "aux", "dans", "sur", "sous", "avec", "pour", "par", "qui", "que", "quoi", "ou", "où", "est", "sont", "a", "ont", "quel", "quelle", "comment", "pourquoi", "rdc", "congo"];
    return question.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s]/g, " ").split(/\s+/).filter(mot => mot.length > 2 && !stopwords.includes(mot));
}

async function chercherDansBibliotheque(question) {
    try {
        const mots = extraireMotsCles(question);
        if (mots.length === 0) return null;

        const query = `
            SELECT reponse AS contenu FROM questions_reponses WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) AS m WHERE question ILIKE '%'||m||'%')
            UNION ALL
            SELECT contenu FROM (
                SELECT unite_physique as t, description_details as contenu FROM drc_relief
                UNION ALL SELECT element, caracteristiques FROM drc_hydrographie
                UNION ALL SELECT zone_climatique, type_vegetation FROM drc_climat_vegetation
                UNION ALL SELECT province, territoires FROM drc_population_villes
            ) AS lib WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) AS m WHERE t ILIKE '%'||m||'%' OR contenu ILIKE '%'||m||'%')
            LIMIT 1`;
       
        const res = await pool.query(query, [mots]);
        return res.rows.length > 0 ? res.rows[0].contenu : null;
    } catch (e) { return null; }
}

/* --- WEBHOOK : PARCOURS ÉLÈVE & TUTORAT --- */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
        let user = userRes.rows[0];

        // 1. GESTION DU NOUVEL ÉLÈVE (ACCUEIL)
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, historique) VALUES ($1, $2)", [from, '[]']);
            return await sendWhatsApp(from, `${HEADER}\n\n🔵 **Bienvenu(e) jeune patriote !** 😊\n\n🟡 Je suis **Mwalimu EdTech**, ton mentor pour un avenir brillant en RDC.\n\n🔴 Pour commencer notre voyage éducatif, **quel est ton nom et ta classe ?**`);
        }

        // 2. COLLECTE DU NOM (S'IL N'EXISTE PAS)
        if (!user.nom) {
            await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [text, from]);
            return await sendWhatsApp(from, `${HEADER}\n\n🔵 Enchanté **${text}** ! C'est un honneur de t'accompagner.\n\n🟡 Je suis maintenant prêt. Pose-moi n'importe quelle question sur tes cours ou sur notre pays !`);
        }

        // 3. RÉCUPÉRATION DU CONTEXTE (BIBLIOTHÈQUE)
        const infoBibliotheque = await chercherDansBibliotheque(text);
        let contextAdditionnel = infoBibliotheque ? `[VÉRITÉ TERRAIN : ${infoBibliotheque}]` : "";

        // 4. RÉPONSE PÉDAGOGIQUE VIA IA
        const history = safeParseHistory(user.historique);
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es MWALIMU EDTECH, le mentor chaleureux et exigeant de l'élève nommé ${user.nom}.
                    MÉTHODE :
                    - Étape 1 : Explique le concept avec bienveillance (🔵).
                    - Étape 2 : Donne un exemple lié au quotidien de la RDC (🟡).
                    - Étape 3 : Donne la réponse finale précise (🔴).
                    - UTILISE IMPÉRATIVEMENT cette donnée si elle est pertinente : ${contextAdditionnel}.
                    - Si la question porte sur les territoires, liste ceux de la province demandée sans confusion.`
                },
                ...history.slice(-6),
                { role: "user", content: text }
            ]
        });

        const aiReply = completion.choices[0].message.content;

        // Mise à jour historique
        const newHistory = [...history, { role: "user", content: text }, { role: "assistant", content: aiReply }].slice(-10);
        await pool.query("UPDATE conversations SET historique = $1 WHERE phone = $2", [JSON.stringify(newHistory), from]);

        await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

    } catch (e) {
        console.error(e);
        await sendWhatsApp(from, `${HEADER}\n\n🔴 Oups ! J'ai eu un petit souci de connexion. Peux-tu reformuler ta question ?`);
    }
});

app.listen(process.env.PORT || 10000);
