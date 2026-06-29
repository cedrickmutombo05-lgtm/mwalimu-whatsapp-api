

const {
  premierPrenom
} = require("../core");

const db = require("../db");

function normaliserCommande(texte = "") {
  return String(texte || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[.,!?;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function detecterCommandeSimple(texte = "") {
  const t = normaliserCommande(texte);

  if (!t) return null;

  if (["/start", "start", "demarrer", "demarer", "commencer"].includes(t)) {
    return { type: "start" };
  }

  if (["/help", "help", "aide", "menu"].includes(t)) {
    return { type: "aide" };
  }

  if (["/profil", "profil", "mon profil"].includes(t)) {
    return { type: "profil" };
  }

  if (
    [
      "/reset",
      "reset",
      "reinitialiser",
      "reinitialise",
      "recommencer",
      "nouveau depart"
    ].includes(t)
  ) {
    return { type: "reset" };
  }

  if (
    [
      "/matieres",
      "matieres",
      "matiere",
      "matières",
      "matière",
      "liste des matieres",
      "liste des matières"
    ].includes(t)
  ) {
    return { type: "matieres" };
  }

  return null;
}

async function tenterResetProfil(user = {}) {
  const phone =
    user?.phone ||
    user?.telephone ||
    user?.numero ||
    user?.whatsapp ||
    user?.wa_id ||
    "";

  if (!phone) return false;

  const fonctionsPossibles = [
    "resetUserProfile",
    "resetUserProfil",
    "resetUtilisateur",
    "deleteUserProfile",
    "deleteUser",
    "supprimerProfilUtilisateur"
  ];

  for (const nomFonction of fonctionsPossibles) {
    const fn = db?.[nomFonction];

    if (typeof fn !== "function") continue;

    try {
      await fn(phone);
      return true;
    } catch (_) {
      // On essaie une autre fonction disponible.
    }
  }

  return false;
}

function construireProfil(user = {}) {
  const nom = user?.nom || "non encore indiqué";
  const classe = user?.classe || "non encore indiquée";
  const reve = user?.reve || user?.objectif || "";

  let message = `Voici ton profil actuel 😊

Nom : **${nom}**
Classe : **${classe}**`;

  if (reve) {
    message += `\nRêve / objectif : **${reve}**`;
  }

  return message;
}

function construireListeMatieres(user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom && prenom !== "élève" ? `**${prenom}**` : "toi";

  return `Très bien ${appel} 😊

Voici quelques matières que tu peux travailler avec Mwalimu :

1. français
2. mathématiques
3. géographie
4. histoire
5. sciences
6. biologie
7. microbiologie
8. civisme
9. étude du milieu
10. droit

Tu peux écrire par exemple :
**Je voudrais revoir le français**`;
}

async function traiterCommande(user = {}, texte = "") {
  const commande = detecterCommandeSimple(texte);

  if (!commande) return null;

  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom && prenom !== "élève" ? `**${prenom}**` : "toi";

  if (commande.type === "start") {
    return {
      handled: true,
      reponse: `Bonjour ${appel} 😊 Je suis Mwalimu EdTech, ton mentor pour apprendre avec méthode.

Tu peux me dire ce que tu veux travailler aujourd'hui.`,
      fiche: null,
      bypassFormat: true
    };
  }

  if (commande.type === "aide") {
    return {
      handled: true,
      reponse: `Voici ce que tu peux faire avec Mwalimu 😊

1. Poser une question de cours
2. Demander une explication
3. Revoir une matière
4. Faire un exercice
5. Corriger une réponse
6. Demander ton profil

Exemple :
**Je voudrais revoir le français**`,
      fiche: null,
      bypassFormat: true
    };
  }

  if (commande.type === "profil") {
    return {
      handled: true,
      reponse: construireProfil(user),
      fiche: null,
      bypassFormat: true
    };
  }

  if (commande.type === "matieres") {
    return {
      handled: true,
      reponse: construireListeMatieres(user),
      fiche: null,
      bypassFormat: true
    };
  }

  if (commande.type === "reset") {
    await tenterResetProfil(user);

    return {
      handled: true,
      reponse: `D'accord 😊 On reprend depuis le début.

Quel est ton prénom ?`,
      fiche: null,
      bypassFormat: true
    };
  }

  return null;
}

module.exports = {
  normaliserCommande,
  detecterCommandeSimple,
  traiterCommande
};
