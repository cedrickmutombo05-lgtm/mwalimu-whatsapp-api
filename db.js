/* =========================================================
   FICHIER : config/db.js
   RÔLE : Gestion haute-disponibilité PostgreSQL - Mwalimu EdTech
   ========================================================= */

const { Pool } = require("pg");

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 20,
    ssl: { rejectUnauthorized: false }
});

pool.on("error", (err) => {
    console.error("❌ Erreur inattendue PostgreSQL (Idle Client) :", err.message);
});

/**
* Initialise la connexion et vérifie la santé de la DB
*/
const initDB = async () => {
    try {
        const client = await pool.connect();
        const res = await client.query("SELECT NOW()");
        console.log(`🐘 DB connectée [${res.rows[0].now.toISOString()}]`);
        client.release();
    } catch (err) {
        console.error("❌ Échec de connexion initiale DB :", err.message);
        throw err;
    }
};

/**
* Gestion de la fermeture propre (Version sécurisée par Cédric)
*/
process.on('SIGTERM', async () => {
    try {
        console.log("⚠️ Fermeture du pool PostgreSQL...");
        await pool.end();
        console.log("🐘 Pool fermé, serveur prêt à s'éteindre.");
    } catch (err) {
        console.error("❌ Erreur lors de la fermeture du pool :", err.message);
    }
});

// Wrappers pour l'usage dans le projet
const query = (text, params) => pool.query(text, params);
const getClient = () => pool.connect();

module.exports = {
    query,
    initDB,
    getClient,
    pool
};
