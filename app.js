
const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
app.use(express.json());

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. »",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba"
];

// -------------------- OUTILS --------------------

function nettoyerTexte(texte = "") {
    return texte
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[?.,!;:()"'`’“”/\-_]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function extraireNomUtilisateur(texte = "") {
    const t = texte.trim();

    const patterns = [
        /je m'appelle\s+([a-zA-ZÀ-ÿ\- ]{2,40})/i,
        /mon nom est\s+([a-zA-ZÀ-ÿ\- ]{2,40})/i,
        /moi c'est\s+([a-zA-ZÀ-ÿ\- ]{2,40})/i,
        /^([a-zA-ZÀ-ÿ\-]{2,30})$/i
    ];

    for (const p of patterns) {
        const m = t.match(p);
        if (m && m[1]) return m[1].trim();
    }

    return null;
}

function extraireSexe(texte = "") {
    const t = nettoyerTexte(texte);

    if (
        t.includes("je suis une fille") ||
        t.includes("je suis fille") ||
        t.includes("sexe feminin") ||
        t.includes("je suis une eleve")
    ) {
        return "F";
    }

    if (
        t.includes("je suis un garcon") ||
        t.includes("je suis garcon") ||
        t.includes("sexe masculin") ||
        t.includes("je suis un eleve")
    ) {
        return "M";
    }

    return null;
}

function extraireClasse(texte = "") {
    const t = texte.trim();

    const classes = [
        "1re primaire", "2e primaire", "3e primaire", "4e primaire", "5e primaire", "6e primaire",
        "7e", "8e",
        "1re secondaire", "2e secondaire", "3e secondaire", "4e secondaire", "5e secondaire", "6e secondaire",
        "première primaire", "deuxième primaire", "troisième primaire", "quatrième primaire", "cinquième primaire", "sixième primaire",
        "première secondaire", "deuxième secondaire", "troisième secondaire", "quatrième secondaire", "cinquième secondaire", "sixième secondaire"
    ];

    for (const c of classes) {
        if (t.toLowerCase().includes(c.toLowerCase())) return c;
    }

    const match = t.match(/(?:je suis en|classe|niveau)\s+([a-zA-Z0-9À-ÿ\- ]{2,30})/i);
    return match ? match[1].trim() : null;
}

function estQuestionBibliotheque(texte = "") {
    const t = nettoyerTexte(texte);

    const motsCles = [
        "province", "territoire", "territoires", "chef lieu", "chef-lieu",
        "rivière", "riviere", "fleuve", "hydrographie",
        "lualaba", "haut katanga", "haut-katanga", "kinshasa", "kongo central",
        "kasai", "tshopo", "tanganyika", "lomami", "sankuru", "ituri",
        "kolwezi", "lubumbashi", "matadi", "kananga", "mbuji mayi", "kisangani",
        "dilolo", "kapanga", "lubudi", "mutshatsha", "sandoa"
    ];

    return motsCles.some(m => t.includes(m));
}

function construireReponseBibliotheque(infoBase) {
    return `🔵 Voici ce que j’ai trouvé dans la bibliothèque.\n\n🟡 ${infoBase}\n\n🔴 Veux-tu maintenant que je te l’explique simplement comme un précepteur ?`;
}

// -------------------- WHATSAPP --------------------

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
        console.error("Erreur WhatsApp :", e.response?.data || e.message);
    }
}

// -------------------- RAPPEL MATINAL --------------------

cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query(
            "SELECT phone, nom, sexe FROM conversations WHERE nom IS NOT NULL AND nom != ''"
        );

        for (const user of res.rows) {
            const citation = citations[Math.floor(Math.random() * citations.length)];
            const salutation = user.sexe === "F" ? "ma chère élève" : "mon cher élève";

            const message = `🔵 Bonjour ${salutation} ${user.nom} !\n\n🟡 ${citation}\n\n🔴 Es-tu prêt(e) pour une nouvelle journée d'excellence pour notre grand Congo ?`;

            await envoyerWhatsApp(user.phone, message);
        }
    } catch (e) {
        console.error("Erreur Cron :", e.message);
    }
}, { timezone: "Africa/Lubumbashi" });

