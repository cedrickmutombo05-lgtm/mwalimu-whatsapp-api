
const { HEADER_MWALIMU } = require("../constants/messages");
const { premierPrenom } = require("../core");

const {
  updateUserField,
  resetAllStudentAttempts
} = require("../db");

const {
  detecterCommandeSimple
} = require("./intentions");

async function traiterCommande(user = {}, texte = "") {
  const commande = detecterCommandeSimple(texte);
  const prenom = premierPrenom(user?.nom || "");

  if (!commande) {
    return {
      handled: false,
      reponse: ""
    };
  }

  if (commande === "aide") {
    return {
      handled: true,
      reponse: `${HEADER_MWALIMU}
────────────────
Bonjour **${prenom}** 😊

Tu peux m'envoyer :
- une question de cours ;
- un exercice ;
- une image d'un devoir ;
- un audio ;
- une demande d'explication.

Exemples :
"Explique-moi les fractions"
"Corrige ma réponse"
"Quels sont les territoires du Haut-Katanga ?"`
    };
  }

  if (commande === "profil") {
    return {
      handled: true,
      reponse: `${HEADER_MWALIMU}
────────────────
👤 Ton profil Mwalimu :

Nom : **${user?.nom || "Non renseigné"}**
Classe : **${user?.classe || "Non renseignée"}**
Rêve : **${user?.reve || "Non renseigné"}**

Tu peux modifier ton profil en écrivant par exemple :
"Je m'appelle Cédric"
"Je suis en 6e primaire"
"Je veux devenir avocat"`
    };
  }

  if (commande === "reset") {
    await resetAllStudentAttempts(user.phone);

    return {
      handled: true,
      reponse: `C'est fait **${prenom}** ✅ Nous repartons proprement. Envoie-moi maintenant ta question ou ton exercice.`
    };
  }

  if (commande === "stop") {
    await updateUserField(user.phone, "reminders_enabled", false);

    return {
      handled: true,
      reponse: `D'accord **${prenom}**. Les rappels sont désactivés ✅ Tu peux toujours m'écrire quand tu veux apprendre.`
    };
  }

  if (commande === "start") {
    await updateUserField(user.phone, "reminders_enabled", true);

    return {
      handled: true,
      reponse: `Très bien **${prenom}** ✅ Les rappels sont réactivés. Nous pouvons continuer à apprendre ensemble.`
    };
  }

  return {
    handled: false,
    reponse: ""
  };
}

module.exports = {
  traiterCommande
};
