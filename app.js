
const express = require('express');
const axios = require('axios');
const app = express();

// Important pour lire le contenu des messages envoyés par WhatsApp
app.use(express.json());

// --- 1. NETTOYAGE AUTOMATIQUE DU TOKEN ---
// Supprime les retours à la ligne invisibles qui causent votre erreur de header
const cleanToken = (process.env.TOKEN || "").replace(/\s/g, '');

// --- 2. VALIDATION DU WEBHOOK (Étape obligatoire pour Meta) ---
// Sans cette partie, Meta refusera d'envoyer des messages à votre serveur.
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // Remplacez 'VOTRE_CODE_SECRET' par ce que vous avez mis dans Meta Developers
  // Ou utilisez une variable d'environnement : process.env.VERIFY_TOKEN
  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    console.log("✅ Webhook validé par Meta !");
    res.status(200).send(challenge);
  } else {
    console.error("❌ Échec de la validation du Webhook.");
    res.sendStatus(403);
  }
});

// --- 3. RÉCEPTION ET AFFICHAGE DES MESSAGES ---
// C'est ici que les messages reçus s'afficheront dans vos logs Render
app.post("/webhook", (req, res) => {
  console.log("📩 Nouveau message reçu de WhatsApp !");
 
  // On vérifie s'il y a bien un message dans la requête
  if (req.body.object) {
    if (req.body.entry &&
        req.body.entry[0].changes &&
        req.body.entry[0].changes[0].value.messages &&
        req.body.entry[0].changes[0].value.messages[0]) {
           
      const message = req.body.entry[0].changes[0].value.messages[0];
      const from = message.from; // Numéro de l'expéditeur
      const text = message.text ? message.text.body : "Message non textuel";

      console.log(`📱 De : ${from}`);
      console.log(`💬 Message : ${text}`);
    }
    res.sendStatus(200); // On dit à Meta qu'on a bien reçu le message
  } else {
    res.sendStatus(404);
  }
});

// --- 4. CONFIGURATION DU PORT ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Mwalimu est en ligne sur le port ${PORT}`);
  console.log("Attente de messages...");
});
