
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
    } catch {
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

/* ---------- STRUCTURE TABLE conversations ----------
Ajoute ces colonnes une seule fois si elles n'existent pas :

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS classe TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS etape_onboarding TEXT DEFAULT 'nom';
---------------------------------------------------- */

cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query(
            "SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''"
        );
        const citation = citations[Math.floor(Math.random() * citations.length)];

        for (const user of res.rows) {
            const msg = `${HEADER}

🔵 Bonjour mon cher ${user.nom} !

🟡 ${citation}

🔴 Comment a été ta journée d'hier ? Qu'allons-nous apprendre aujourd'hui ?`;

            await sendWhatsApp(user.phone, msg);
        }
    } catch (e) {
        console.error("Erreur Cron :", e.message);
    }
}, { timezone: "Africa/Lubumbashi" });

async function chercherDansBibliotheque(question) {
    const q = normalizeText(question);

    try {
        let res = await pool.query(`SELECT question, reponse FROM questions_reponses`);
        const questionTrouvee = res.rows.find(row => {
            const dbq = normalizeText(row.question);
            return dbq === q || dbq.includes(q) || q.includes(dbq);
        });
        if (questionTrouvee) return questionTrouvee.reponse;

        res = await pool.query(`SELECT province, chef_lieu, territoires FROM drc_population_villes`);
        const provinceTrouvee = res.rows.find(row => {
            const p = normalizeText(row.province);
            return p && q.includes(p);
        });

        if (provinceTrouvee) {
            if (q.includes("territoire")) {
                return `Les territoires de la province du ${provinceTrouvee.province} sont : ${provinceTrouvee.territoires}.`;
            }
            if (q.includes("chef lieu")) {
                return `Le chef-lieu de la province du ${provinceTrouvee.province} est ${provinceTrouvee.chef_lieu}.`;
            }
            return `${provinceTrouvee.province} a pour chef-lieu ${provinceTrouvee.chef_lieu}. Ses territoires sont : ${provinceTrouvee.territoires}.`;
        }

        res = await pool.query(`SELECT element, caracteristiques FROM drc_hydrographie`);
        const hydroTrouvee = res.rows.find(row => {
            const element = normalizeText(row.element);
            const car = normalizeText(row.caracteristiques);
            return (element && q.includes(element)) || (car && q.includes(element)) || (element && element.includes(q));
        });
        if (hydroTrouvee) return hydroTrouvee.caracteristiques;

        res = await pool.query(`SELECT unite_physique, description_details, altitudes_sommets, provinces_liees FROM drc_relief`);
        const reliefTrouve = res.rows.find(row => {
            const titre = normalizeText(row.unite_physique);
            const desc = normalizeText(`${row.description_details || ""} ${row.altitudes_sommets || ""} ${row.provinces_liees || ""}`);
            return (titre && q.includes(titre)) || (desc && q.includes(titre)) || (titre && titre.includes(q));
        });
        if (reliefTrouve) {
            return `${reliefTrouve.description_details || ""} ${reliefTrouve.altitudes_sommets || ""}`.trim();
        }

        res = await pool.query(`SELECT zone_climatique, type_vegetation, caracteristiques_meteo FROM drc_climat_vegetation`);
        const climatTrouve = res.rows.find(row => {
            const titre = normalizeText(`${row.zone_climatique || ""} ${row.type_vegetation || ""}`);
            const desc = normalizeText(row.caracteristiques_meteo || "");
            return (titre && q.includes(titre)) || (desc && q.includes(titre)) || (titre && titre.includes(q));
        });
        if (climatTrouve) {
            return `${climatTrouve.zone_climatique || ""}. ${climatTrouve.type_vegetation || ""}. ${climatTrouve.caracteristiques_meteo || ""}`.trim();
        }

        res = await pool.query(`SELECT secteur, ressources_cles, provinces_productrices, potentiel_et_acteurs FROM drc_economie`);
        const ecoTrouve = res.rows.find(row => {
            const titre = normalizeText(row.secteur || "");
            const desc = normalizeText(`${row.ressources_cles || ""} ${row.provinces_productrices || ""} ${row.potentiel_et_acteurs || ""}`);
            return (titre && q.includes(titre)) || (desc && q.includes(titre)) || (titre && titre.includes(q));
        });
        if (ecoTrouve) {
            return `${ecoTrouve.ressources_cles || ""}. ${ecoTrouve.potentiel_et_acteurs || ""}`.trim();
        }

        res = await pool.query(`SELECT province, nom, description FROM drc_data`);
        const dataTrouvee = res.rows.find(row => {
            const nom = normalizeText(row.nom || "");
            const desc = normalizeText(row.description || "");
            return (nom && q.includes(nom)) || (desc && q.includes(nom)) || (nom && nom.includes(q));
        });
        if (dataTrouvee) return dataTrouvee.description;

        return null;
    } catch (e) {
        console.error("Erreur bibliothèque :", e.message);
        return null;
    }
}

