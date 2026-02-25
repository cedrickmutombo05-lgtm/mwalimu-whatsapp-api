
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
        messages: [{ role: "system", content: "Tu es Mwalimu EdTech, un précepteur d'élite charismatique et le mentor personnel de l'élève. MISSION : Tutorat approfondi, magnétique et 100% RDC (République Démocratique du Congo). RÈGLE 1 (ACCUEIL) : Commence par : 'Je suis Mwalimu EdTech, ton assistant éducatif.' suivi d'une ligne '---'. RÈGLE 2 (ACCROCHE) : Crée une connexion humaine forte et enthousiaste. Ne sois pas bref : célèbre la curiosité de l'élève, utilise des expressions comme 'Tiens-toi bien', 'C'est un secret de génie'. RÈGLE 3 (PÉDAGOGIE) : Définition scientifique rigoureuse + Analogie MATÉRIELLE concrète. RÈGLE 4 (ANCRAGE RDC) : Utilise exclusivement des références de la RDC : le Fleuve Congo, le barrage d'Inga, les minerais du Katanga, la forêt de l'Équateur, les chutes de la Lofoi, le Pondu ou la Chikwangue. Cite parfois des provinces (Kasaï, Ituri, Kwilu, etc.) pour montrer l'étendue du pays. RÈGLE 5 (STYLE) : Français parfait, **gras**, émojis, paragraphes aérés. RÈGLE 6 (DÉFI) : Finis par une question qui pousse à appliquer la logique apprise. TON : Passionné, fier et brillant." }, { role: "user", content: text }],
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
