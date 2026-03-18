
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

const obtenirSalutation = () =>
  SALUTATIONS[Math.floor(Math.random() * SALUTATIONS.length)];

const obtenirCitation = () =>
  CITATIONS[Math.floor(Math.random() * CITATIONS.length)];

function nettoyerTexte(texte = "") {
  return texte.replace(/\s+/g, " ").trim();
}

function limiterHistorique(historique = [], limite = 20) {
  return historique.slice(-limite);
}

// ----------------------
// RECHERCHE BIBLIOTHÈQUE
// ----------------------
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
        ORDER BY
          CASE WHEN nom_entite ILIKE $1 THEN 1 ELSE 2 END
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

// ----------------------
// ENVOI WHATSAPP
// ----------------------
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
    console.error(
      "Erreur d'envoi WhatsApp:",
      e.response?.data || e.message
    );
  }
}

// ----------------------
// ÉTAT PÉDAGOGIQUE
// ----------------------
function lireEtat(etat) {
  if (!etat) return {};
  if (typeof etat === "object") return etat;

  try {
    return JSON.parse(etat);
  } catch {
    return {};
  }
}

function detecterTypeMessage(texte) {
  const t = (texte || "").toLowerCase().trim();

  if (
    ["bonjour", "bonsoir", "salut", "hello", "mbote", "jambo"].includes(t)
  ) {
    return "salutation";
  }

  if (t.length <= 25) return "reponse_courte";

  return "question_ou_demande";
}

// ----------------------
// WEBHOOK POST
// ----------------------
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg?.text?.body) return;

  const from = msg.from;
  const text = nettoyerTexte(msg.text.body);

  try {
    const result = await pool.query(
      "SELECT * FROM conversations WHERE phone=$1 LIMIT 1",
      [from]
    );

    let user = result.rows[0];

    // 1) INSCRIPTION
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

🟡 Je serai ton mentor, pas ton camarade de classe.

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

    // 2) CAPTURE DU NOM
    if (!user.nom || etat.phase === "inscription_nom") {
      const prenom = text.split(" ")[0].trim();

      await pool.query(
        `
        UPDATE conversations
        SET nom=$1, etat=$2
        WHERE phone=$3
        `,
        [prenom, JSON.stringify({ phase: "pret", sujet: null, derniere_question: null }), from]
      );

      return await envoyerWhatsApp(
        from,
        `${HEADER_MWALIMU}

________________________________

🔵 Merci **${prenom}**.

🟡 C'est bien noté. Désormais, je m'adresserai à toi comme ton mentor.

🔴 Tu peux maintenant me poser une question sur :
- tes cours,
- la géographie de la RDC,
- l'histoire,
- le droit,
- ou un exercice à corriger.`
      );
    }

    const typeMessage = detecterTypeMessage(text);
    const savoirSQL = await consulterBibliotheque(text);

    const sujetActuel = etat.sujet || null;
    const derniereQuestion = etat.derniere_question || null;
    const modePedagogique = etat.mode || "explication";

    // 3) PROMPT SYSTÈME FORT
    const systemPrompt = `
Tu es Mwalimu EdTech.
Tu es un PRÉCEPTEUR humain, chaleureux, rigoureux et bienveillant.

RÈGLES ABSOLUES :
- Tu n'es JAMAIS l'élève.
- L'élève s'appelle ${user.nom}.
- Tu ne dis jamais que tu es ${user.nom}.
- Tu ne réponds jamais comme si tu étais à la place de l'élève.
- Tu es le mentor, le guide, le correcteur et l'explicateur.
- Tu aides l'élève à comprendre, sans faire le devoir totalement à sa place quand il s'agit d'un exercice.
- Si l'élève répond à une question que tu as posée juste avant, tu dois corriger sa réponse et poursuivre l'échange sur le même sujet.
- Tu gardes le fil pédagogique du sujet en cours.
- Si l'élève écrit juste une petite réponse, considère d'abord qu'il répond au sujet précédent avant de changer de sujet.
- Tu dois favoriser une vraie interaction continue.

CONTEXTE DE SÉANCE :
- Sujet actuel : ${sujetActuel || "aucun"}
- Dernière question posée par Mwalimu : ${derniereQuestion || "aucune"}
- Mode pédagogique actuel : ${modePedagogique}
- Type du nouveau message : ${typeMessage}

CONTEXTE BIBLIOTHÈQUE :
${savoirSQL || "Aucune donnée locale trouvée. Utilise seulement une explication prudente, claire et pédagogique."}

STYLE DE RÉPONSE :
- Toujours parler à ${user.nom}.
- Français simple, humain, naturel, pédagogique.
- Réponse structurée ainsi :

🔵 [VÉCU] : lien concret avec la vie de l'élève ou le contexte congolais.
🟡 [SAVOIR] : explication claire, exacte, étape par étape.
🔴 [INSPIRATION] : encouragement court.
❓ [CONSOLIDATION] : une seule question de suivi pour maintenir l'échange.

TRÈS IMPORTANT :
- Si l'élève a donné une réponse à ta dernière question, commence par dire si sa réponse est juste, partiellement juste ou à corriger.
- Ne repars pas à zéro inutilement.
- Ne fais pas semblant d'être l'élève.
- Ne dis jamais "mon prénom est ${user.nom}".
`;

    // 4) MESSAGES IA
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

    const reponseIA = nettoyerTexte(
      completion.choices?.[0]?.message?.content || "Je n'ai pas pu formuler une réponse correcte."
    );

    // 5) MISE À JOUR ÉTAT PÉDAGOGIQUE
    let nouveauSujet = sujetActuel;
    let nouveauMode = "explication";
    let nouvelleDerniereQuestion = null;

    // tentative simple de continuité
    if (typeMessage === "question_ou_demande") {
      nouveauSujet = text;
      nouveauMode = "explication";
    } else if (typeMessage === "reponse_courte" && sujetActuel) {
      nouveauSujet = sujetActuel;
      nouveauMode = "correction";
    }

    const matchQuestionFinale = reponseIA.match(/❓\s*\[CONSOLIDATION\]\s*:\s*([\s\S]*)$/i);
    if (matchQuestionFinale?.[1]) {
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

    // 6) SAUVEGARDE HISTORIQUE
    historique.push({ role: "user", content: text });
    historique.push({ role: "assistant", content: reponseIA });

    const historiqueMaj = limiterHistorique(historique, 20);

    await pool.query(
      `
      UPDATE conversations
      SET historique=$1, etat=$2
      WHERE phone=$3
      `,
      [JSON.stringify(historiqueMaj), JSON.stringify(etatMaj), from]
    );

    // 7) ENVOI FINAL
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

// ----------------------
// WEBHOOK GET
// ----------------------
app.get("/webhook", (req, res) => {
  if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

app.listen(process.env.PORT || 10000, () => {
  console.log("Mwalimu est en ligne !");
});
