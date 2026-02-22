app.post('/webhook', async (req, res) => {
    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;
        const message = value?.messages?.[0];

        if (message && message.text) {
            const userText = message.text.body;
            const userPhone = message.from;

            console.log(`📩 Message de l'élève : ${userText}`);

            // APPEL GEMINI AVEC PLUS DE LOGS
            try {
                const geminiRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                    contents: [{ parts: [{ text: userText }] }]
                });
               
                const aiReply = geminiRes.data.candidates[0].content.parts[0].text;

                // ENVOI WHATSAPP
                await axios.post(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
                    messaging_product: "whatsapp",
                    to: userPhone,
                    type: "text",
                    text: { body: aiReply }
                }, {
                    headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}` }
                });
                console.log("🚀 Succès : Mwalimu a répondu !");

            } catch (apiErr) {
                // Ici on affiche le détail du "400"
                console.error("❌ Détail de l'erreur API :", apiErr.response?.data || apiErr.message);
            }
        }
        res.status(200).send("OK");
    } catch (error) {
        console.error("❌ Erreur système :", error.message);
        res.status(500).send("ERR");
    }
});
