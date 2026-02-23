
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// 1. Nettoyage du Token (Protection contre l'erreur de header)
const RAW_TOKEN = process.env.TOKEN || "";
const cleanToken = RAW_TOKEN.replace(/[\r\n\s]+/g, "");

// 2. Initialisation OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => res.send("Serveur MWALIMU opérationnel ✅"));

// 3. Webhook (GET & POST)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // Réponse rapide à Meta
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];

    if (message?.type === "text") {
      const from = message.from;
      const text = message.text.body;
      const phoneId = changes.metadata.phone_number_id;

      console.log(`📩 Message de ${from} : ${text}`);

      // Appel OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Tu es MWALIMU, assistant éducatif en RDC." },
          { role: "user", content: text }
        ],
      });

      const aiReply = completion.choices[0].message.content;

      // Envoi WhatsApp
      await axios.post(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        messaging_product: "whatsapp",
        to: from,
        text: { body: aiReply }
      }, {
        headers: { Authorization: `Bearer ${cleanToken}` }
      });
     
      console.log("✅ Réponse envoyée !");
    }
  } catch (err) {
    console.error("❌ Erreur détaillée :", err.response?.data || err.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));
