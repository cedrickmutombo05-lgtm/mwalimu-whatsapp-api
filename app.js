
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// Nettoyage du Token pour supprimer les sauts de ligne de Render
const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => res.send("MWALIMU est prêt ! ✅"));

// Validation Webhook (Obligatoire pour Meta)
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

// Réception des messages
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];

    if (message?.type === "text") {
      const userPhone = message.from; // Numéro de l'utilisateur (ex: 243...)
      const text = message.text.body;
     
      // RÉGLAGE DE L'ERREUR 100 : On prend l'ID du numéro qui a reçu le message
      const phoneId = changes.metadata.phone_number_id;

      console.log(`📩 Message de ${userPhone} : ${text}`);

      // 1. Intelligence Artificielle
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Tu es MWALIMU, un assistant éducatif pour les élèves en RDC." },
          { role: "user", content: text }
        ],
      });

      const aiReply = completion.choices[0].message.content;

      // 2. Envoi de la réponse à userPhone
      await axios({
        method: 'POST',
        url: `https://graph.facebook.com/v18.0/${phoneId}/messages`,
        data: {
          messaging_product: "whatsapp",
          to: userPhone,
          text: { body: aiReply }
        },
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json'
        }
      });
     
      console.log(`✅ Réponse envoyée à ${userPhone} via ID ${phoneId}`);
    }
  } catch (err) {
    console.error("❌ ERREUR META :");
    // Affiche le détail pour comprendre si le Token est expiré
    console.error(err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Serveur actif sur le port ${PORT}`));
