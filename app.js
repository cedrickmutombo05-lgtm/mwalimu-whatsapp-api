
const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const { Pool } = require("pg");
require("dotenv").config();

const app = express().use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 1. CONNEXION À LA BASE DE DONNÉES RENDER
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const HEADER = "_***🔵🟡🔴 **Je suis Mwalimu Edthec, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩***_";

// Fonction d'envoi WhatsApp
async function sendWhatsApp(to, bodyText) {
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to, text: { body: bodyText } },
      { headers: { Authorization: `Bearer ${process.env.TOKEN}` } }
    );
  } catch (e) { console.error("Erreur WhatsApp:", e.message); }
}

/* --- 2. RAPPEL DU MATIN (Récupération des élèves en DB) --- */
cron.schedule("0 5 * * *", async () => {
  try {
    const res = await pool.query("SELECT phone, nom FROM conversations");
    for (const user of res.rows) {
      const rappel = `${HEADER}\n\n🔵 Bonjour ${user.nom || ""} 😊\n🟡 Prêt pour une nouvelle journée de savoir sur notre beau pays ?\n🔴 Pose-moi une question pour commencer !`;
      await sendWhatsApp(user.phone, rappel);
    }
  } catch (e) { console.error("Erreur Cron:", e.message); }
}, { timezone: "Africa/Lubumbashi" });

/* --- 3. WEBHOOK AVEC MÉMOIRE DURABLE ET CONTEXTE RDC --- */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg || msg.type !== "text") return;

  const from = msg.from;
  const text = msg.text.body;

  try {
    // A. Récupération de l'élève et de son historique
    const userRes = await pool.query("SELECT * FROM conversations WHERE phone = $1", [from]);
    let user = userRes.rows[0];

    // B. Premier contact : Création du profil
    if (!user) {
      await pool.query("INSERT INTO conversations (phone, historique) VALUES ($1, $2)", [from, JSON.stringify([])]);
      const welcome = `${HEADER}\n\n🔵 Bienvenue ! 😊\nJe suis **Mwalimu**, ton mentor numérique.\n\n🟡 Pour mieux t'aider, dis-moi : **quel est ton nom et dans quelle classe es-tu ?**\n\n🔴 Je m'en souviendrai pour toujours !`;
      return await sendWhatsApp(from, welcome);
    }

    // C. Enregistrement automatique du nom (si non défini)
    if (!user.nom && text.length < 50) {
      await pool.query("UPDATE conversations SET nom = $1 WHERE phone = $2", [text, from]);
      user.nom = text;
    }

    // D. Recherche dans tes 184 éléments RDC (drc_data)
    let geoContext = "";
    const resGeo = await pool.query(
      "SELECT province, nom, description FROM drc_data WHERE province ILIKE $1 OR nom ILIKE $1 OR description ILIKE $1 LIMIT 2",
      [`%${text.toLowerCase()}%`]
    );
    if (resGeo.rows.length > 0) {
      geoContext = resGeo.rows.map(r => `[INFO RDC : ${r.province}, ${r.nom} : ${r.description}]`).join("\n");
    }

    // E. Appel OpenAI avec Historique (Mémoire des messages)
    const systemPrompt = `Tu es MWALIMU EDTHEC. Élève: ${user.nom || "Inconnu"}. Classe: ${user.classe || "Non précisée"}.
    CONTEXTE RDC DISPONIBLE : ${geoContext}
    RÈGLES :
    1. Utilise les boules 🔵🟡🔴 exclusivement.
    2. Pas de mots comme [Correction] ou [Explication].
    3. Adapte ton niveau à l'élève.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...user.historique.slice(-6), // On injecte les 6 derniers messages pour la mémoire
        { role: "user", content: text }
      ]
    });

    const aiReply = response.choices[0].message.content;

    // F. Sauvegarde de la nouvelle interaction en DB
    const newHistory = [...user.historique, { role: "user", content: text }, { role: "assistant", content: aiReply }].slice(-10);
    await pool.query("UPDATE conversations SET historique = $1, updated_at = NOW() WHERE phone = $2", [JSON.stringify(newHistory), from]);

    // G. Envoi de la réponse finale
    await sendWhatsApp(from, `${HEADER}\n\n${aiReply}`);

  } catch (error) {
    console.error("Erreur Webhook:", error);
    await sendWhatsApp(from, `${HEADER}\n\n🔵 Oups, Cédric ! Une petite erreur technique. Réessaie !`);
  }
});

app.listen(process.env.PORT || 10000, () => console.log("🚀 Mwalimu EdTech : Mémoire et Données RDC Activées !"));
