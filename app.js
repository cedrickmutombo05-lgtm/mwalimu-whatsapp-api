
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

function normalizeText(text) {
    return (text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[-']/g, " ")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

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

/* --- 1. RAPPEL DU MATIN (LUBUMBASHI 07:00) --- */
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        const citation = citations[Math.floor(Math.random() * citations.length)];
        for (const user of res.rows) {
            const msg = `${HEADER}\n\n🔵 Bonjour mon cher ${user.nom} !\n\n🟡 ${citation}\n\n🔴 Je suis prêt pour tes révisions.`;
            await sendWhatsApp(user.phone, msg);
        }
    } catch (e) {
        console.error("Erreur Cron :", e.message);
    }
}, { timezone: "Africa/Lubumbashi" });

/* --- 2. RECHERCHE BIBLIOTHÈQUE --- */
async function chercherDansBibliotheque(question) {
    const q = normalizeText(question);

    try {
        // 1. Correspondance exacte ou quasi exacte dans questions_reponses
        let res = await pool.query(
            `
            SELECT question, reponse
            FROM questions_reponses
            ORDER BY LENGTH(question) ASC
            `
        );

        const questionTrouvee = res.rows.find(row => {
            const dbq = normalizeText(row.question);
            return dbq === q || dbq.includes(q) || q.includes(dbq);
        });

        if (questionTrouvee) {
            return questionTrouvee.reponse;
        }

        // 2. Provinces / territoires / chefs-lieux
        res = await pool.query(
            `SELECT province, chef_lieu, territoires FROM drc_population_villes`
        );

        const provinceTrouvee = res.rows.find(row => {
            const p = normalizeText(row.province);
            return p && q.includes(p);
        });

        if (provinceTrouvee) {
            if (q.includes("territoire")) {
                return `Les territoires de la province du ${provinceTrouvee.province} sont : ${provinceTrouvee.territoires}.`;
            }

            if (q.includes("chef lieu") || q.includes("chef lieu")) {
                return `Le chef-lieu de la province du ${provinceTrouvee.province} est ${provinceTrouvee.chef_lieu}.`;
            }

            return `${provinceTrouvee.province} a pour chef-lieu ${provinceTrouvee.chef_lieu}. Ses territoires sont : ${provinceTrouvee.territoires}.`;
        }

        // 3. Hydrographie
        res = await pool.query(
            `SELECT element, caracteristiques FROM drc_hydrographie`
        );

        const hydroTrouvee = res.rows.find(row => {
            const element = normalizeText(row.element);
            const car = normalizeText(row.caracteristiques);
            return (element && q.includes(element)) || (car && q.includes(element)) || (element && element.includes(q));
        });

        if (hydroTrouvee) {
            return hydroTrouvee.caracteristiques;
        }

        // 4. Relief
        res = await pool.query(
            `SELECT unite_physique, description_details, altitudes_sommets, provinces_liees FROM drc_relief`
        );

        const reliefTrouve = res.rows.find(row => {
            const titre = normalizeText(row.unite_physique);
            const desc = normalizeText(
                `${row.description_details || ""} ${row.altitudes_sommets || ""} ${row.provinces_liees || ""}`
            );
            return (titre && q.includes(titre)) || (desc && q.includes(titre)) || (titre && titre.includes(q));
        });

        if (reliefTrouve) {
            return `${reliefTrouve.description_details || ""} ${reliefTrouve.altitudes_sommets || ""}`.trim();
        }

        // 5. Climat et végétation
        res = await pool.query(
            `SELECT zone_climatique, type_vegetation, caracteristiques_meteo FROM drc_climat_vegetation`
        );

        const climatTrouve = res.rows.find(row => {
            const titre = normalizeText(`${row.zone_climatique || ""} ${row.type_vegetation || ""}`);
            const desc = normalizeText(row.caracteristiques_meteo || "");
            return (titre && q.includes(titre)) || (desc && q.includes(titre)) || (titre && titre.includes(q));
        });

        if (climatTrouve) {
            return `${climatTrouve.zone_climatique || ""}. ${climatTrouve.type_vegetation || ""}. ${climatTrouve.caracteristiques_meteo || ""}`.trim();
        }

        // 6. Économie
        res = await pool.query(
            `SELECT secteur, ressources_cles, provinces_productrices, potentiel_et_acteurs FROM drc_economie`
        );

        const ecoTrouve = res.rows.find(row => {
            const titre = normalizeText(row.secteur || "");
            const desc = normalizeText(
                `${row.ressources_cles || ""} ${row.provinces_productrices || ""} ${row.potentiel_et_acteurs || ""}`
            );
            return (titre && q.includes(titre)) || (desc && q.includes(titre)) || (titre && titre.includes(q));
        });

        if (ecoTrouve) {
            return `${ecoTrouve.ressources_cles || ""}. ${ecoTrouve.potentiel_et_acteurs || ""}`.trim();
        }

        // 7. drc_data en dernier
        res = await pool.query(
            `SELECT province, nom, description FROM drc_data`
        );

        const dataTrouvee = res.rows.find(row => {
            const nom = normalizeText(row.nom || "");
            const desc = normalizeText(row.description || "");
            return (nom && q.includes(nom)) || (desc && q.includes(nom)) || (nom && nom.includes(q));
        });

        if (dataTrouvee) {
            return dataTrouvee.description;
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

        // A. Accueil nouvel élève
        if (!user) {
            await pool.query(
                "INSERT INTO conversations (phone, historique, nom) VALUES ($1, $2, $3)",
                [from, '[]', '']
            );
            const welcome = `${HEADER}\n\n🔵 Bonjour jeune patriote !\n\n🟡 Je suis Mwalimu.\n\n🔴 Dis-moi ton nom et ta classe.`;
            return await sendWhatsApp(from, welcome);
        }

        // B. Collecte du nom
        if (!user.nom || user.nom.trim() === "") {
            await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [text, from]);
            const ambition = `${HEADER}\n\n🔵 Ravi de te connaître, ${text}.\n\n🟡 Quel est ton rêve ?\n\n🔴 Que veux-tu devenir plus tard ?`;
            return await sendWhatsApp(from, ambition);
        }

        // C. Recherche base d'abord
        const infoBase = await chercherDansBibliotheque(text);
        const history = safeParseHistory(user.historique);

        if (infoBase) {
            const newHistory = [
                ...history,
                { role: "user", content: text },
                { role: "assistant", content: infoBase }
            ].slice(-10);

            await pool.query(
                "UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2",
                [JSON.stringify(newHistory), from]
            );

            return await sendWhatsApp(from, `${HEADER}\n\n${infoBase}`);
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
3. Réponds uniquement à la question posée.
4. N'invente jamais.
5. Si tu ne sais pas, dis exactement : "Je n’ai pas encore cette donnée dans ma bibliothèque."`
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
