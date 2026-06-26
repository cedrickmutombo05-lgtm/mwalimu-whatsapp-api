

// =========================================================
// HANDLER – ORCHESTRATION DES MESSAGES
// =========================================================
// Pour l’instant, ce module est préparé.
// On ne l’utilise pas encore dans app.js.

async function traiterTexte(ctx) {
  return { handled: false, reponse: "", fiche: null, bypassFormat: false };
}

async function traiterAudio(ctx) {
  return { handled: false, reponse: "", fiche: null, bypassFormat: false };
}

async function traiterImage(ctx) {
  return { handled: false, reponse: "", fiche: null, bypassFormat: false };
}

async function processIncomingMessage(ctx) {
  return { handled: false };
}

module.exports = {
  traiterTexte,
  traiterAudio,
  traiterImage,
  processIncomingMessage
};
