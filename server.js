/* =========================================================
   FICHIER : server.js
   RÔLE : Point d'entrée principal - Mwalimu EdTech
   ========================================================= */

require("dotenv").config();
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { initDB } = require("./db");
const webhookRoutes = require("./app");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 10000;

// 1. Sécurité HTTP
app.use(helmet());

// 2. Route de santé (Health Check)
app.get("/", (req, res) => res.send("Mwalimu EdTech Server: OK"));

// 3. Journalisation (Logs des requêtes)
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// 4. Parsing JSON avec sécurité pour signature Meta
app.use(express.json({
    limit: "1mb",
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// 5. Limiteur de débit (Standardisé)
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Trop de requêtes" }
});

// 6. Routes principales
app.use("/webhook", webhookLimiter, webhookRoutes);

// 7. Gestion des routes inexistantes (404 JSON)
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Route introuvable"
    });
});

// 8. Gestion globale des erreurs (Sécurisée : Stack masqué en production)
app.use((err, req, res, next) => {
    console.error("ERREUR SERVEUR:", err.stack);
   
    const isProduction = process.env.NODE_ENV === "production";
   
    res.status(500).json({
        success: false,
        error: "Erreur interne du serveur Mwalimu",
        ...(isProduction ? {} : { debug_stack: err.stack })
    });
});

// 9. Lancement sécurisé
(async () => {
    try {
        await initDB();
        app.listen(PORT, () => {
            console.log(`✅ Serveur Mwalimu EdTech prêt sur le port ${PORT}`);
        });
    } catch (error) {
        console.error("ÉCHEC DU DÉMARRAGE:", error.message);
        process.exit(1);
    }
})();
