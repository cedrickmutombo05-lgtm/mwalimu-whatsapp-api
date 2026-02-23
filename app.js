
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

// 1. ON RÉCUPÈRE ET ON NETTOIE LE TOKEN ICI
// Cela enlève automatiquement les sauts de ligne vus sur Render
const rawToken = process.env.TOKEN || "";
const cleanToken = rawToken.replace(/\s/g, '');

// 2. ON CONFIGURE LES HEADERS GLOBAUX
const headers = {
  'Authorization': `Bearer ${cleanToken}`,
  'Content-Type': 'application/json'
};

// 3. EXEMPLE DE ROUTE D'ENVOI DE MESSAGE
app.post('/send-message', async (req, res) => {
    try {
        const response = await axios.post('https://graph.facebook.com/v17.0/VOTRE_PHONE_ID/messages', {
            messaging_product: 'whatsapp',
            to: req.body.to,
            type: 'text',
            text: { body: 'Bonjour depuis Mwalimu !' }
        }, { headers: headers }); // On utilise les headers nettoyés ici

        res.status(200).send('Message envoyé !');
    } catch (error) {
        console.error('Erreur Mwalimu:', error.message);
        res.status(500).send('Erreur lors de l\'envoi');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Mwalimu est prêt !`);
    console.log(`==> Your service is live 🚀`);
});
