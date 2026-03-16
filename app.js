
const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const { Pool } = require("pg");
require("dotenv").config();

const app = express().use(express.json());

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

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
                text: {
                    body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}`
                }
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

cron.schedule("0 7 * * *", async () => {
    console.log("Exécution du rappel matinal...");
    try {
        const res = await pool.query(
            "SELECT phone, nom, reve FROM conversations WHERE nom IS NOT NULL AND nom != ''"
        );

        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const reve = (user.reve || "").trim() || "citoyen modèle";

            const msgMatin =
                `🔵 Mbote cher élève ${user.nom} !\n\n` +
                `🟡 ${cit}\n\n` +
                `🔴 Aujourd'hui, travaille avec ardeur pour devenir le **${reve}** que le Congo attend.`;

            await envoyerWhatsApp(user.phone, msgMatin);
        }
    } catch (e) {
        console.error("Erreur Cron", e.message);
    }
}, { timezone: "Africa/Lubumbashi" });

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

function numeroterListeSimple(liste) {
    if (!liste || !liste.length) return "Aucun";
    return liste.map((item, i) => `${i + 1}. ${item}`).join("\n  ");
}

function separerVillesEtTerritoires(villes, territoires, chefLieu) {
    const normaliser = (x) => nettoyerTexte(x);

    let v = [...new Set((villes || []).map(x => String(x).trim()).filter(Boolean))];
    let t = [...new Set((territoires || []).map(x => String(x).trim()).filter(Boolean))];
    const chef = chefLieu ? String(chefLieu).trim() : "";

    const territoiresSet = new Set(t.map(normaliser));

    v = v.filter(item => {
        const n = normaliser(item);
        if (chef && n === normaliser(chef)) return true;
        return !territoiresSet.has(n);
    });

    t = t.filter(item => !(chef && normaliser(item) === normaliser(chef)));

    if (chef && !v.some(x => normaliser(x) === normaliser(chef))) {
        v.unshift(chef);
    }

    return {
        villesPropres: v,
        territoiresPropres: t
    };
}

function extraireProvinceDemandee(phrase) {
    const texte = nettoyerTexte(phrase);

    const provinces = [
        "bas-uele", "haut-uele", "ituri", "tshopo", "basoko", "haut-katanga",
        "haut-lomami", "lualaba", "tanganyika", "maniema", "sud-kivu",
        "nord-kivu", "ituri", "kinshasa", "kongo central", "kwango",
        "kwilu", "maindombe", "kasaï", "kasai", "kasaï central",
        "kasai central", "kasaï oriental", "kasai oriental", "lomami",
        "sankuru", "tshuapa", "mongala", "nord-ubangi", "sud-ubangi",
        "equateur"
    ];

    for (const p of provinces) {
        if (texte.includes(p)) return p;
    }

    return null;
}

async function chercherProvinceParNom(provinceTexte) {
    if (!provinceTexte) return null;

    const terme = nettoyerTexte(provinceTexte);

    const res = await pool.query(
        `
        SELECT *
        FROM drc_population_villes
        WHERE LOWER(COALESCE(province, '')) LIKE $1
        ORDER BY
            CASE
                WHEN LOWER(COALESCE(province, '')) = $2 THEN 1
                ELSE 2
            END
        LIMIT 1
        `,
        [`%${terme}%`, terme]
    );

    if (!res.rows.length) return null;
    return normaliserResultatProvince(res.rows[0]);
}

function normaliserResultatProvince(row) {
    const vArrBrut = decouperListe(row.villes);
    const tArrBrut = decouperListe(row.territoires);

    const separation = separerVillesEtTerritoires(
        vArrBrut,
        tArrBrut,
        row.chef_lieu
    );

    return {
        ...row,
        vListe: separation.villesPropres,
        tListe: separation.territoiresPropres,
        vPropres: separation.villesPropres.length
            ? separation.villesPropres.join(", ")
            : "Aucune",
        tNumerotes: numeroterListeSimple(separation.territoiresPropres)
    };
}

