
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

const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Science sans conscience n'est que ruine de l'âme. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***"
];

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                to,
                text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.TOKEN}`,
                    "Content-Type": "application/json"
                }
            }
        );
    } catch (e) {
        console.error("Erreur API WhatsApp", e.response?.data || e.message);
    }
}

// --- RAPPEL DE 07:00 ---
cron.schedule("0 7 * * *", async () => {
    console.log("Exécution du rappel matinal...");
    try {
        const res = await pool.query(
            "SELECT phone, nom, reve FROM conversations WHERE nom IS NOT NULL AND nom != ''"
        );

        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const r = (user.reve || "")
                .replace(/Quels sont|territoires|Bonjour|Mwalimu|\?|!/gi, "")
                .trim() || "citoyen modèle";

            const msgMatin = `🔵 Mbote cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Aujourd'hui, travaille avec ardeur pour devenir le **${r}** que le Congo attend.`;
            await envoyerWhatsApp(user.phone, msgMatin);
        }
    } catch (e) {
        console.error("Erreur Cron", e.message);
    }
}, { timezone: "Africa/Lubumbashi" });

// --- OUTILS TEXTE ---
function nettoyerTexte(str) {
    return (str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function decouperListe(valeur) {
    if (!valeur) return [];

    return [...new Set(
        String(valeur)
            .split(/[,;\n\r|/]+/g)
            .map(v => v.trim())
            .filter(Boolean)
    )];
}

function filtrerTerritoires(villes, territoires) {
    const villesSet = new Set(villes.map(v => nettoyerTexte(v)));
    return territoires.filter(t => !villesSet.has(nettoyerTexte(t)));
}

function numeroterListe(liste) {
    if (!liste || !liste.length) return "Aucun";
    return liste.map((item, i) => `${i + 1}. ${item}`).join("\n     ");
}

// --- RECHERCHE BIBLIOTHÈQUE CORRIGÉE ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;

    const texte = nettoyerTexte(phrase);

    const stopWords = new Set([
        "bonjour", "bonsoir", "salut", "mwalimu", "question",
        "quels", "quelles", "quel", "quelle", "sont", "est",
        "les", "des", "du", "de", "la", "le", "l", "territoire",
        "territoires", "ville", "villes", "province", "chef", "lieu",
        "donne", "liste", "nom", "noms", "et", "dans", "sur", "pour"
    ]);

    const mots = texte
        .replace(/[?.,!:'"()]/g, " ")
        .split(/\s+/)
        .map(m => m.trim())
        .filter(m => m.length >= 3 && !stopWords.has(m));

    async function chercherAvecTerme(terme) {
        const res = await pool.query(
            `
            SELECT *
            FROM drc_population_villes
            WHERE
                LOWER(COALESCE(province, '')) LIKE $1
                OR LOWER(COALESCE(territoires, '')) LIKE $1
                OR LOWER(COALESCE(chef_lieu, '')) LIKE $1
                OR LOWER(COALESCE(villes, '')) LIKE $1
            ORDER BY
                CASE
                    WHEN LOWER(COALESCE(province, '')) = $2 THEN 1
                    WHEN LOWER(COALESCE(chef_lieu, '')) = $2 THEN 2
                    WHEN LOWER(COALESCE(villes, '')) LIKE $1 THEN 3
                    WHEN LOWER(COALESCE(territoires, '')) LIKE $1 THEN 4
                    ELSE 5
                END
            LIMIT 1
            `,
            [`%${terme}%`, terme]
        );

        if (!res.rows.length) return null;

        const row = res.rows[0];
        const vArr = decouperListe(row.villes);
        const tArrBrut = decouperListe(row.territoires);
        const tArr = filtrerTerritoires(vArr, tArrBrut);

        return {
            ...row,
            vListe: vArr,
            tListe: tArr,
            vPropres: vArr.length ? vArr.join(", ") : "Aucune",
            tNumerotes: numeroterListe(tArr)
        };
    }

    try {
        const resultatPhrase = await chercherAvecTerme(texte);
        if (resultatPhrase) return resultatPhrase;
    } catch (e) {
        console.error("Erreur recherche globale SQL", e.message);
    }

    for (const mot of mots) {
        try {
            const resultatMot = await chercherAvecTerme(mot);
            if (resultatMot) return resultatMot;
        } catch (e) {
            console.error("Erreur SQL mot par mot", e.message);
        }
    }

    return null;
}

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);

    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
        let user = rows[0];

        // --- ENRÔLEMENT ---
        if (!user) {
            await pool.query(
                "INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')",
                [from]
            );
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?");
        }

        if (!user.nom || !user.classe || !user.reve) {
            if (!user.nom) {
                const n = text.replace(/Mon prénom est|Je m'appelle|Moi c'est/gi, "").trim();
                await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [n, from]);
                return await envoyerWhatsApp(from, `🔵 Enchanté **${n}** ! En quelle **classe** es-tu ?`);
            }

            if (!user.classe) {
                await pool.query("UPDATE conversations SET classe = $1 WHERE phone = $2", [text, from]);
                return await envoyerWhatsApp(from, "🔵 C'est noté. Quel est ton plus grand **rêve** professionnel ?");
            }

            if (!user.reve) {
                const r = text.replace(/Mon rêve est|Je veux devenir/gi, "").trim();
                await pool.query("UPDATE conversations SET reve = $1 WHERE phone = $2", [r, from]);
                return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir **${r}**.\n\n🟡 Pose-moi ta question.`);
            }
        }

        const info = await consulterBibliotheque(text);
        const cit = citations[Math.floor(Math.random() * citations.length)];

        let hist = [];
        try {
            hist = typeof user.historique === "string"
                ? JSON.parse(user.historique)
                : (user.historique || []);
        } catch (e) {
            hist = [];
        }

        const systemPrompt = `
Tu es Mwalimu EdTech, un précepteur congolais d'élite, chaleureux, humain, pédagogique et précis.
Ton élève s'appelle ${user.nom}.
Il est en classe de ${user.classe}.
Son rêve est de devenir ${user.reve}.

<RÈGLES FONDAMENTALES>
- Utilise uniquement les données fournies ci-dessous quand elles existent.
- N'invente jamais une ville ou un territoire.
- Ne mélange jamais les villes et les territoires.
- Affiche toujours la liste complète des villes trouvées.
- Affiche toujours la liste complète des territoires trouvés.
- Ne résume jamais la liste par "etc.".
- Si aucune donnée n'est trouvée, dis-le honnêtement puis donne une réponse pédagogique générale.
- Réponds comme un vrai précepteur bienveillant, pas comme un moteur de recherche.
</RÈGLES FONDAMENTALES>

<DONNÉES_SQL>
Province: ${info ? info.province || "Non trouvée" : "Non trouvée"}
Chef-lieu: ${info ? info.chef_lieu || "Non trouvé" : "Non trouvé"}
Villes: ${info ? info.vPropres : "Aucune"}
Territoires:
     ${info && info.tListe?.length ? info.tNumerotes : "Aucun"}
Richesses: ${info ? info.nature_richesses || "Non renseignées" : "Non renseignées"}
</DONNÉES_SQL>

<STYLE_DE_RÉPONSE>
🔵 [VÉCU] : petite explication simple, concrète et chaleureuse.

🟡 [SAVOIR] :
- Chef-lieu : ...
- Villes : ...
- Territoires :
  ...
- Nature et richesses : ...

🔴 [INSPIRATION] : encouragement lié au rêve de ${user.reve}.

❓ [CONSOLIDATION] : petite question de révision adressée à ${user.nom}.
</STYLE_DE_RÉPONSE>
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: systemPrompt },
                ...hist.slice(-4),
                { role: "user", content: text }
            ],
            temperature: 0.3
        });

        const reponseIA = completion.choices[0]?.message?.content || "Je n'ai pas pu répondre correctement cette fois-ci.";
        await envoyerWhatsApp(from, `${reponseIA}\n\n${cit}`);

        const nouvelHist = JSON.stringify(
            [...hist, { role: "user", content: text }, { role: "assistant", content: reponseIA }].slice(-10)
        );

        await pool.query("UPDATE conversations SET historique = $1 WHERE phone = $2", [nouvelHist, from]);

    } catch (e) {
        console.error("Erreur Webhook", e.response?.data || e.message || e);
    }
});

app.listen(process.env.PORT || 10000, () => {
    console.log(`Serveur lancé sur le port ${process.env.PORT || 10000}`);
});
