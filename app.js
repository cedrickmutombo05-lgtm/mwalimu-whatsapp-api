
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');

const app = express();
app.use(express.json());

const cleanToken = (process.env.TOKEN || "").replace(/[\r\n\s]+/g, "").trim();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.get("/", (req, res) => res.send("Diagnostic MWALIMU actif ✅"));

app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  // 1. LOG COMPLET : On affiche TOUT ce que Meta envoie
  console.log("-----------------------------------------");
  console.log("📩 OBJET REÇU DE META :", JSON.stringify(req.body, null, 2));
  console.log("-----------------------------------------");

  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    const message = changes?.messages?.[0];

    if (message?.type === "text") {
      const userPhone = message.from;
      const text = message.text.body;
     
      // On extrait l'ID du numéro de téléphone fourni par Meta
      const phoneIdFromMeta = changes.metadata.phone_number_id;

      console.log(`👤 Utilisateur : ${userPhone}`);
      console.log(`🆔 ID Téléphone détecté : ${phoneIdFromMeta}`);

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: "Tu es Mwalimu EdTech, un précepteur d'élite et le mentor de l'élève. MISSION : Tutorat approfondi, chaleureux et 100% Congolais. RÈGLE 1 (ACCUEIL) : Commence par : 'Je suis Mwalimu EdTech, ton assistant éducatif.' suivi d'une ligne '---'. RÈGLE 2 (INTRODUCTION) : Avant de répondre, adresse une phrase d'encouragement chaleureuse et personnalisée à l'élève (ex: 'C'est une excellente question', 'Ravi de t'aider sur ce point', 'Tu vas voir, c'est passionnant'). RÈGLE 3 (PÉDAGOGIE) : 1. Définition scientifique rigoureuse. 2. Analogie MATÉRIELLE (pas de poésie). 3. EXEMPLE DU VÉCU CONGOLAIS (climat, fleuve, vie à Kinshasa/Goma/Lubumbashi, etc.). RÈGLE 4 (EXCELLENCE) : Français parfait, zéro faute d'accord. RÈGLE 5 (STYLE) : Paragraphes courts, **gras**, émojis, tutoiement. RÈGLE 6 (CLÔTURE) : Reste disponible et pose une question ouverte. TON : Humain, expert et motivant." }, { role: "user", content: text }],
      });

      const aiReply = completion.choices[0].message.content;

      // On tente de répondre en utilisant l'ID reçu
      await axios({
        method: 'POST',
        url: `https://graph.facebook.com/v18.0/${phoneIdFromMeta}/messages`,
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
     
      console.log("✅ Réponse envoyée !");
    }
  } catch (err) {
    console.error("❌ ERREUR :");
    console.error(err.response ? JSON.stringify(err.response.data, null, 2) : err.message);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Serveur en écoute sur le port ${PORT}`));
