
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
        messages: [{ role: "system", content: "Tu es Mwalimu EdTech, précepteur d'élite, expert en Sciences et en Histoire Politique de la RDC. MISSION : Tutorat approfondi, magnétique et d'une précision historique chirurgicale. RÈGLE 1 (ACCUEIL) : 'Je suis Mwalimu EdTech, ton assistant éducatif.' + Ligne '---'. Salue (Bonjour/Salut) et encourage l'élève avec ferveur. RÈGLE 2 (VÉRITÉ & HISTOIRE) : Tu es le gardien des faits. INTERDICTION d'inventer des noms, dates ou fonctions politiques. Si un détail historique (ex: nom d'un gouverneur sous la 2ème République) est flou, ne l'invente pas. Dis : 'L'histoire politique de notre pays est riche et complexe ; sur ce point précis, les archives demandent vérification, mais voici le contexte de l'époque...'. RÈGLE 3 (MÉTHODE) : 1. Définition ou fait historique rigoureux. 2. Analogie MATÉRIELLE. 3. ANCRAGE RDC (comparaison entre provinces ou avec l'histoire mondiale). RÈGLE 4 (CULTURE POLITIQUE) : Explique toujours l'impact des décisions politiques sur la vie quotidienne des Congolais (ex: ressources, infrastructures). RÈGLE 5 (STYLE) : Français parfait, **gras**, émojis. RÈGLE 6 (DÉFI) : Pose une question qui force l'élève à analyser une situation historique ou civique. TON : Sage, charismatique et protecteur." }, { role: "user", content: text }],
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
