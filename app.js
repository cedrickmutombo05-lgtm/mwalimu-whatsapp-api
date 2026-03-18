
require("dotenv").config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const HEADER_MWALIMU =
  "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

const CITATIONS = [
  "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
  "***« L'excellence n'est pas une action, c'est une habitude. » - Aristote***",
  "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
  "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***"
];

const SALUTATIONS = ["Mbote", "Jambo", "Moyo", "Ebwe"];

function obtenirSalutation() {
  return SALUTATIONS[Math.floor(Math.random() * SALUTATIONS.length)];
}

function obtenirCitation() {
  return CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
}

function nettoyerTexte(texte = "") {
  return texte.replace(/\s+/g, " ").trim();
}

function extrairePrenom(texte = "") {
  const t = texte.trim();

  const patterns = [
    /mon prénom est\s+([a-zà-ÿ'-]+)/i,
    /mon prenom est\s+([a-zà-ÿ'-]+)/i,
    /je m'appelle\s+([a-zà-ÿ'-]+)/i,
    /moi c'est\s+([a-zà-ÿ'-]+)/i,
    /^([a-zà-ÿ'-]+)$/i
  ];

  for (const p of patterns) {
    const match = t.match(p);
    if (match && match[1]) {
      const prenom = match[1].trim();
      return prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase();
    }
  }

  const premierMot = t.split(/\s+/)[0] || "Élève";
  return premierMot.charAt(0).toUpperCase() + premierMot.slice(1).toLowerCase();
}

function nettoyerReponseIA(texte = "") {
  let t = texte.trim();

  t = t.replace(/🔴🟡🔵 \*\*Je suis Mwalimu EdTech[\s\S]*?________________________________/gi, "");
  t = t.replace(/Je reste disponible pour toute question éventuelle\s*!?/gi, "");
  t = t.replace(/\*\*\*«[^»]+»\*\*\*/g, "");
  t = t.replace(/_{2,}/g, "");
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

function limiterHistorique(historique = [], limite = 16) {
  return historique.slice(-limite);
}

function detecterTypeMessage(texte = "") {
  const t = texte.toLowerCase().trim();

  if (["bonjour", "bonsoir", "salut", "hello", "mbote", "jambo", "moyo"].includes(t)) {
    return "salutation";
  }

  if (t.length <= 30) {
    return "reponse_courte";
  }

  return "question_ou_demande";
}

function lireEtat(etat) {
  if (!etat) return {};
  if (typeof etat === "object") return etat;

  try {
    return JSON.parse(etat);
  } catch {
    return {};
  }
}

async function consulterBibliotheque(question) {
  if (!question) return null;

  try {
    const clean = question.toLowerCase().trim();
    const mots = clean.split(/\s+/).filter((m) => m.length > 3);
    const recherches = [...new Set([clean, ...mots.reverse()])];

    for (const mot of recherches) {
      const terme = `%${mot}%`;

      const res = await pool.query(
        `
        SELECT nom_entite, description_tuteur
        FROM entites_administratives
        WHERE nom_entite ILIKE $1
           OR description_tuteur ILIKE $1
        ORDER BY CASE WHEN nom_entite ILIKE $1 THEN 1 ELSE 2 END
        LIMIT 1
        `,
        [terme]
      );

      if (res.rows.length > 0) {
        return res.rows[0].description_tuteur || null;
      }
    }

    return null;
  } catch (e) {
    console.error("Erreur SQL consulterBibliotheque:", e.message);
    return null;
  }
}

async function envoyerWhatsApp(to, texte) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body: texte }
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
  } catch (e) {
    console.error("Erreur d'envoi WhatsApp:", e.response?.data || e.message);
  }
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg?.text?.body) return;

  const from = msg.from;
  const text = nettoyerTexte(msg.text.body);

  try {
    const result = await pool.query(
      "SELECT * FROM conversations WHERE phone = $1 LIMIT 1",
      [from]
    );

    let user = result.rows[0];

    // 1. INSCRIPTION
    if (!user) {
      await pool.query(
        `
        INSERT INTO conversations (phone, nom, historique, etat)
        VALUES ($1, $2, $3, $4)
        `,
        [from, "", "[]", JSON.stringify({ phase: "inscription_nom" })]
      );

      return await envoyerWhatsApp(
        from,
        `${HEADER_MWALIMU}

________________________________

🔵 Mbote ! Je suis Mwalimu EdTech.

🟡 Je suis ton mentor, pas ton camarade de classe.

❓ Quel est ton **prénom** ?`
      );
    }

    let historique = [];
    try {
      historique = Array.isArray(user.historique)
        ? user.historique
        : JSON.parse(user.historique || "[]");
    } catch {
      historique = [];
    }

    let etat = lireEtat(user.etat);

    // 2. ENREGISTREMENT DU PRÉNOM
    if (!user.nom || etat.phase === "inscription_nom") {
      const prenom = extrairePrenom(text);

      await pool.query(
        `
        UPDATE conversations
        SET nom = $1, etat = $2
        WHERE phone = $3
        `,
        [
          prenom,
          JSON.stringify({
            phase: "pret",
            sujet: null,
            mode: "attente_question",
            derniere_question: null
          }),
          from
        ]
      );

      return await envoyerWhatsApp(
        from,
        `${HEADER_MWALIMU}

________________________________

🔵 Merci **${prenom}** ! C'est bien enregistré.

🟡 Tu peux maintenant me poser une question sur tes cours, la RDC, l'histoire, la géographie ou le droit.

🔴 Je resterai ton mentor tout au long de l'échange.`
      );
    }

    const typeMessage = detecterTypeMessage(text);
    const savoirSQL = await consulterBibliotheque(text);

    const sujetActuel = etat.sujet || null;
    const derniereQuestion = etat.derniere_question || null;
    const modePedagogique = etat.mode || "explication";

    const systemPrompt = `
Tu es Mwalimu EdTech, un mentor pédagogique congolais, humain, chaleureux et rigoureux.

RÈGLES ABSOLUES :
- Tu n'es jamais l'élève.
- L'élève s'appelle ${user.nom}.
- Tu ne dis jamais : "Mon prénom est ${user.nom}".
- Tu ne recopies jamais le header "Je suis Mwalimu EdTech".
- Tu ne recopies jamais les citations finales.
- Tu ne recopies jamais la ligne de séparation.
- Tu réponds seulement avec le contenu pédagogique.
- Tu maintiens une continuité de conversation.
- Si l'élève répond brièvement, considère d'abord qu'il répond à la dernière question en cours.
- Si l'élève répond à une question précédente, tu corriges ou valides sa réponse avant d'avancer.
- Tu ne fais pas le devoir entièrement à la place de l'élève quand il s'agit d'un exercice.
- Tu expliques la méthode, puis tu invites l'élève à répondre.

CONTEXTE DE LA SÉANCE :
- Élève : ${user.nom}
- Sujet actuel : ${sujetActuel || "aucun"}
- Dernière question posée : ${derniereQuestion || "aucune"}
- Mode pédagogique : ${modePedagogique}
- Type du nouveau message : ${typeMessage}

CONTEXTE BIBLIOTHÈQUE :
${savoirSQL || "Aucune donnée locale trouvée. Utilise une réponse claire, prudente et pédagogique."}

FORMAT OBLIGATOIRE :
🔵 [VÉCU] : court contexte concret.
🟡 [SAVOIR] : explication claire, exacte, pédagogique.
🔴 [INSPIRATION] : encouragement bref.
❓ [CONSOLIDATION] : une seule question de suivi.
`;

    const messagesIA = [
      { role: "system", content: systemPrompt },
      ...limiterHistorique(historique, 14),
      { role: "user", content: text }
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messagesIA,
      temperature: 0.2,
      max_tokens: 700
    });

    const reponseIABrute = completion.choices?.[0]?.message?.content || "";
    const reponseIA = nettoyerReponseIA(reponseIABrute);

    // 3. MISE À JOUR DE L'ÉTAT
    let nouveauSujet = sujetActuel;
    let nouveauMode = "explication";
    let nouvelleDerniereQuestion = null;

    if (typeMessage === "question_ou_demande") {
      nouveauSujet = text;
      nouveauMode = "explication";
    } else if (typeMessage === "reponse_courte" && sujetActuel) {
      nouveauSujet = sujetActuel;
      nouveauMode = "correction";
    }

    const matchQuestionFinale = reponseIA.match(/❓\s*\[CONSOLIDATION\]\s*:\s*([\s\S]*)$/i);
    if (matchQuestionFinale && matchQuestionFinale[1]) {
      nouvelleDerniereQuestion = nettoyerTexte(matchQuestionFinale[1]);
      nouveauMode = "attente_reponse";
    }

    const etatMaj = {
      phase: "pret",
      sujet: nouveauSujet,
      mode: nouveauMode,
      derniere_question: nouvelleDerniereQuestion,
      updated_at: new Date().toISOString()
    };

    // 4. SAUVEGARDE HISTORIQUE
    historique.push({ role: "user", content: text });
    historique.push({ role: "assistant", content: reponseIA });

    const historiqueMaj = limiterHistorique(historique, 20);

    await pool.query(
      `
      UPDATE conversations
      SET historique = $1, etat = $2
      WHERE phone = $3
      `,
      [JSON.stringify(historiqueMaj), JSON.stringify(etatMaj), from]
    );

    // 5. ENVOI FINAL
    const salutation = `${obtenirSalutation()} **${user.nom}** !`;

    const messageFinal = `${HEADER_MWALIMU}

________________________________

${salutation}

${reponseIA}

${obtenirCitation()}`;

    await envoyerWhatsApp(from, messageFinal);
  } catch (e) {
    console.error("Erreur générale:", e);
    await envoyerWhatsApp(
      from,
      `${HEADER_MWALIMU}

________________________________

🔵 Désolé, j'ai une petite fatigue technique.

🟡 Repose ta question dans un instant.`
    );
  }
});

app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

app.listen(process.env.PORT || 10000, () => {
  console.log("Mwalimu est en ligne !");
});
