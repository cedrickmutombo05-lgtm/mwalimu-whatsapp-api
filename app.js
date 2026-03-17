
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const HEADER_MWALIMU =
  "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

const citations = [
  "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
  "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
  "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
  "***« L'excellence n'est pas une action, c'est une habitude. »***",
  "***« Aimer son pays, c'est aussi contribuer à sa force : payer son impôt, c'est bâtir nos propres écoles. »***",
  "***« Le patriotisme n'est pas un sentiment, c'est un acte de bâtisseur. »***",
  "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
  "***« Ne demande pas ce que ton pays peut faire pour toi, mais ce que tu peux faire pour le Congo. »***",
];

// ------------------------
// OUTILS
// ------------------------
function nettoyerTexte(texte = "") {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extraireMotsCles(question = "") {
  const motsVides = [
    "quel", "quelle", "quels", "quelles",
    "est", "sont", "la", "le", "les", "de", "du", "des",
    "dans", "sur", "pour", "avec", "au", "aux", "en",
    "donne", "moi", "parle", "dis", "explique",
    "territoire", "territoires", "province", "provinces",
    "ville", "villes", "chef", "lieu", "capitale",
    "commune", "communes", "secteur", "secteurs",
    "groupement", "groupements", "qui", "quoi", "ou"
  ];

  return nettoyerTexte(question)
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((mot) => mot.length > 2 && !motsVides.includes(mot));
}

// ------------------------
// VÉRIFICATION DB
// ------------------------
async function verifierBase() {
  try {
    await pool.query("SELECT NOW()");
    console.log("✅ Connexion PostgreSQL OK");
  } catch (e) {
    console.error("❌ Erreur connexion PostgreSQL :", e.message);
  }
}

// ------------------------
// RAPPEL DU MATIN
// ------------------------
cron.schedule(
  "0 7 * * *",
  async () => {
    try {
      const { rows: eleves } = await pool.query(
        "SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''"
      );

      for (const eleve of eleves) {
        const cit = citations[Math.floor(Math.random() * citations.length)];
        const message = `${HEADER_MWALIMU}

________________________________

☀️ Bonjour **${eleve.nom}** !

C'est l'heure de te lever pour bâtir ton avenir et celui du Grand Congo.

${cit}`;

        await envoyerWhatsApp(eleve.phone, message);
      }
    } catch (e) {
      console.error("Erreur Cron :", e.message);
    }
  },
  { scheduled: true, timezone: "Africa/Lubumbashi" }
);

// ------------------------
// RECHERCHE BIBLIOTHÈQUE
// ------------------------
async function consulterBibliotheque(question) {
  if (!question || !question.trim()) return null;

  const motsCles = extraireMotsCles(question);
  const recherche = motsCles.join(" ");
  const rechercheBrute = nettoyerTexte(question);

  console.log("🔎 Question brute :", question);
  console.log("🔎 Mots-clés :", motsCles);

  try {
    // 1. Recherche directe sur nom_entite
    let res = await pool.query(
      `
      SELECT *
      FROM entites_administratives
      WHERE unaccent(lower(nom_entite)) ILIKE unaccent(lower($1))
      LIMIT 1
      `,
      [`%${recherche}%`]
    );

    if (res.rows.length > 0) {
      console.log("✅ Trouvé par nom_entite");
      return res.rows[0];
    }

    // 2. Recherche dans description_tuteur
    res = await pool.query(
      `
      SELECT *
      FROM entites_administratives
      WHERE unaccent(lower(description_tuteur)) ILIKE unaccent(lower($1))
      LIMIT 1
      `,
      [`%${recherche}%`]
    );

    if (res.rows.length > 0) {
      console.log("✅ Trouvé par description_tuteur");
      return res.rows[0];
    }

    // 3. Recherche mot par mot sur nom_entite
    for (const mot of motsCles) {
      res = await pool.query(
        `
        SELECT *
        FROM entites_administratives
        WHERE unaccent(lower(nom_entite)) ILIKE unaccent(lower($1))
        LIMIT 1
        `,
        [`%${mot}%`]
      );

      if (res.rows.length > 0) {
        console.log(`✅ Trouvé avec mot-clé : ${mot}`);
        return res.rows[0];
      }
    }

    // 4. Recherche mot par mot dans description_tuteur
    for (const mot of motsCles) {
      res = await pool.query(
        `
        SELECT *
        FROM entites_administratives
        WHERE unaccent(lower(description_tuteur)) ILIKE unaccent(lower($1))
        LIMIT 1
        `,
        [`%${mot}%`]
      );

      if (res.rows.length > 0) {
        console.log(`✅ Trouvé dans description avec mot-clé : ${mot}`);
        return res.rows[0];
      }
    }

    // 5. Secours simple si l'élève écrit juste le nom exact
    res = await pool.query(
      `
      SELECT *
      FROM entites_administratives
      WHERE unaccent(lower(nom_entite)) ILIKE unaccent(lower($1))
      LIMIT 1
      `,
      [`%${rechercheBrute}%`]
    );

    if (res.rows.length > 0) {
      console.log("✅ Trouvé par recherche brute");
      return res.rows[0];
    }

    console.log("❌ Aucune donnée trouvée");
    return null;
  } catch (e) {
    console.error("❌ Erreur consulterBibliotheque :", e.message);
    return null;
  }
}

// ------------------------
// ENVOI WHATSAPP
// ------------------------
async function envoyerWhatsApp(to, texte) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body: texte },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (e) {
    console.error(
      "❌ Erreur WA :",
      e.response?.data || e.message
    );
  }
}