// -------------------- BIBLIOTHÈQUE --------------------

async function consulterBibliotheque(phrase) {
    const texteOriginal = (phrase || "").trim();
    const texte = nettoyerTexte(phrase);
    const mots = texte.split(" ").filter(m => m.length > 2);

    if (!texte) return null;

    try {
        // 1. Recherche directe province
        let geo = await pool.query(
            `
            SELECT province, chef_lieu, territoires
            FROM drc_population_villes
            WHERE LOWER(province) LIKE $1
            LIMIT 1
            `,
            [`%${texte}%`]
        );

        if (geo.rows.length > 0) {
            const row = geo.rows[0];
            return `PROVINCE : ${row.province}\nCHEF-LIEU : ${row.chef_lieu}\nTERRITOIRES : ${row.territoires}`;
        }

        // 2. Recherche par mots-clés sur province
        for (const mot of mots) {
            geo = await pool.query(
                `
                SELECT province, chef_lieu, territoires
                FROM drc_population_villes
                WHERE LOWER(province) LIKE $1
                LIMIT 1
                `,
                [`%${mot}%`]
            );

            if (geo.rows.length > 0) {
                const row = geo.rows[0];
                return `PROVINCE : ${row.province}\nCHEF-LIEU : ${row.chef_lieu}\nTERRITOIRES : ${row.territoires}`;
            }
        }

        // 3. Recherche par territoire
        let territoire = await pool.query(
            `
            SELECT province, chef_lieu, territoires
            FROM drc_population_villes
            WHERE LOWER(territoires) LIKE $1
            LIMIT 1
            `,
            [`%${texte}%`]
        );

        if (territoire.rows.length > 0) {
            const row = territoire.rows[0];
            return `PROVINCE : ${row.province}\nCHEF-LIEU : ${row.chef_lieu}\nTERRITOIRES : ${row.territoires}`;
        }

        for (const mot of mots) {
            territoire = await pool.query(
                `
                SELECT province, chef_lieu, territoires
                FROM drc_population_villes
                WHERE LOWER(territoires) LIKE $1
                LIMIT 1
                `,
                [`%${mot}%`]
            );

            if (territoire.rows.length > 0) {
                const row = territoire.rows[0];
                return `PROVINCE : ${row.province}\nCHEF-LIEU : ${row.chef_lieu}\nTERRITOIRES : ${row.territoires}`;
            }
        }

        // 4. Recherche par chef-lieu
        let chefLieu = await pool.query(
            `
            SELECT province, chef_lieu, territoires
            FROM drc_population_villes
            WHERE LOWER(chef_lieu) LIKE $1
            LIMIT 1
            `,
            [`%${texteOriginal.toLowerCase()}%`]
        );

        if (chefLieu.rows.length > 0) {
            const row = chefLieu.rows[0];
            return `PROVINCE : ${row.province}\nCHEF-LIEU : ${row.chef_lieu}\nTERRITOIRES : ${row.territoires}`;
        }

        for (const mot of mots) {
            chefLieu = await pool.query(
                `
                SELECT province, chef_lieu, territoires
                FROM drc_population_villes
                WHERE LOWER(chef_lieu) LIKE $1
                LIMIT 1
                `,
                [`%${mot}%`]
            );

            if (chefLieu.rows.length > 0) {
                const row = chefLieu.rows[0];
                return `PROVINCE : ${row.province}\nCHEF-LIEU : ${row.chef_lieu}\nTERRITOIRES : ${row.territoires}`;
            }
        }

        // 5. Hydrographie
        let hydro = await pool.query(
            `
            SELECT element, caracteristiques
            FROM drc_hydrographie
            WHERE LOWER(element) LIKE $1
            LIMIT 1
            `,
            [`%${texte}%`]
        );

        if (hydro.rows.length > 0) {
            const row = hydro.rows[0];
            return `ÉLÉMENT : ${row.element}\nCARACTÉRISTIQUES : ${row.caracteristiques}`;
        }

        for (const mot of mots) {
            hydro = await pool.query(
                `
                SELECT element, caracteristiques
                FROM drc_hydrographie
                WHERE LOWER(element) LIKE $1
                LIMIT 1
                `,
                [`%${mot}%`]
            );

            if (hydro.rows.length > 0) {
                const row = hydro.rows[0];
                return `ÉLÉMENT : ${row.element}\nCARACTÉRISTIQUES : ${row.caracteristiques}`;
            }
        }

        // 6. FAQ
        let faq = await pool.query(
            `
            SELECT question, reponse
            FROM questions_reponses
            WHERE LOWER(question) LIKE $1
            LIMIT 1
            `,
            [`%${texte}%`]
        );

        if (faq.rows.length > 0) {
            return faq.rows[0].reponse;
        }

        for (const mot of mots) {
            faq = await pool.query(
                `
                SELECT question, reponse
                FROM questions_reponses
                WHERE LOWER(question) LIKE $1
                LIMIT 1
                `,
                [`%${mot}%`]
            );

            if (faq.rows.length > 0) {
                return faq.rows[0].reponse;
            }
        }

        return null;
    } catch (e) {
        console.error("Erreur consulterBibliotheque :", e.message);
        return null;
    }
}

