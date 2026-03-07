
const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const { Pool } = require("pg");
require("dotenv").config();

const app = express().use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// CONNEXION À LA BASE DE DONNÉES RENDER
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// HEADER ITALIQUE PUR - RÈGLE D'OR : PAS D'ASTÉRISQUES AVANT/APRÈS
const HEADER = "_🔵🟡🔴 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

// LES CITATIONS DE RÉFÉRENCE (NE RIEN RETRANCHER)
const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. » — François Rabelais",
    "« Sans formation, on n'est rien du tout dans ce monde. » — Patrice Lumumba",
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
  } catch (e) { console.error("Erreur WhatsApp:", e.message); }
}

/* --- 1. RAPPEL À 07:00 PILE (LUBUMBASHI) --- */
cron.schedule("0 7 * * *", async () => {
  try {
    const res = await pool.query("SELECT phone, nom FROM conversations");
    const citation = citations[Math.floor(Math.random() * citations.length)];
    for (const user of res.rows) {
      const msg = `${HEADER}\n\n🔵 **Bonjour ${user.nom || "cher élève"} !**\n\n🟡 *"${citation}"*\n\n🔴 Réveille ton génie ! Que souhaites-tu approfondir aujourd'hui avec moi ?`;
      await sendWhatsApp(user.phone, msg);
    }
  } catch (e) { console.log("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

/* --- 2. LE CŒUR DU TUTORAT : WEBHOOK AVEC MÉMOIRE ET PÉDAGOGIE --- */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || msg.type !== "text") return;

  const from = msg.from;
  const text = msg.text.body;

  try {
    // BLOC DE MÉMORISATION : RÉCUPÉRATION DE L'ÉLÈVE
    const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
    let user = userRes.rows[0];

    // ACCUEIL INCLUSIF SI NOUVEL ÉLÈVE
    if (!user) {
      await pool.query("INSERT INTO conversations (phone, historique) VALUES ($1, $2)", [from, JSON.stringify([])]);
      const welcome = `${HEADER}\n\n🔵 **Bienvenu (e) jeune patriote !** 😊\n\n🟡 Je suis **Mwalimu EdTech**, ton précepteur personnel. Ici, nous pratiquons un tutorat approfondi.\n\n🔴 Dis-moi : comment t'appelles-tu et dans quelle classe es-tu ? Ne brûlons pas les étapes !`;
      return await sendWhatsApp(from, welcome);
    }

    // MISE À JOUR DU NOM DANS LA MÉMOIRE
    if (!user.nom && text.length < 50) {
      await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [text, from]);
      user.nom = text;
    }

    // VÉRIFICATION DE LA VÉRITÉ TERRAIN (SQL)
    let geoContext = "";
    const resGeo = await pool.query(
      "SELECT province, nom, description FROM drc_data WHERE province ILIKE $1 OR nom ILIKE $1 OR description ILIKE $1 LIMIT 3",
      [`%${text.toLowerCase()}%`]
    );
    if (resGeo.rows.length > 0) {
      geoContext = resGeo.rows.map(r => `[DONNÉE SOURCE RDC : ${r.province}, ${r.nom} : ${r.description}]`).join("\n");
    }

    // APPEL OPENAI : L'INTELLIGENCE PÉDAGOGIQUE
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
        // INJECTION DE LA MÉMOIRE DES ÉCHANGES (8 DERNIERS MESSAGES)
        ...user.historique.slice(-8),
        { role: "user", content: text }
      ]
    });

    const aiReply = response.choices[0].message.content;

    // MISE À JOUR DE LA MÉMOIRE (SAUVEGARDE DU SOUVENIR)
    const newHistory = [...user.historique, { role: "user", content: text }, { role: "assistant", content: aiReply }].slice(-10);
    await pool.query("UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2", [JSON.stringify(newHistory), from]);

    await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

  } catch (error) {
    console.error(error);
    await sendWhatsApp(from, `${HEADER}\n\n🔵 Oups ! Petit souci technique. Repose ta question, jeune patriote !`);
  }
});

app.listen(process.env.PORT || 10000);
