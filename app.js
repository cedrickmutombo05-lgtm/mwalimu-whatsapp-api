
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 1. TA CONFIGURATION
const apiKey = "TON_API_KEY_GEMINI_ICI";
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

// 2. LA FONCTION QUI PARLE À L'IA
async function askGemini(question) {
    try {
        const response = await axios.post(url, {
            contents: [{ parts: [{ text: question }] }]
        });
        return response.data.candidates[0].content.parts[0].text;
    } catch (error) {
        console.error("Erreur Gemini:", error.message);
        return "Désolé, j'ai un petit bug de cerveau...";
    }
}

// 3. LA ROUTE POUR RECEVOIR LES MESSAGES (WEBHOOK)
app.post('/webhook', async (req, res) => {
    // On récupère le message qui vient de WhatsApp
    const userMsg = req.body.message || "Bonjour";
   
    console.log("Message reçu :", userMsg);

    // On demande la réponse à l'IA
    const aiReply = await askGemini(userMsg);

    // On répond au serveur WhatsApp
    res.status(200).json({
        reply: aiReply
    });
});

// 4. LANCEMENT DU SERVEUR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Mwalimu est prêt sur le port ${PORT}`);
});
