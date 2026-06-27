
function normaliserNom(nom = "") {
  return String(nom || "").trim().replace(/\s+/g, " ");
}

function nettoyer(texte = "") {
  return String(texte || "")
    .replace(/je m'appelle|mon nom est|mon prénom est|je suis en|ma classe est|mon rêve est|je veux devenir/gi, "")
    .replace(/^devenir\s+/i, "")
    .replace(/^être\s+/i, "")
    .replace(/[.,!?;: ]+/g, " ")
    .trim();
}

function retirerAccents(texte = "") {
  return String(texte || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normaliserMessageCourt(texte = "") {
  return String(texte || "")
    .toLowerCase()
    .replace(/[.,!?;:()"'`´']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliserTexteRelationnel(texte = "") {
  let t = retirerAccents(String(texte || "").toLowerCase());

  t = t
    .replace(/[-_]/g, " ")
    .replace(/[.,!?;:()"`''´]/g, " ")
    .replace(/\bmwalimu\b/g, " ")
    .replace(/\bmon\s+cher\b/g, " ")
    .replace(/\bma\s+chere\b/g, " ")
    .replace(/\bcher\b/g, " ")
    .replace(/\bchere\b/g, " ")
    .replace(/\bs il te plait\b/g, " ")
    .replace(/\bsvp\b/g, " ")
    .replace(/\bstp\b/g, " ")
    .replace(/\beuh\b/g, " ")
    .replace(/\bah\b/g, " ")
    .replace(/\boh\b/g, " ")
    .replace(/\bhum\b/g, " ")
    .replace(/\bhein\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return t;
}

function premierPrenom(nom = "") {
  return normaliserNom(nom).split(" ")[0] || "élève";
}

module.exports = {
  normaliserNom,
  nettoyer,
  retirerAccents,
  normaliserMessageCourt,
  normaliserTexteRelationnel,
  premierPrenom
};
