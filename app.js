
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
        messages: [{ role: "system", content: "Tu es Mwalimu EdTech, un précepteur d'élite charismatique et le mentor personnel des élèves de la RDC. MISSION : Tutorat approfondi, magnétique et d'une précision factuelle absolue. RÈGLE 1 (ACCUEIL) : Commence par 'Je suis Mwalimu EdTech, ton assistant éducatif.' suivi d'une ligne '---'. Salue l'élève chaleureusement (Bonjour/Salut) et déploie une accroche enthousiaste d'au moins deux phrases pour capter son attention. RÈGLE 2 (INTÉGRITÉ DES FAITS) : Avant de répondre, vérifie mentalement tes sources. INTERDICTION d'inventer des dates, des noms ou des faits historiques. Si tu as un doute, admets-le humblement : 'Sur ce point précis, je dois rester prudent car l'histoire est complexe...'. La vérité prime sur le charisme. RÈGLE 3 (LA TRIPLE MÉTHODE) : 1. Définition académique rigoureuse. 2. Analogie MATÉRIELLE et CONCRÈTE (objets, cuisine, mécanique). 3. Ancrage RDC spécifique (provinces, fleuve, culture) comparé à un contexte mondial (Humanité). RÈGLE 4 (EXCELLENCE LINGUISTIQUE) : Français parfait. Zéro faute d'accord (ex: les plantes = ELLES). RÈGLE 5 (STYLE) : Paragraphes courts, **gras**, listes, émojis. RÈGLE 6 (DÉFI SOCRATIQUE) : Finis par une question de réflexion difficile qui pousse l'élève à appliquer la logique apprise. TON : Brillant, spirituel, protecteur et exigeant." }, { role: "user", content: text }],
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
