
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

const HEADER = "_***🔵🟡🔴 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩***_";

// Liste des citations incluant tes ajouts spécifiques
const citations = [
    "« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »",
    "« Science sans conscience n'est que ruine de l'âme. » — François Rabelais",
    "« Sans formation, on n'est rien du tout dans ce monde. » — Patrice Lumumba",
    "« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »",
    "« Ton pays compte sur ton intelligence. Réveille-toi, champion ! »"
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

/* --- 1. RAPPEL DU MATIN À 07:00 (HEURE DE LUBUMBASHI) --- */
cron.schedule("0 7 * * *", async () => {
  try {
    const res = await pool.query("SELECT phone, nom FROM conversations");
    const citation = citations[Math.floor(Math.random() * citations.length)];
   
    for (const user of res.rows) {
      const messageRappel = `${HEADER}\n\n🔵 **Debout, ${user.nom || "mon futur grand"} !** Il est 7h00.\n\n🟡 *"${citation}"*\n\n🔴 Prêt à enrichir ton esprit aujourd'hui ? Je t'attends pour une nouvelle leçon !`;
      await sendWhatsApp(user.phone, messageRappel);
    }
  } catch (e) { console.error("Erreur Cron 7h:", e.message); }
}, { timezone: "Africa/Lubumbashi" });

/* --- 2. WEBHOOK : L'INTERACTION VIVANTE, CHALEUREUSE ET FRONTALE --- */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || msg.type !== "text") return;

  const from = msg.from;
  const text = msg.text.body;

  try {
    // A. Récupération de l'élève et de sa mémoire
    const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
    let user = userRes.rows[0];

    // B. Premier contact (Si l'élève est nouveau)
    if (!user) {
      await pool.query("INSERT INTO conversations (phone, historique) VALUES ($1, $2)", [from, JSON.stringify([])]);
      const welcome = `${HEADER}\n\n🔵 **Salut à toi, jeune patriote !** Enfin te voilà.\n\n🟡 Je suis **Mwalimu EdTech**, ton précepteur personnel. On est ici pour bâtir ton avenir et celui du Congo.\n\n🔴 Dis-moi sans tarder : **comment t'appelles-tu et dans quelle classe es-tu ?**`;
      return await sendWhatsApp(from, welcome);
    }

    // C. Capture du nom (Simplifiée)
    if (!user.nom && text.length < 50) {
      await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [text, from]);
      user.nom = text;
    }

    // D. Recherche Géo dans les 184 éléments RDC (drc_data)
    let geoContext = "";
    const resGeo = await pool.query(
      "SELECT province, nom, description FROM drc_data WHERE province ILIKE $1 OR nom ILIKE $1 OR description ILIKE $1 LIMIT 2",
      [`%${text.toLowerCase()}%`]
    );
    if (resGeo.rows.length > 0) {
      geoContext = resGeo.rows.map(r => `[VÉRITÉ TERRAIN : En province de ${r.province}, ${r.nom} : ${r.description}]`).join("\n");
    }

    // E. Appel OpenAI avec personnalité de précepteur
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Tu es MWALIMU EDTECH, un vrai précepteur congolais : chaleureux, direct, frontal et exigeant.
          TON STYLE :
          1. Chaque paragraphe DOIT obligatoirement commencer par une boule de couleur dans cet ordre : 🔵 pour l'analyse, 🟡 pour l'exemple/connaissance, 🔴 pour le défi/question.
          2. Adresse-toi à l'élève (${user.nom}) avec affection mais fermeté. Il ne doit pas se sentir seul.
          3. Utilise les données réelles suivantes pour nourrir tes propos : ${geoContext}.
          4. Ton français doit être exemplaire et ton ton doit être celui d'un mentor qui transmet une science AVEC conscience.`
        },
        ...user.historique.slice(-6),
        { role: "user", content: text }
      ]
    });

    const aiReply = response.choices[0].message.content;

    // F. Sauvegarde de l'historique (Mémoire)
    const newHistory = [...user.historique, { role: "user", content: text }, { role: "assistant", content: aiReply }].slice(-10);
    await pool.query("UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2", [JSON.stringify(newHistory), from]);

    await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

  } catch (error) {
    console.error(error);
    await sendWhatsApp(from, `${HEADER}\n\n🔵 Mon ami, j'ai eu une petite fatigue technique. Repose ta question, je suis là pour toi !`);
  }
});

app.listen(process.env.PORT || 10000);
