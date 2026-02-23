
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// Nettoyage strict du Token pour éviter les erreurs de headers
const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => res.send("MWALIMU est prêt ! ✅"));

// Validation Webhook
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// Réception et Réponse
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];

    if (message?.type === "text") {
      const from = message.from;
      const text = message.text.body;
     
      // SOLUTION : On récupère l'ID exact du numéro de téléphone qui a reçu le message
      const phoneId = changes.metadata.phone_number_id;

      console.log(`📩 Reçu : ${text}`);

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: "Tu es MWALIMU, assistant éducatif en RDC." }, { role: "user", content: text }],
      });

      const aiReply = completion.choices[0].message.content;

      // Envoi avec l'ID dynamique pour corriger l'erreur 100
      await axios({
        method: 'POST',
        url: `https://graph.facebook.com/v18.0/${phoneId}/messages`,
        data: {
          messaging_product: "whatsapp",
          to: from,
          text: { body: aiReply }
        },
        headers: { Authorization: `Bearer ${cleanToken}` }
      });
     
      console.log("✅ Réponse envoyée !");
    }
  } catch (err) {
    console.error("❌ ERREUR META :");
    console.error(err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Serveur sur le port ${PORT}`));
