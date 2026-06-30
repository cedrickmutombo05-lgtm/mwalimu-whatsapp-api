
// src/bot/onboarding.js

const {
  getUser,
  createUser,
  updateUserField,
  resetAllStudentAttempts
} = require("../db");

const {
  envoyerWhatsApp
} = require("../services/whatsapp");

function normaliserTexte(texte = "") {
  return String(texte || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nettoyerNom(texte = "") {
  let t = String(texte || "").trim();

  t = t
    .replace(/^(mon\s+prenom\s+est|mon\s+prénom\s+est|mon\s+nom\s+est|je\s+m'appelle|je\s+me\s+nomme|moi\s+c'est|moi\s+cest|je\s+suis)\s+/i, "")
    .replace(/[.,!?;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!t) return "";

  const motsInterdits = [
    "classe",
    "annee",
    "année",
    "humanite",
    "humanité",
    "secondaire",
    "primaire",
    "je veux devenir",
    "devenir"
  ];

  const n = normaliserTexte(t);
  if (motsInterdits.some((m) => n.includes(m))) return "";

  return t
    .split(" ")
    .filter(Boolean)
    .map((mot) => mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase())
    .join(" ");
}

function nettoyerClasse(texte = "") {
  let t = String(texte || "").trim();

  t = t
    .replace(/^(je\s+suis\s+en|je\s+fais|ma\s+classe\s+est|classe)\s+/i, "")
    .replace(/\b5\s*ème\b/gi, "5e")
    .replace(/\b5\s*eme\b/gi, "5e")
    .replace(/\b6\s*ème\b/gi, "6e")
    .replace(/\b6\s*eme\b/gi, "6e")
    .replace(/\b1\s*ère\b/gi, "1ère")
    .replace(/\b1\s*ere\b/gi, "1ère")
    .replace(/\bhumanite\b/gi, "humanités")
    .replace(/\bhumanité\b/gi, "humanités")
    .replace(/\spedagogique\b/gi, " pédagogique")
    .replace(/[.,!?;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const n = normaliserTexte(t);

  const indicesClasse = [
    "primaire",
    "secondaire",
    "humanite",
    "humanites",
    "annee",
    "classe",
    "pedagogique",
    "commerciale",
    "scientifique",
    "litteraire",
    "mecanique",
    "electricite",
    "biochimie",
    "college",
    "lycee"
  ];

  const contientNiveau =
    /\b[1-9]\s*(e|ere|eme|ème|ère)?\b/.test(n) ||
    indicesClasse.some((mot) => n.includes(mot));

  if (!contientNiveau) return "";

  return t;
}

function nettoyerReve(texte = "") {
  let t = String(texte || "").trim();

  t = t
    .replace(/^(mon\s+reve\s+est|mon\s+rêve\s+est|je\s+veux\s+devenir|je\s+voudrais\s+devenir|j'aimerais\s+devenir|jaimerais\s+devenir|je\s+souhaite\s+devenir|devenir|etre|être)\s+/i, "")
    .replace(/[.,!?;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!t) return "";

  return t.charAt(0).toUpperCase() + t.slice(1);
}

function extraireDepuisHistorique(historique = [], type = "nom") {
  const messages = Array.isArray(historique) ? historique : [];

  for (const msg of messages) {
    if (msg?.role !== "user") continue;

    const contenu = String(msg?.content || "");

    if (type === "nom") {
      const nom = nettoyerNom(contenu);
      if (nom) return nom;
    }

    if (type === "classe") {
      const classe = nettoyerClasse(contenu);
      if (classe) return classe;
    }

    if (type === "reve") {
      const reve = nettoyerReve(contenu);
      if (reve && normaliserTexte(contenu).includes("devenir")) return reve;
    }
  }

  return "";
}

async function traiterOnboarding(from, user, texteUtilisateur = "") {
  let profil = user;

  if (!profil) {
    await createUser(from);
    profil = await getUser(from);

    await envoyerWhatsApp(
      from,
      `Bonsoir 😊 Avant de commencer, quel est ton prénom ?`
    );

    return {
      handled: true,
      user: profil
    };
  }

  const historique = Array.isArray(profil?.historique) ? profil.historique : [];

  if (!profil.nom || !String(profil.nom).trim()) {
    const nom =
      nettoyerNom(texteUtilisateur) ||
      extraireDepuisHistorique(historique, "nom");

    if (!nom) {
      await envoyerWhatsApp(
        from,
        `Bonsoir 😊 Avant de commencer, quel est ton prénom ?`
      );

      return {
        handled: true,
        user: profil
      };
    }

    await updateUserField(from, "nom", nom);
    profil = await getUser(from);

    await envoyerWhatsApp(
      from,
      `Enchanté **${nom}** 😊 Maintenant, dis-moi ta classe pour que je t'aide selon ton niveau.`
    );

    return {
      handled: true,
      user: profil
    };
  }

  if (!profil.classe || !String(profil.classe).trim()) {
    const classe =
      nettoyerClasse(texteUtilisateur) ||
      extraireDepuisHistorique(historique, "classe");

    if (!classe) {
      await envoyerWhatsApp(
        from,
        `**${profil.nom}** 😊 Écris-moi simplement ta classe.

Exemple : 5e année des humanités pédagogiques.`
      );

      return {
        handled: true,
        user: profil
      };
    }

    await updateUserField(from, "classe", classe);
    profil = await getUser(from);

    await envoyerWhatsApp(
      from,
      `C'est bien noté **${profil.nom}** 😊

Tu es en **${classe}**.

Maintenant, dis-moi ton rêve ou ton projet futur : que veux-tu devenir plus tard ?`
    );

    return {
      handled: true,
      user: profil
    };
  }

  if (!profil.reve || !String(profil.reve).trim()) {
    const reve =
      nettoyerReve(texteUtilisateur) ||
      extraireDepuisHistorique(historique, "reve");

    if (!reve) {
      await envoyerWhatsApp(
        from,
        `Très bien **${profil.nom}** 😊

Quel est ton rêve ou ton projet futur ?

Exemple : enseignant, avocat, médecin, ingénieur, entrepreneur.`
      );

      return {
        handled: true,
        user: profil
      };
    }

    await updateUserField(from, "reve", reve);

    if (typeof resetAllStudentAttempts === "function") {
      await resetAllStudentAttempts(from);
    }

    profil = await getUser(from);

    await envoyerWhatsApp(
      from,
      `Magnifique ambition **${profil.nom}** 😊

Devenir **${reve}** est un beau projet.

Maintenant que je connais ton profil, dis-moi la matière, la leçon ou la notion que tu veux commencer.`
    );

    return {
      handled: true,
      user: profil
    };
  }

  return {
    handled: false,
    user: profil
  };
}

module.exports = {
  traiterOnboarding,
  nettoyerNom,
  nettoyerClasse,
  nettoyerReve
};
