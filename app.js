
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// ✅ 1. Configuration des Variables (Noms exacts de Render)
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// On utilise 'TOKEN' car c'est le nom visible sur votre capture Render
const RAW_TOKEN = process.env.TOKEN || "";

// ✅ 2. Nettoyage du Token WhatsApp
const cleanToken = RAW_TOKEN.replace(/[\r\n\s]+/g, "");

// ✅ 3. Initialisation OpenAI
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Route de base
app.get("/", (req, res) => res.send("MWALIMU est prêt et en ligne ! 🚀"));

// ✅ 4. Validation Webhook (GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook Validé !");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// ✅ 5. Réception et Réponse (POST)
app.post("/webhook", async (req, res) => {
  // On répond immédiatement à Meta pour éviter les renvois
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];

    if (message && message.type === "text") {
      const from = message.from;
      const text = message.text.body;
      const phoneNumberId = changes.metadata.phone_number_id;

      console.log(`📩 Message reçu de ${from} : ${text}`);

      // A. Appel à l'IA Mwalimu
      const aiReply = await getAIReply(text);
      console.log(`🤖 Réponse IA : ${aiReply}`);

      // B. Envoi de la réponse sur WhatsApp
      await sendWhatsApp(phoneNumberId, from, aiReply);
      console.log("✅ Réponse envoyée avec succès !");
    }
  } catch (error) {
    console.error("❌ Erreur Mwalimu :", error.response?.data || error.message);
  }
});

// Fonction pour obtenir la réponse de l'IA
async function getAIReply(userText) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Tu es MWALIMU, un assistant éducatif expert pour les élèves de RDC. Réponds de manière simple et pédagogique." },
        { role: "user", content: userText }
      ],
    });
    return completion.choices[0].message.content;
  } catch (err) {
    return "Désolé, j'ai un petit souci technique pour réfléchir. Réessaye plus tard !";
  }
}

// Fonction pour envoyer le message via l'API Graph de Meta
async function sendWhatsApp(phoneId, to, message) {
  await axios.post(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      messaging_product: "whatsapp",
      to: to,
      type: "text",
      text: { body: message }
    },
    {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        "Content-Type": "application/json"
      }
    }
  );
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Mwalimu est en ligne sur le port ${PORT}`);
});
