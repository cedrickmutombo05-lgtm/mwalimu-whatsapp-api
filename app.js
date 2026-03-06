
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

// HEADER OFFICIEL SANS ASTÉRISQUES AUTOUR DES ÉMOJIS
const HEADER = "_***🔵🟡🔴 **Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩***_";

let sessionHistory = {};

/* --- 1. RAPPEL DU MATIN (06h00 juste) --- */
cron.schedule("0 6 * * *", async () => {
  for (const phone in sessionHistory) {
    const rappel = `${HEADER}\n\n🔵 Bonjour 😊\n🟡 Je suis **Mwalimu**, ton précepteur. Prêt à faire briller ton intelligence aujourd'hui ?\n🔴 Écris-moi pour commencer notre leçon !`;
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

/* --- 2. WEBHOOK AVEC TUTORAT APPROFONDI --- */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || msg.type !== "text") return;

  const from = msg.from;
  const text = msg.text.body;

  // Initialisation de la mémoire
  if (!sessionHistory[from]) {
    sessionHistory[from] = [];
    const welcome = `${HEADER}\n\n🔵 Bonjour 😊\nJe suis **Mwalimu**, ton précepteur personnel.\n\n🟡 Pour mieux t'accompagner, dis-moi : **quel est ton nom et dans quelle classe es-tu ?**\n\n🔴 J'attends ta réponse avec impatience !`;
    return await sendWhatsApp(from, welcome);
  }

  // EXTRACTION DES DONNÉES SQL (Ordre strict de ta photo)
  let drcContext = "";
  try {
    const climat = await pool.query('SELECT * FROM drc_climat_vegetation LIMIT 2');
    const eco = await pool.query('SELECT * FROM drc_economie LIMIT 2');
    const hydro = await pool.query('SELECT * FROM drc_hydrographie LIMIT 2');
    const identite = await pool.query('SELECT * FROM drc_identite_nationale LIMIT 2');
    const relief = await pool.query('SELECT * FROM drc_relief LIMIT 2');
    const population = await pool.query('SELECT * FROM drc_population_villes LIMIT 2');

    drcContext = JSON.stringify({
      climat: climat.rows,
      economie: eco.rows,
      hydrographie: hydro.rows,
      identite: identite.rows,
      relief: relief.rows,
      villes: population.rows
    });
  } catch (e) { console.log("DB Scan bypass."); }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Tu es MWALIMU EDTHEC, précepteur humain et protecteur pour les élèves de la RDC.
          TON ATTITUDE : Chaleureuse, encourageante. Dis "Je suis là pour toi".
          DIRECTIVES :
          1. Structure ton message en 3 blocs EXACTS :
             🔵 [Analyse profonde, réponse détaillée et correction si besoin]
             🟡 [Lien avec le quotidien en RDC et message d'encouragement]
             🔴 [Question Quiz A, B, C pour valider l'acquis]
          2. INTERDICTION d'écrire les mots "Savoir", "Pédagogie", "Correction", "Exemple".
          3. Utilise ces données réelles : ${drcContext}.
          4. Une SEULE conclusion à la fin : "N'hésite pas si tu as d'autres questions !"`
        },
        ...sessionHistory[from].slice(-6),
        { role: "user", content: text }
      ]
    });

    const aiReply = response.choices[0].message.content;
   
    // Envoi propre sans doublons
    await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

    sessionHistory[from].push({ role: "user", content: text }, { role: "assistant", content: aiReply });

  } catch (error) {
    await sendWhatsApp(from, `${HEADER}\n\n🔵 Oups ! J'ai eu une petite absence. Repose-moi ta question, mon cher élève !`);
  }
});

app.listen(process.env.PORT || 10000, () => console.log("Mwalimu Edthec Turbo Fix Ready 🚀"));
