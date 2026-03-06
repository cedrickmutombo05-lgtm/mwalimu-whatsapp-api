
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

// Le T de EdThec est maintenant en majuscule
const HEADER = "_🔵🟡🔴 **Je suis Mwalimu EdThec, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

let sessionHistory = {};

/* --- 1. RAPPEL DU MATIN (Ajusté à 06h00 juste) --- */
cron.schedule("0 6 * * *", async () => {
  for (const phone in sessionHistory) {
    const rappel = `${HEADER}

🔵 Bonjour 😊 
🟡 Je suis **Mwalimu**, ton professeur numérique. Prêt pour une nouvelle journée de savoir ? 
🔴 Écris-moi pour commencer notre leçon du jour !`;
    await sendWhatsApp(phone, rappel);
  }
}); // Fuseau horaire Lubumbashi supprimé

async function sendWhatsApp(to, bodyText) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, text: { body: bodyText } },
      { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
    );
  } catch (e) { console.error("Erreur WhatsApp:", e.message); }
}

/* --- 2. WEBHOOK AVEC INTERACTION NATURELLE --- */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || msg.type !== "text") return;

  const from = msg.from;
  const text = msg.text.body;

  // Accueil : Demande du nom et de la classe pour adapter le style
  if (!sessionHistory[from]) {
    sessionHistory[from] = [];
    const welcome = `${HEADER}

🔵 Bonsoir 😊 
Je suis **Mwalimu**, ton professeur numérique.

🟡 Pour que je puisse adapter mes explications à ton niveau, dis-moi : **quel est ton nom et dans quelle classe es-tu ?**

🔴 J'attends ta réponse pour commencer !`;
    return await sendWhatsApp(from, welcome);
  }

  // Recherche Géo en DB
  let geoContext = "";
  try {
    const resGeo = await pool.query("SELECT contenu FROM geographie_rdc WHERE mots_cles % $1 LIMIT 1", [text.toLowerCase()]);
    if (resGeo.rows.length > 0) geoContext = resGeo.rows[0].contenu;
  } catch (e) { console.log("Recherche DB ignorée ou vide."); }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Tu es MWALIMU EDTHEC, professeur numérique en RDC.
          RÈGLES :
          1. Adapte ton langage au niveau de l'élève (Primaire, Humanités, etc.).
          2. NE JAMAIS afficher de mots comme [Correction], [Explication], [Exemple] ou [Question].
          3. Structure chaque paragraphe UNIQUEMENT avec une boule de couleur :
          🔵 [Analyse et correction directe]
          🟡 [Exemple concret au Congo et encouragement]
          🔴 [Question de relance ou quiz]
          4. Contexte Géo : ${geoContext}`
        },
        ...sessionHistory[from].slice(-6),
        { role: "user", content: text }
      ]
    });

    const aiReply = response.choices[0].message.content;
    await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

    sessionHistory[from].push({ role: "user", content: text }, { role: "assistant", content: aiReply });

  } catch (error) {
    await sendWhatsApp(from, `${HEADER}\n\n🔵 Oups ! Ton professeur numérique a eu un petit vertige. Repose ta question !`);
  }
});

app.listen(process.env.PORT || 10000, () => console.log("Mwalimu EdThec Turbo Ready 🚀"));