async function transformerEnReponseMwalimu(reponseBase, question, nom = "cher élève", classe = "") {
    try {
        const niveau = classe ? `L'élève est en classe de ${classe}. Adapte le niveau à cette classe.` : "Adapte la réponse à un élève avec un langage simple.";
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es MWALIMU EDTECH, un précepteur congolais humain, bienveillant, chaleureux et clair.

RÈGLES :
1. Tu restes fidèle à la réponse de la base de données. N'invente rien.
2. Tu réponds comme un professeur assis en face de l'élève.
3. Réponse courte : 5 à 8 lignes maximum.
4. Structure obligatoire :
🔵 explication simple,
🟡 exemple concret lié au vécu des Congolais,
🔴 petite ouverture humaine ou question bienveillante.
5. Appelle l'élève : "mon cher ${nom}".
6. ${niveau}
7. Tu peux terminer parfois par :
   - "As-tu bien compris ?"
   - "Comment a été ta journée ?"
   - "Veux-tu un petit exercice ?"`
                },
                {
                    role: "user",
                    content: `Question de l'élève : ${question}

Réponse exacte de la base :
${reponseBase}

Transforme cette réponse avec chaleur humaine, pédagogie et exemple congolais.`
                }
            ]
        });

        return completion.choices[0].message.content;
    } catch (e) {
        return `🔵 Mon cher ${nom}, voici la réponse juste.

🟡 ${reponseBase}

🔴 As-tu bien compris ?`;
    }
}

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);

    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body.trim();

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
        let user = userRes.rows[0];

        if (!user) {
            await pool.query(
                `INSERT INTO conversations (phone, historique, nom, classe, etape_onboarding)
                 VALUES ($1, $2, $3, $4, $5)`,
                [from, '[]', '', '', 'nom']
            );

            const welcome = `${HEADER}

🔵 Bonjour jeune patriote !

🟡 Je suis Mwalimu, ton précepteur personnel.

🔴 Dis-moi d'abord ton nom.`;

            return await sendWhatsApp(from, welcome);
        }

        const history = safeParseHistory(user.historique);

        if (!user.nom || user.nom.trim() === "" || user.etape_onboarding === "nom") {
            await pool.query(
                "UPDATE conversations SET nom = $1, etape_onboarding = $2 WHERE phone = $3",
                [text, 'classe', from]
            );

            const askClass = `${HEADER}

🔵 Ravi de te connaître, ${text}.

🟡 Pour mieux adapter mes réponses à ton niveau,

🔴 dis-moi maintenant ta classe.`;

            return await sendWhatsApp(from, askClass);
        }

        if (!user.classe || user.classe.trim() === "" || user.etape_onboarding === "classe") {
            await pool.query(
                "UPDATE conversations SET classe = $1, etape_onboarding = $2 WHERE phone = $3",
                [text, 'ok', from]
            );

            const ready = `${HEADER}

🔵 Très bien mon cher ${user.nom}.

🟡 J'ai bien noté que tu es en ${text}.

🔴 Tu peux maintenant me poser ta question.`;
            return await sendWhatsApp(from, ready);
        }

        const infoBase = await chercherDansBibliotheque(text);

        if (infoBase) {
            const reponsePedagogique = await transformerEnReponseMwalimu(
                infoBase,
                text,
                user.nom,
                user.classe
            );

            const newHistory = [
                ...history,
                { role: "user", content: text },
                { role: "assistant", content: reponsePedagogique }
            ].slice(-10);

            await pool.query(
                "UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2",
                [JSON.stringify(newHistory), from]
            );

            return await sendWhatsApp(from, `${HEADER}

${reponsePedagogique}`);
        }

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es MWALIMU EDTECH, un précepteur congolais humain, bienveillant et chaleureux.

RÈGLES :
1. Réponds comme un professeur assis en face de l'élève.
2. Maximum 6 lignes.
3. Appelle l'élève : "mon cher ${user.nom}".
4. L'élève est en classe de ${user.classe}. Adapte le niveau.
5. Si tu ne sais pas, dis exactement : "Je n’ai pas encore cette donnée dans ma bibliothèque."
6. Donne un exemple congolais si possible.
7. Tu peux finir par une petite question humaine.`
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

        await sendWhatsApp(from, `${HEADER}

${aiReply}`);

    } catch (e) {
        console.error(e);
        await sendWhatsApp(from, `${HEADER}

🔴 Petit souci technique. Répète ta question.`);
    }
});

app.listen(process.env.PORT || 10000);
