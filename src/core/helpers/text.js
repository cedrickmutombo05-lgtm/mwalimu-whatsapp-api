

const { pick } = require("./general");

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

  t = t
    .replace(/^mercii+$/i, "merci")
    .replace(/^mersi$/i, "merci")
    .replace(/^mercie$/i, "merci")
    .replace(/^okai$/i, "okay")
    .replace(/^okey$/i, "okay")
    .replace(/^okayy+$/i, "okay")
    .replace(/^o k$/i, "ok")
    .replace(/^dac$/i, "d accord")
    .replace(/^dacc$/i, "d accord")
    .replace(/^ca vas$/i, "ca va")
    .replace(/^sa va$/i, "ca va")
    .replace(/^cc$/i, "cc")
    .trim();

  return t;
}

function normaliserTexteMemoire(texte = "") {
  return String(texte || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function premierPrenom(nom = "") {
  return normaliserNom(nom).split(" ")[0] || "élève";
}

function genreEleve(nom = "") {
  const prenom = String(nom || "").trim().split(" ")[0].toLowerCase();

  const prenomsFeminins = [
    "dora", "marie", "anne", "anna", "annie", "anuarite", "ruth", "grace",
    "esther", "sarah", "sara", "debora", "fatou", "chantal", "nadine",
    "joyce", "mireille", "patience", "rebecca", "prisca", "gloria",
    "divine", "naomie", "noella", "blandine", "huguette"
  ];

  if (prenomsFeminins.includes(prenom)) return "ma chère";
  return "mon cher";
}

function construireAppelNaturel(user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  return pick([prenom, `**${prenom}**`]);
}

function construireAppel(user = {}) {
  return construireAppelNaturel(user);
}

function adapterTexteGenre(texte = "", nom = "") {
  const appel = construireAppel({ nom });

  return String(texte || "")
    .replace(/ma chère\s+\*\*[^*]+\*\*/gi, appel)
    .replace(/mon cher\s+\*\*[^*]+\*\*/gi, appel)
    .replace(/ma chère\s+[^,\n]+/gi, appel)
    .replace(/mon cher\s+[^,\n]+/gi, appel)
    .replace(/mon élève/gi, appel)
    .replace(/cher élève/gi, appel);
}

function nettoyerAppelsRepetitifs(texte = "", nom = "") {
  let t = adapterTexteGenre(texte, nom);
  t = t.replace(/(ma chère|mon cher)\s+\*\*[^\*]+\*\*/gi, construireAppel({ nom }));
  return t;
}

function supprimerFormulesLourdesDAppel(texte = "", user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  let t = String(texte || "");

  t = t.replace(/\bAh,\s*\*\*[^*]+\*\*,?\s*/gi, "");
  t = t.replace(/\bAh,\s*[^,\n]+,?\s*/gi, "");
  t = t.replace(/\bc'est une excellente question qui nous emmène dans un tout autre domaine, celui de l'histoire\s*!?/gi, "");
  t = t.replace(/\bfuture avocate\b/gi, "");
  t = t.replace(/\bfutur avocat\b/gi, "");
  t = t.replace(/\bmon cher\b/gi, prenom);
  t = t.replace(/\bma chère\b/gi, prenom);
  t = t.replace(/\bcher élève\b/gi, prenom);
  t = t.replace(/\bmon élève\b/gi, prenom);

  return t.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = {
  normaliserNom,
  nettoyer,
  retirerAccents,
  normaliserMessageCourt,
  normaliserTexteRelationnel,
  normaliserTexteMemoire,
  premierPrenom,
  genreEleve,
  construireAppelNaturel,
  construireAppel,
  adapterTexteGenre,
  nettoyerAppelsRepetitifs,
  supprimerFormulesLourdesDAppel
};
