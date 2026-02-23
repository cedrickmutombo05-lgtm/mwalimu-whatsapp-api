
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

// 1. Nettoyage du Token (Protection totale)
const RAW_TOKEN = process.env.TOKEN || "";
const cleanToken = RAW_TOKEN.replace(/[\r\n\s]+/g, "").trim();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => res.send("MWALIMU est opérationnel ✅"));

// 2. Webhook Validation
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// 3. Réception et Réponse Automatique
app.post("/webhook", async (req, res) => {
  res.sendStatus(200); // On libère Meta immédiatement

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];

    if (message?.type === "text") {
      const from = message.from;
      const text = message.text.body;
      const phoneId = changes.metadata.phone_number_id;

      console.log(`📩 Reçu : ${text}`);

      // Appel OpenAI
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Tu es MWALIMU, un assistant éducatif pour les élèves en RDC. Réponds de manière courte et pédagogique." },
          { role: "user", content: text }
        ],
      });

      const aiReply = completion.choices[0].message.content;

      // ENVOI WHATSAPP AVEC VÉRIFICATION
      await axios({
        method: 'POST',
        url: `https://graph.facebook.com/v21.0/${phoneId}/messages`,
        data: {
          messaging_product: "whatsapp",
          to: from,
          type: "text",
          text: { body: aiReply }
        },
        headers: {
          'Authorization': `Bearer ${cleanToken}`,
          'Content-Type': 'application/json'
        }
      });
     
      console.log("✅ Réponse envoyée avec succès !");
    }
  } catch (err) {
    // Cela va nous dire exactement pourquoi on a l'erreur 400
    console.error("❌ ERREUR META :");
    if (err.response) {
      console.error("Détails :", JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.message);
    }
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Serveur prêt sur le port ${PORT}`));