async function consulterBibliotheque(phrase) {
    if (!phrase) return null;

    const provinceDemandee = extraireProvinceDemandee(phrase);
    if (provinceDemandee) {
        try {
            const provinceTrouvee = await chercherProvinceParNom(provinceDemandee);
            if (provinceTrouvee) return provinceTrouvee;
        } catch (e) {
            console.error("Erreur recherche province directe", e.message);
        }
    }

    const texte = nettoyerTexte(phrase);

    const stopWords = new Set([
        "bonjour", "bonsoir", "salut", "mwalimu", "question",
        "quels", "quelles", "quel", "quelle", "sont", "est",
        "les", "des", "du", "de", "la", "le", "l", "territoire",
        "territoires", "ville", "villes", "province", "chef", "lieu",
        "donne", "liste", "nom", "noms", "et", "dans", "sur", "pour",
        "peux", "tu", "me", "dire", "citer", "tous", "toutes", "ses",
        "du", "sud", "nord", "haut", "bas"
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
                    WHEN LOWER(COALESCE(province, '')) LIKE $1 THEN 3
                    WHEN LOWER(COALESCE(chef_lieu, '')) LIKE $1 THEN 4
                    WHEN LOWER(COALESCE(villes, '')) LIKE $1 THEN 5
                    WHEN LOWER(COALESCE(territoires, '')) LIKE $1 THEN 6
                    ELSE 7
                END
            LIMIT 1
            `,
            [`%${terme}%`, terme]
        );

        if (!res.rows.length) return null;
        return normaliserResultatProvince(res.rows[0]);
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

function construireReponseProvince(info, user) {
    const nom = user?.nom || "cher élève";
    const reve = user?.reve || "grand professionnel";

    return [
        `🔵 Très bien ${nom}, voici la réponse correcte sur **${info.province}**.`,
        ``,
        `🟡 [SAVOIR] :`,
        `- Chef-lieu : ${info.chef_lieu || "Non trouvé"}`,
        `- Villes : ${info.vPropres || "Aucune"}`,
        `- Territoires :`,
        `  ${info.tListe && info.tListe.length ? info.tListe.map((t, i) => `${i + 1}. ${t}`).join("\n  ") : "Aucun"}`,
        `- Nature et richesses : ${info.nature_richesses || "Non renseignées"}`,
        ``,
        `🔴 [INSPIRATION] : ${nom}, retiens d'abord les faits exacts. La précision est une qualité des grands ${reve}.`,
        ``,
        `❓ [CONSOLIDATION] : Peux-tu me redonner le chef-lieu de ${info.province} ?`
    ].join("\n");
}

async function genererReponsePedagogiqueLibre(text, user, hist) {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `
Tu es Mwalimu EdTech, un précepteur congolais chaleureux et pédagogue.
Tu t'adresses à un élève nommé ${user.nom}, de la classe ${user.classe}, qui rêve de devenir ${user.reve}.

Règles :
- Réponse claire, courte et humaine.
- Si l'information exacte n'est pas dans la base, dis-le honnêtement.
- N'invente jamais de liste administrative.
- Ne réponds jamais comme un moteur de recherche.
- Termine par une petite question de consolidation.
                `
            },
            ...hist.slice(-4),
            { role: "user", content: text }
        ],
        temperature: 0.2
    });

    return completion.choices[0]?.message?.content ||
        "Je n'ai pas trouvé cette information exacte dans ma base pour le moment.";
}

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);

    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query(
            "SELECT * FROM conversations WHERE phone = $1",
            [from]
        );
        let user = rows[0];

        if (!user) {
            await pool.query(
                "INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')",
                [from]
            );
            return await envoyerWhatsApp(
                from,
                "🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?"
            );
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

        let hist = [];
        try {
            hist = typeof user.historique === "string"
                ? JSON.parse(user.historique)
                : (user.historique || []);
        } catch (e) {
            hist = [];
        }

        const info = await consulterBibliotheque(text);
        const cit = citations[Math.floor(Math.random() * citations.length)];

        let reponseFinale = "";

        if (info) {
            reponseFinale = construireReponseProvince(info, user);
        } else {
            reponseFinale = await genererReponsePedagogiqueLibre(text, user, hist);
        }

        await envoyerWhatsApp(from, `${reponseFinale}\n\n${cit}`);

        const nouvelHist = JSON.stringify(
            [
                ...hist,
                { role: "user", content: text },
                { role: "assistant", content: reponseFinale }
            ].slice(-10)
        );

        await pool.query(
            "UPDATE conversations SET historique = $1 WHERE phone = $2",
            [nouvelHist, from]
        );

    } catch (e) {
        console.error("Erreur Webhook", e.response?.data || e.message || e);
    }
});

app.listen(process.env.PORT || 10000, () => {
    console.log(`Serveur lancé sur le port ${process.env.PORT || 10000}`);
});
