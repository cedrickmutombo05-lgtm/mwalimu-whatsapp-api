
require("dotenv").config();

function requireEnv(name) {
  const value = process.env[name];

  if (!value || !String(value).trim()) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }

  return value;
}

const env = {
  PORT: process.env.PORT || 10000,
  GEMINI_API_KEY: requireEnv("GEMINI_API_KEY"),
  DATABASE_URL: requireEnv("DATABASE_URL"),
  TOKEN: requireEnv("TOKEN"),
  PHONE_NUMBER_ID: requireEnv("PHONE_NUMBER_ID"),
  VERIFY_TOKEN: requireEnv("VERIFY_TOKEN"),
  APP_SECRET: requireEnv("APP_SECRET")
};

module.exports = {
  env,
  requireEnv
};
