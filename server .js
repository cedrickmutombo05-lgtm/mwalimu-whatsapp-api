/* =========================================================
   FICHIER : server.js
   RÔLE : Point d'entrée principal du serveur Mwalimu EdTech
   ========================================================= */

require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");

// Importation des futurs modules (Points de connexion)
const { initDB } = require("./config/db");
const webhookRoutes = require("./routes/webhook");

const app = express();
app.set("trust proxy", 1);

// Configuration du port
const PORT = process.env.PORT || 10000;

// Middlewares de base (Garde-fous)
app.use(express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// Limiteur de débit pour le Webhook
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests"
});

// Utilisation des routes modulaires
app.use("/webhook", webhookLimiter, webhookRoutes);

/* =========================================================
   DÉMARRAGE DU SERVEUR ET DE LA DB
   ========================================================= */
(async () => {
    try {
        await initDB();
        app.listen(PORT, () => {
            console.log(`✅ Mwalimu en marche sur le port ${PORT}`);
        });
    } catch (error) {
        console.error("Erreur fatale au démarrage :", error.message);
        process.exit(1);
    }
})();
