
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

function lireHistorique(historique) {
    if (!historique) return [];
    if (Array.isArray(historique)) return historique;
    if (typeof historique === "string") {
        try {
            return JSON.parse(historique);
        } catch {
            return [];
        }
    }
    return [];
}

function extraireMotsCles(question) {
    const stopwords = [
        "le", "la", "les", "un", "une", "des", "du", "de", "d", "et", "en", "au",
        "aux", "dans", "sur", "sous", "avec", "pour", "par", "qui", "que", "quoi",
        "ou", "où", "est", "sont", "a", "ont", "je", "tu", "il", "elle", "nous",
        "vous", "ils", "elles", "mon", "ma", "mes", "ton", "ta", "tes", "son",
        "sa", "ses", "notre", "votre", "leur", "leurs", "rdc", "congo",
        "quelle", "quelles", "quels", "quel", "comment", "pourquoi", "combien"
    ];

    return question
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((mot) => mot.length > 2 && !stopwords.includes(mot));
}

async function chercherDansBibliotheque(question) {
    try {
        const motsCles = extraireMotsCles(question);
        if (motsCles.length === 0) return null;

        const qr = await pool.query(
            `
            SELECT reponse AS contenu
            FROM questions_reponses
            WHERE EXISTS (
                SELECT 1
                FROM unnest($1::text[]) AS mot
                WHERE question ILIKE '%' || mot || '%'
                   OR reponse ILIKE '%' || mot || '%'
            )
            LIMIT 1
            `,
            [motsCles]
        );

        if (qr.rows.length > 0) {
            return qr.rows[0].contenu;
        }

        const lecon = await pool.query(
            `
            SELECT source, titre, contenu
            FROM (
                SELECT
                    'relief' AS source,
                    unite_physique AS titre,
                    COALESCE(description_details, '') || ' ' ||
                    COALESCE(altitudes_sommets, '') || ' ' ||
                    COALESCE(provinces_liees, '') AS contenu
                FROM drc_relief

                UNION ALL

                SELECT
                    'hydrographie' AS source,
                    element AS titre,
                    COALESCE(caracteristiques, '') || ' ' ||
                    COALESCE(provinces_et_localisation, '') AS contenu
                FROM drc_hydrographie

                UNION ALL

                SELECT
                    'climat_vegetation' AS source,
                    zone_climatique AS titre,
                    COALESCE(type_vegetation, '') || ' ' ||
                    COALESCE(caracteristiques_meteo, '') || ' ' ||
                    COALESCE(provinces_concernees, '') AS contenu
                FROM drc_climat_vegetation

                UNION ALL

                SELECT
                    'economie' AS source,
                    secteur AS titre,
                    COALESCE(ressources_cles, '') || ' ' ||
                    COALESCE(provinces_productrices, '') || ' ' ||
                    COALESCE(potentiel_et_acteurs, '') AS contenu
                FROM drc_economie

                UNION ALL

                SELECT
                    'population_villes' AS source,
                    province AS titre,
                    COALESCE(chef_lieu, '') || ' ' ||
                    COALESCE(territoires, '') AS contenu
                FROM drc_population_villes
            ) AS bibliotheque
            WHERE EXISTS (
                SELECT 1
                FROM unnest($1::text[]) AS mot
                WHERE titre ILIKE '%' || mot || '%'
                   OR contenu ILIKE '%' || mot || '%'
            )
            LIMIT 1
            `,
            [motsCles]
        );

        if (lecon.rows.length > 0) {
            return lecon.rows[0].contenu;
        }

        return null;
    } catch (error) {
        console.error("Erreur recherche bibliothèque :", error.message);
        return null;
    }
}

cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom FROM conversations");
        const citation = citations[Math.floor(Math.random() * citations.length)];
        for (const user of res.rows) {
            const msg = `${HEADER}\n\n🔵 **Bonjour ${user.nom || "cher élève"} !**\n\n🟡 *"${citation}"*\n\n🔴 Réveille ton génie ! Qu'as-tu prévu d'apprendre aujourd'hui ?`;
            await sendWhatsApp(user.phone, msg);
        }
    } catch (e) {
        console.log("Erreur Cron");
    }
}, { timezone: "Africa/Lubumbashi" });

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg || msg.type !== "text") return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
        let user = userRes.rows[0];

        if (!user) {
            await pool.query(
                "INSERT INTO conversations (phone, historique) VALUES ($1, $2)",
                [from, JSON.stringify([])]
            );
            const welcome = `${HEADER}\n\n🔵 **Bienvenu (e) jeune patriote !** 😊\n\n🟡 Je suis **Mwalimu EdTech**, ton précepteur personnel.`;
            return await sendWhatsApp(from, welcome);
        }

        if (!user.nom && text.length < 50) {
            await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [text, from]);
            user.nom = text;
        }

        const reponseBibliotheque = await chercherDansBibliotheque(text);

        if (reponseBibliotheque) {
            const historiqueActuel = lireHistorique(user.historique);

            const newHistory = [
                ...historiqueActuel,
                { role: "user", content: text },
                { role: "assistant", content: reponseBibliotheque }
            ].slice(-10);

            await pool.query(
                "UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2",
                [JSON.stringify(newHistory), from]
            );

            return await sendWhatsApp(from, `${HEADER}\n\n${reponseBibliotheque}`);
        }

        let geoContext = "";
        const resGeo = await pool.query(
            "SELECT province, nom, description FROM drc_data WHERE province ILIKE $1 OR nom ILIKE $1 OR description ILIKE $1 LIMIT 3",
            [`%${text.toLowerCase()}%`]
        );

        if (resGeo.rows.length > 0) {
            geoContext = resGeo.rows
                .map(r => `[DONNÉE SOURCE RDC : ${r.province}, ${r.nom} : ${r.description}]`)
                .join("\n");
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Tu es MWALIMU EDTECH, précepteur expert.
                    MÉTHODE DE TUTORAT APPROFONDI :
                    1. Ne donne JAMAIS la réponse brute en premier.
                    2. Étape 1 : Explique le concept avec aisance.
                    3. Étape 2 : Donne un exemple concret du vécu congolais de l'élève.
                    4. Étape 3 : Donne la réponse finale en utilisant prioritairement ces données : ${geoContext}.
                    5. Si la question est générale (Maths, Philo), utilise ta connaissance mais garde le ton de précepteur.
                    STYLE VISUEL :
                    - Chaque paragraphe DOIT commencer par une boule (🔵, 🟡, 🔴).
                    - Ton direct, frontal, chaleureux et exigeant envers ${user.nom || "l'élève"}.`
                },
                ...lireHistorique(user.historique).slice(-8),
                { role: "user", content: text }
            ]
        });

        const aiReply = response.choices[0].message.content;

        const newHistory = [
            ...lireHistorique(user.historique),
            { role: "user", content: text },
            { role: "assistant", content: aiReply }
        ].slice(-10);

        await pool.query(
            "UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2",
            [JSON.stringify(newHistory), from]
        );

        await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

    } catch (error) {
        console.error(error);
        await sendWhatsApp(from, `${HEADER}\n\n🔵 Erreur technique : ${error.message}`);
    }
});

app.listen(process.env.PORT || 10000);
