
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

const HEADER = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba"
];

const safeParseHistory = (historyStr) => {
    try {
        if (!historyStr) return [];
        if (Array.isArray(historyStr)) return historyStr;
        const parsed = JSON.parse(historyStr);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
};

async function sendWhatsApp(to, bodyText) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            { messaging_product: "whatsapp", to, text: { body: bodyText } },
            { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
        );
    } catch (e) {
        console.error("Erreur WhatsApp :", e.message);
    }
}

function nettoyerTexte(texte) {
    return texte
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/* --- 1. RAPPEL DU MATIN (LUBUMBASHI 07:00) --- */
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        const citation = citations[Math.floor(Math.random() * citations.length)];
        for (const user of res.rows) {
            const msg = `${HEADER}\n\n🔵 **Bonjour mon cher ${user.nom} !** 😊\n\n🟡 Le soleil se lève sur notre beau pays. Rappelle-toi : *"${citation}"*\n\n🔴 Je suis prêt pour tes révisions. Qu'as-tu prévu d'apprendre avec ton mentor aujourd'hui ?`;
            await sendWhatsApp(user.phone, msg);
        }
    } catch (e) {
        console.error("Erreur Cron");
    }
}, { timezone: "Africa/Lubumbashi" });

/* --- 2. RECHERCHE BIBLIOTHÈQUE --- */
async function chercherDansBibliotheque(question) {
    const q = nettoyerTexte(question);

    try {
        // 1. Correspondance exacte dans questions_reponses
        let res = await pool.query(
            `SELECT reponse
             FROM questions_reponses
             WHERE LOWER(question) = LOWER($1)
             LIMIT 1`,
            [question.trim()]
        );

        if (res.rows.length > 0) {
            return res.rows[0].reponse;
        }

        // 2. Correspondance large dans questions_reponses
        res = await pool.query(
            `SELECT reponse
             FROM questions_reponses
             WHERE LOWER(question) ILIKE '%' || $1 || '%'
             ORDER BY LENGTH(question) ASC
             LIMIT 1`,
            [q]
        );

        if (res.rows.length > 0) {
            return res.rows[0].reponse;
        }

        // 3. Provinces / territoires / chefs-lieux
        res = await pool.query(
            `SELECT province, chef_lieu, territoires
             FROM drc_population_villes
             WHERE LOWER(province) ILIKE '%' || $1 || '%'
             LIMIT 1`,
            [q]
        );

        if (res.rows.length > 0) {
            const row = res.rows[0];

            if (q.includes("territoire")) {
                return `Les territoires de la province du ${row.province} sont : ${row.territoires}.`;
            }

            if (q.includes("chef lieu") || q.includes("chef-lieu")) {
                return `Le chef-lieu de la province du ${row.province} est ${row.chef_lieu}.`;
            }

            return `${row.province} a pour chef-lieu ${row.chef_lieu}. Ses territoires sont : ${row.territoires}.`;
        }

        // 4. Bibliothèque générale
        res = await pool.query(
            `
            SELECT contenu
            FROM (
                SELECT COALESCE(description_details, '') || ' ' ||
                       COALESCE(altitudes_sommets, '') || ' ' ||
                       COALESCE(provinces_liees, '') AS contenu
                FROM drc_relief

                UNION ALL

                SELECT COALESCE(caracteristiques, '') || ' ' ||
                       COALESCE(provinces_et_localisation, '') AS contenu
                FROM drc_hydrographie

                UNION ALL

                SELECT COALESCE(type_vegetation, '') || ' ' ||
                       COALESCE(caracteristiques_meteo, '') || ' ' ||
                       COALESCE(provinces_concernees, '') AS contenu
                FROM drc_climat_vegetation

                UNION ALL

                SELECT COALESCE(ressources_cles, '') || ' ' ||
                       COALESCE(provinces_productrices, '') || ' ' ||
                       COALESCE(potentiel_et_acteurs, '') AS contenu
                FROM drc_economie

                UNION ALL

                SELECT COALESCE(province, '') || ' ' ||
                       COALESCE(chef_lieu, '') || ' ' ||
                       COALESCE(territoires, '') AS contenu
                FROM drc_population_villes
            ) AS bibliotheque
            WHERE LOWER(contenu) ILIKE '%' || $1 || '%'
            LIMIT 1
            `,
            [q]
        );

        if (res.rows.length > 0) {
            return res.rows[0].contenu;
        }

        return null;
    } catch (e) {
        console.error("Erreur bibliothèque :", e.message);
        return null;
    }
}

/* --- 3. WEBHOOK : INTERACTION HUMAINE ET MÉMOIRE --- */
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
        let user = userRes.rows[0];

        // A. Nouvel élève
        if (!user) {
            await pool.query(
                "INSERT INTO conversations (phone, historique, nom) VALUES ($1, $2, $3)",
                [from, '[]', '']
            );
            const welcome = `${HEADER}\n\n🔵 **Bonjour jeune patriote !**\n\n🟡 Je suis **Mwalimu**.\n\n🔴 Dis-moi ton nom et ta classe.`;
            return await sendWhatsApp(from, welcome);
        }

        // B. Nom
        if (!user.nom || user.nom.trim() === "") {
            await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [text, from]);
            const ambition = `${HEADER}\n\n🔵 Ravi de te connaître, **${text}**.\n\n🟡 Quel est ton rêve ?\n\n🔴 Que veux-tu devenir plus tard ?`;
            return await sendWhatsApp(from, ambition);
        }

        // C. Base de données d'abord
        const reponseBase = await chercherDansBibliotheque(text);
        const history = safeParseHistory(user.historique);

        if (reponseBase) {
            const newHistory = [
                ...history,
                { role: "user", content: text },
                { role: "assistant", content: reponseBase }
            ].slice(-10);

            await pool.query(
                "UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2",
                [JSON.stringify(newHistory), from]
            );

            return await sendWhatsApp(from, `${HEADER}\n\n${reponseBase}`);
        }

        // D. IA seulement si la base ne trouve rien
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es MWALIMU EDTECH.
1. Réponds directement.
2. Maximum 3 lignes.
3. N'invente jamais.
4. Si tu ne sais pas, dis : "Je n’ai pas encore cette donnée dans ma bibliothèque."
5. Utilise un ton simple et clair.`
                },
                ...history.slice(-8),
                { role: "user", content: text }
            ]
        });

        const aiReply = completion.choices[0].message.content;
        const newHistory = [
            ...history,
            { role: "user", content: text },
            { role: "assistant", content: aiReply }
        ].slice(-10);

        await pool.query(
            "UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2",
            [JSON.stringify(newHistory), from]
        );

        await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

    } catch (e) {
        console.error(e);
        await sendWhatsApp(from, `${HEADER}\n\n🔴 Petit souci technique. Répète ta question.`);
    }
});

app.listen(process.env.PORT || 10000);