// -------------------- IA PÉDAGOGIQUE --------------------

async function genererReponsePedagogique({ user, text, hist, infoBase }) {
    const salutation = user?.sexe === "F" ? "ma chère élève" : "mon cher élève";

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `Tu es Mwalimu, un précepteur congolais exceptionnel, chaleureux, humain et rigoureux.

IDENTITÉ DE L'ÉLÈVE
- Nom : ${user?.nom || "élève"}
- Sexe : ${user?.sexe === "F" ? "Féminin" : "Masculin"}
- Classe : ${user?.classe || "non précisée"}
- Rêve : ${user?.reve || "non précisé"}
- Formule d'adresse : ${salutation}

MISSION
- Tu aides l'élève à comprendre.
- Tu ne réponds jamais comme un moteur de recherche.
- Tu expliques avec simplicité et bienveillance.
- Tu peux utiliser des exemples congolais du quotidien.
- Tu encourages l'élève avec naturel.

RÈGLES ABSOLUES
1. N'écris jamais : "INFO_BASE ne contient pas", "je n'ai pas de données", "la base ne fournit pas".
2. N'invente jamais une liste administrative précise.
3. Si une donnée précise n'est pas disponible, donne une explication générale honnête et utile.
4. Réponds dans un style humain, vivant, clair, avec de petits paragraphes.
5. Quand l'élève pose une question scolaire, explique la méthode avant la réponse finale si c'est utile.
6. Quand l'élève semble jeune, simplifie davantage.
7. Quand l'élève donne une réponse à un exercice, corrige avec douceur, montre la faute, puis encourage.

DONNÉE DE BIBLIOTHÈQUE
${infoBase || "Aucune donnée précise trouvée dans la bibliothèque pour cette question."}`
            },
            ...hist.slice(-6),
            { role: "user", content: text }
        ],
        temperature: 0.5,
        max_tokens: 700
    });

    return completion.choices[0]?.message?.content?.trim() || `🔵 Je suis là ${salutation}.\n\n🟡 Pose-moi encore ta question calmement.\n\n🔴 Nous allons avancer ensemble.`;
}

// -------------------- WEBHOOK --------------------

app.get("/webhook", (req, res) => {
    const verifyToken = process.env.VERIFY_TOKEN;

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === verifyToken) {
        return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
    res.sendStatus(200);

    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body.trim();

    let user = null;

    try {
        const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1 LIMIT 1", [from]);
        user = userRes.rows[0];

        if (!user) {
            await pool.query(
                "INSERT INTO conversations (phone, nom, historique, reve, sexe, classe) VALUES ($1, '', '[]', '', '', '')",
                [from]
            );

            await envoyerWhatsApp(
                from,
                "🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor dévoué.\n\n🟡 Pour bien t’accompagner, quel est ton prénom ?"
            );
            return;
        }

        let hist = [];
        if (user.historique) {
            try {
                hist = typeof user.historique === "string"
                    ? JSON.parse(user.historique)
                    : user.historique;
            } catch {
                hist = [];
            }
        }

        // 1. Récupération progressive du profil élève
        if (!user.nom || user.nom.trim() === "") {
            const nom = extraireNomUtilisateur(text);

            if (
