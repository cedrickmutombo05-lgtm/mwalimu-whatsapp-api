
const { Pool } = require("pg");
const { env } = require("../config/env");
const { logError } = require("../core/logger");

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 20
});

pool.on("error", (err) => {
  logError("postgres_idle", err);
});

module.exports = {
  pool
};
