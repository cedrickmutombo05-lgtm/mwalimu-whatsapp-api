

const {
  nettoyer,
  normaliserNom,
  normaliserTexteRelationnel,
  normaliserTexteMemoire,
  premierPrenom
} = require("../core");

const {
  updateUserField
} = require("../db");

const {
  estMessagePurementSocial,
  estChoixMatiere,
  detecterMatiereChoisie,
  construireReponseChoixMatiere
} = require("./social");

function nettoyerClasse(classe = "") {
  return normaliserNom(classe)
    .replace(/[.!?]+$/g, "")
    .replace(/\s+et\s+(je\s+)?(veux|voudrais|aimerais|souhaite|choisis|prends|vais|peux)\b[\s\S]*$/i, "")
    .replace(/\s+(je\s+)?veux\s+(etudier|étudier|apprendre|revoir|travailler)\b[\s\S]*$/i, "")
    .trim();
}

function estNomSimpleValide(texte = "") {
  const brut = String(texte || "").trim();

  if (!/^[a-zA-ZÀ-ÿ'-]{2,30}(\s+[a-zA-ZÀ-ÿ'-]{2,30})?$/.test(brut)) {
    return false;
  }

  const t = normaliserTexteMemoire(brut);

  const interdits = [
    "bonjour", "bonsoir", "salut", "merci", "ok", "okay", "oui", "non",
    "fatigue", "fatiguee", "triste", "content", "contente",
    "huitieme", "septieme", "sixieme", "cinquieme", "quatrieme",
    "troisieme", "deuxieme", "premiere", "terminale",
    "geographie", "biologie", "civisme", "histoire", "francais",
    "math", "maths", "mathematiques", "droit", "science", "sciences"
  ];

  return !interdits.includes(t);
}

function extraireNomDepuisMessage(texte = "") {
  const brut = String(texte || "").trim();

  const patterns = [
    /je m['’]?appelle\s+(.+)/i,
    /mon nom est\s+(.+)/i,
    /mon prénom est\s+(.+)/i,
    /mon prenom est\s+(.+)/i,
    /moi c['’]?est\s+(.+)/i
  ];

  for (const pattern of patterns) {
    const match = brut.match(pattern);

    if (match?.[1]) {
      const nom = normaliserNom(match[1]).replace(/[.!?]+$/g, "");
      return estNomSimpleValide(nom) ? nom : "";
    }
  }

  if (estNomSimpleValide(brut)) {
    return normaliserNom(brut).replace(/[.!?]+$/g, "");
  }

  return "";
}

function extraireClasseDepuisMessage(texte = "") {
  const brut = String(texte || "").trim();

  const patterns = [
    /je suis en\s+(.+)/i,
    /je suis\s+en\s+classe\s+de\s+(.+)/i,
    /ma classe est\s+(.+)/i,
    /je fais\s+(.+)/i,
    /classe\s*[:=]\s*(.+)/i
  ];

  for (const pattern of patterns) {
    const match = brut.match(pattern);

    if (match?.[1]) {
      const classe = nettoyerClasse(match[1]);

      if (classe && classe.length >= 2 && classe.length <= 80) {
        return classe;
      }
    }
  }

  const direct = brut.match(/\b(1ère|1ere|1e|2e|3e|4e|5e|6e|7e|8e|huitième|huitieme|septième|septieme|sixième|sixieme|cinquième|cinquieme|quatrième|quatrieme|troisième|troisieme|deuxième|deuxieme|première|premiere|terminale|primaire|secondaire|humanités|humanites)\b/i);

  if (direct?.[0]) {
    return normaliserNom(direct[0]);
  }

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
  const choixMatiere = detecterMatiereChoisie(texte);

  if (estChoixMatiere(texte) && user?.nom && user?.classe) {
    return {
      handled: false,
      user,
      reponse: ""
    };
  }

  if (estMessagePurementSocial(texte)) {
    return {
      handled: false,
      user,
      reponse: ""
    };
  }

  if (!user?.nom) {
    const nom = extraireNomDepuisMessage(texte);

    if (nom && nom.length >= 2 && nom.length <= 80) {
      await updateUserField(user.phone, "nom", nom);

      return {
        handled: true,
        user: { ...user, nom },
        reponse: `Enchanté **${premierPrenom(nom)}** 😊 Maintenant, dis-moi ta classe pour que je t'aide selon ton niveau.`
      };
    }

    return {
      handled: false,
      user,
      reponse: ""
    };
  }

  if (!String(user?.classe || "").trim()) {
    const classe = extraireClasseDepuisMessage(texte);

    if (classe && classe.length >= 2 && classe.length <= 80) {
      await updateUserField(user.phone, "classe", classe);

      const userMisAJour = { ...user, classe };

      if (choixMatiere) {
        return {
          handled: true,
          user: userMisAJour,
          reponse: `Très bien **${premierPrenom(user.nom || "élève")}** 😊 J'ai noté ta classe : **${classe}**.

${construireReponseChoixMatiere(userMisAJour, texte)}`
        };
      }

      return {
        handled: true,
        user: userMisAJour,
        reponse: `Très bien **${premierPrenom(user.nom || "élève")}** 😊 J'ai noté ta classe : **${classe}**.

Quelle matière veux-tu travailler maintenant ?`
      };
    }

    return {
      handled: false,
      user,
      reponse: ""
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
  nettoyerClasse,
  extraireNomDepuisMessage,
  extraireClasseDepuisMessage,
  extraireReveDepuisMessage,
  detecterCommandeSimple,
  traiterIntentionsProfil
};
