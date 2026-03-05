
const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const { Pool } = require("pg");
require("dotenv").config();

const app = express().use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* --- 1. CONNEXION À LA BASE DE DONNÉES (GÉOGRAPHIE RDC) --- */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const HEADER = "_🔵🟡🔴 **Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

/* --- 2. MÉMOIRE TEMPORAIRE (INTERACTION DIRECTE) --- */
let sessionHistory = {};

/* --- 3. RAPPEL DU MATIN (05H00) --- */
cron.schedule("0 5 * * *", async () => {
  for (const phone in sessionHistory) {
    const rappel = `${HEADER}
   
🔵 Bonjour 😊 
🟡 Un petit rappel : chaque jour d'étude te rapproche de ton rêve. 
🔴 Écris-moi si tu veux réviser un cours aujourd'hui.`;
    await sendWhatsApp(phone, rappel);
  }
}, { timezone: "Africa/Lubumbashi" });

/* --- 4. FONCTION DE RECHERCHE GÉOGRAPHIQUE --- */
async function getGeoContext(text) {
  try {
    // Cherche dans ta DB si le message contient un mot-clé géo
    const res = await pool.query(
      "SELECT contenu FROM nom_de_ta_table_geo WHERE mots_cles % $1 LIMIT 1",
      [text.toLowerCase()]
    );
    return res.rows.length > 0 ? res.rows[0].contenu : "Aucune donnée géo spécifique.";
  } catch (err) {
    console.error("Erreur DB Géo:", err.message);
    return "";
  }
}

/* --- 5. ENVOI WHATSAPP --- */
async function sendWhatsApp(to, bodyText) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, text: { body: bodyText } },
      { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
    );
  } catch (e) { console.error("Erreur WhatsApp:", e.message); }
}

/* --- 6. WEBHOOK PRINCIPAL --- */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || msg.type !== "text") return;

  const from = msg.from;
  const text = msg.text.body;

  // Initialisation de la discussion
  if (!sessionHistory[from]) {
    sessionHistory[from] = [];
    const welcome = `${HEADER}

🔵 Bonsoir 😊 
Je suis **Mwalimu**, ton professeur numérique.

🟡 Je suis ici pour t'aider à comprendre tes cours, particulièrement la géographie de notre beau pays.

🔴 Sur quoi veux-tu que nous travaillions ensemble maintenant ?`;
    return await sendWhatsApp(from, welcome);
  }

  // Récupération du contexte géo dans ta DATABASE_URL
  const geoContext = await getGeoContext(text);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `Tu es MWALIMU, professeur numérique en RDC.
          CONSIGNES :
          - Utilise ce contexte géo si pertinent : ${geoContext}
          - Méthode socratique : corrige l'élève, encourage-le et pose une question de suite logique.
          - Structure chaque paragraphe avec les couleurs :
          🔵 [Correction/Explication]
          🟡 [Exemple/Encouragement]
          🔴 [Question/Quiz]
          - Utilise LaTeX pour les formules : $$v = d/t$$`
        },
        ...sessionHistory[from].slice(-6),
        { role: "user", content: text }
      ]
    });

    const reply = completion.choices[0].message.content;
    await sendWhatsApp(from, `${HEADER}\n\n${reply}`);

    // Sauvegarde de la suite logique
    sessionHistory[from].push({ role: "user", content: text }, { role: "assistant", content: reply });

  } catch (error) {
    sendWhatsApp(from, `${HEADER}\n\n🔵 Oups, j'ai eu un petit vertige technique. Repose ta question !`);
  }
});

/* --- 7. LANCEMENT --- */
app.listen(process.env.PORT || 10000, () => {
  console.log("Mwalimu Turbo Géo est opérationnel sur Render !");
});