// ------------------------
// WEBHOOK META
// ------------------------
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg?.text?.body) return;

  const from = msg.from;
  const text = msg.text.body.trim();

  try {
    let { rows } = await pool.query(
      "SELECT * FROM conversations WHERE phone = $1 LIMIT 1",
      [from]
    );

    let user = rows[0];

    // Si l'utilisateur n'existe pas, on le crée
    if (!user) {
      const insertRes = await pool.query(
        `
        INSERT INTO conversations (phone, nom, reve)
        VALUES ($1, $2, $3)
        RETURNING *
        `,
        [from, "Mon élève", "réussir à l'école"]
      );

      user = insertRes.rows[0];
      console.log("✅ Nouvel utilisateur créé :", from);
    }

    const info = await consulterBibliotheque(text);
    console.log("📚 Résultat SQL :", info);

    const citAleatoire = citations[Math.floor(Math.random() * citations.length)];

    const systemPrompt = `
Tu es Mwalimu EdTech, mentor pédagogique congolais, humain, chaleureux, bienveillant et très clair.

ÉLÈVE :
- Nom : ${user.nom || "Mon élève"}
- Rêve : ${user.reve || "réussir à l'école"}

DONNÉES SQL (VÉRITÉ ABSOLUE) :
${info ? JSON.stringify(info, null, 2) : "Aucune donnée trouvée dans la base."}

RÈGLES OBLIGATOIRES :
1. Si les DONNÉES SQL existent, tu dois répondre UNIQUEMENT à partir de ces données.
2. Tu n'as pas le droit d'inventer un territoire, une ville, une province ou une explication absente.
3. Si la base ne contient rien, tu dis clairement :
   "Je n'ai pas encore trouvé cette information exacte dans ma bibliothèque."
4. Ton style doit rester pédagogique, simple, humain et congolais.
5. Réponse courte à moyenne, propre et bien aérée.

FORMAT À RESPECTER :

Mbote ${user.nom || "mon élève"} !

🔵 [VÉCU]
Une petite introduction humaine.

🟡 [SAVOIR]
Les faits exacts, sans invention.

🔴 [INSPIRATION]
Un encouragement en lien avec son rêve.

❓ [CONSOLIDATION]
Une petite question de révision.

Ne mets pas d'informations non présentes dans les DONNÉES SQL.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const reponseAI =
      completion.choices?.[0]?.message?.content ||
      "Je n'ai pas pu formuler la réponse pour le moment.";

    const messageFinal = `${HEADER_MWALIMU}

________________________________

${reponseAI}

${citAleatoire}`;

    await envoyerWhatsApp(from, messageFinal);
  } catch (e) {
    console.error("❌ Erreur webhook :", e.message);
  }
});

// ------------------------
// WEBHOOK VERIFY META
// ------------------------
app.get("/webhook", (req, res) => {
  const verify_token = process.env.VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === verify_token) {
    console.log("✅ Webhook vérifié");
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ------------------------
// START
// ------------------------
const PORT = process.env.PORT || 10000;

app.listen(PORT, async () => {
  console.log(`🚀 Mwalimu opérationnel sur le port ${PORT}`);
  await verifierBase();
});
