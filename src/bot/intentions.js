
const {
  nettoyer,
  normaliserNom,
  normaliserTexteRelationnel,
  premierPrenom
} = require("../core");

const {
  updateUserField
} = require("../db");

function extraireNomDepuisMessage(texte = "") {
  const brut = String(texte || "").trim();

  const patterns = [
    /je m['’]?appelle\s+(.+)/i,
    /mon nom est\s+(.+)/i,
    /mon prénom est\s+(.+)/i,
    /moi c['’]?est\s+(.+)/i,
    /je suis\s+([a-zA-ZÀ-ÿ\s'-]{2,60})$/i
  ];

  for (const pattern of patterns) {
    const match = brut.match(pattern);
    if (match?.[1]) {
      return normaliserNom(match[1]).replace(/[.!?]+$/g, "");
    }
  }

  return "";
}

function extraireClasseDepuisMessage(texte = "") {
  const brut = String(texte || "").trim();

  const patterns = [
    /je suis en\s+(.+)/i,
    /ma classe est\s+(.+)/i,
    /je fais\s+(.+)/i,
    /classe\s*[:=]\s*(.+)/i
  ];

  for (const pattern of patterns) {
    const match = brut.match(pattern);
    if (match?.[1]) {
      return normaliserNom(match[1]).replace(/[.!?]+$/g, "");
    }
  }

  const direct = brut.match(/\b([1-6](ère|ere|e|ème|eme)?\s*(primaire|secondaire|humanités|humanites)|7e|8e)\b/i);
  if (direct?.[0]) return normaliserNom(direct[0]);

  return "";
}

function extraireReveDepuisMessage(texte = "") {
  const brut = String(texte || "").trim();

  const patterns = [
    /mon rêve est de\s+(.+)/i,
    /mon reve est de\s+(.+)/i,
    /je rêve de devenir\s+(.+)/i,
    /je reve de devenir\s+(.+)/i,
    /je veux devenir\s+(.+)/i,
    /j'aimerais devenir\s+(.+)/i,
    /je voudrais devenir\s+(.+)/i
  ];

  for (const pattern of patterns) {
    const match = brut.match(pattern);
    if (match?.[1]) {
      return nettoyer(match[1]).replace(/[.!?]+$/g, "");
    }
  }

  return "";
}

function detecterCommandeSimple(texte = "") {
  const t = normaliserTexteRelationnel(texte);

  if (["aide", "help", "menu"].includes(t)) return "aide";
  if (["profil", "mon profil"].includes(t)) return "profil";
  if (["reset", "reinitialiser", "réinitialiser", "recommencer"].includes(t)) return "reset";
  if (["stop", "pause", "arreter", "arrêter"].includes(t)) return "stop";
  if (["start", "reprendre", "continuer"].includes(t)) return "start";

  return "";
}

async function traiterIntentionsProfil(user = {}, texte = "") {
  const nom = extraireNomDepuisMessage(texte);
  if (nom && nom.length >= 2 && nom.length <= 80) {
    await updateUserField(user.phone, "nom", nom);

    return {
      handled: true,
      user: { ...user, nom },
      reponse: `Enchanté **${premierPrenom(nom)}** 😊 Maintenant, dis-moi ta classe pour que je t'aide selon ton niveau.`
    };
  }

  const classe = extraireClasseDepuisMessage(texte);
  if (classe && classe.length >= 2 && classe.length <= 80) {
    await updateUserField(user.phone, "classe", classe);

    return {
      handled: true,
      user: { ...user, classe },
      reponse: `Très bien **${premierPrenom(user.nom || "élève")}**. J'ai noté ta classe : **${classe}**. Tu peux maintenant m'envoyer une question ou un exercice.`
    };
  }

  const reve = extraireReveDepuisMessage(texte);
  if (reve && reve.length >= 2 && reve.length <= 120) {
    await updateUserField(user.phone, "reve", reve);

    return {
      handled: true,
      user: { ...user, reve },
      reponse: `C'est un beau rêve : **${reve}** ✨ Je vais t'aider à apprendre avec sérieux pour avancer vers cet objectif.`
    };
  }

  return {
    handled: false,
    user,
    reponse: ""
  };
}

module.exports = {
  extraireNomDepuisMessage,
  extraireClasseDepuisMessage,
  extraireReveDepuisMessage,
  detecterCommandeSimple,
  traiterIntentionsProfil
};
