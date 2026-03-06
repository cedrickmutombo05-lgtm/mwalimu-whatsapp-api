
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

// Respect de la casse "Edthec" et suppression des astérisques autour des émojis
const HEADER = "_***🔵🟡🔴 **Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩***_";

let sessionHistory = {};

/* --- 1. RAPPEL DU MATIN (06h00 juste) --- */
cron.schedule("0 6 * * *", async () => {
  for (const phone in sessionHistory) {
    const rappel = `${HEADER}

🔵 Bonjour 😊 
🟡 Je suis **Mwalimu**, ton professeur numérique. Prêt pour une nouvelle journée de savoir ? 
🔴 Écris-moi pour commencer notre leçon du jour !`;
    await sendWhatsApp(phone, rappel);
  }
});

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

  // Accueil : Demande du nom et de la classe
  if (!sessionHistory[from]) {
    sessionHistory[from] = [];
    const welcome = `${HEADER}

🔵 Bonsoir 😊 
Je suis **Mwalimu**, ton professeur numérique.

🟡 Pour que je puisse adapter mes explications à ton niveau, dis-moi : **quel est ton nom et dans quelle classe es-tu ?**

🔴 J'attends ta réponse pour commencer !`;
    return await sendWhatsApp(from, welcome);
  }

  // RECHERCHE DANS TES TABLES RÉELLES (L'ordre de ta photo Render)
  let drcContext = "";
  try {
    const climat = await pool.query('SELECT * FROM drc_climat_vegetation LIMIT 1');
    const eco = await pool.query('SELECT * FROM drc_economie LIMIT 1');
    const hydro = await pool.query('SELECT * FROM drc_hydrographie LIMIT 1');
    const identite = await pool.query('SELECT * FROM drc_identite_nationale LIMIT 1');
    const parcs = await pool.query('SELECT * FROM drc_parcs_nationaux LIMIT 1');
    const relief = await pool.query('SELECT * FROM drc_relief LIMIT 1');

    drcContext = JSON.stringify({
      climat: climat.rows,
      economie: eco.rows,
      hydrographie: hydro.rows,
      identite: identite.rows,
      nature: parcs.rows,
      sol: relief.rows
    });
  } catch (e) { console.log("Recherche DB Tables ignorée."); }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Tu es MWALIMU EDTHEC, précepteur expert en RDC.
          TON ATTITUDE : Humaine, chaleureuse, protectrice. Dis souvent "Je suis là pour toi".
          RÈGLES :
          1. Adapte ton langage au niveau de l'élève.
          2. NE JAMAIS afficher [Correction], [Explication], [Exemple] ou [Question].
          3. Structure chaque paragraphe UNIQUEMENT avec :
          🔵 [Analyse profonde et correction douce]
          🟡 [Exemple concret tiré de la RDC et encouragement]
          🔴 [Quiz de relance A, B, C]
          4. INTERDICTION d'utiliser les mots "Savoir" ou "Pédagogie".
          5. CONTEXTE RDC (Tes tables) : ${drcContext}`
        },
        ...sessionHistory[from].slice(-6),
        { role: "user", content: text }
      ]
    });

    const aiReply = response.choices[0].message.content;
    const finalReply = `${HEADER}\n\n${aiReply}\n\nJe suis là pour toi, n'hésite pas si tu as d'autres questions !`;
   
    await sendWhatsApp(from, finalReply);

    sessionHistory[from].push({ role: "user", content: text }, { role: "assistant", content: aiReply });

  } catch (error) {
    await sendWhatsApp(from, `${HEADER}\n\n🔵 Oups ! Ton professeur numérique a eu un petit vertige. Repose ta question !`);
  }
});

app.listen(process.env.PORT || 10000, () => console.log("Mwalimu Edthec Turbo Ready 🚀"));
