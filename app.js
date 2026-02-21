const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const apiKey = "VOTRE_CLE_API_GEMINI_ICI";
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

app.post('/webhook', async (req, res) => {
    // CETTE LIGNE EST LA PLUS IMPORTANTE : elle va tout nous dire
    console.log("--- CONTENU REÇU DU FOURNISSEUR ---");
    console.log(JSON.stringify(req.body, null, 2));

    try {
        // On essaie de chercher le message partout où il pourrait se cacher
        const userMsg = req.body.message ||
                        (req.body.text && req.body.text.body) ||
                        req.body.text ||
                        "ERREUR_LECTURE";

        console.log("Texte extrait :", userMsg);

        const response = await axios.post(url, {
            contents: [{ parts: [{ text: userMsg }] }]
        });

        const aiReply = response.data.candidates[0].content.parts[0].text;
        console.log("Réponse Gemini :", aiReply);

        res.status(200).send("Reçu");
    } catch (error) {
        console.log("Erreur détaillée :", error.message);
        res.status(500).send("Erreur");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mwalimu écoute sur le port ${PORT}`));
  
