

// src/bot/onboarding.js

const db = require("../db");

function normaliser(texte = "") {
  return String(texte || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titre(texte = "") {
  return String(texte || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase())
    .join(" ");
}

function estCommandeProfil(texte = "") {
  const t = normaliser(texte);

  return (
    t === "/profil" ||
    t === "/ profil" ||
    t === "profil" ||
    t === "modifier profil" ||
    t === "changer profil" ||
    t === "refaire profil"
  );
}

function estMessageSocial(texte = "") {
  const t = normaliser(texte);

  return [
    "",
    "bonjour",
    "bonjour mwalimu",
    "bonsoir",
    "bonsoir mwalimu",
    "salut",
    "salut mwalimu",
    "merci",
    "ok",
    "okay",
    "d accord",
    "ca va",
    "bien",
    "tres bien"
  ].includes(t);
}

function sembleClasse(texte = "") {
  const t = normaliser(texte);

  return (
    t.includes("je suis en") ||
    t.includes("ma classe") ||
    t.includes("classe") ||
    t.includes("annee") ||
    t.includes("humanite") ||
    t.includes("humanites") ||
    t.includes("primaire") ||
    t.includes("secondaire") ||
    t.includes("pedagogique") ||
    /\b[1-9]\s*(e|eme|ere|er)?\b/.test(t)
  );
}

function sembleReve(texte = "") {
  const t = normaliser(texte);

  return (
    t.includes("je veux devenir") ||
    t.includes("je voudrais devenir") ||
    t.includes("j aimerais devenir") ||
    t.includes("je souhaite devenir") ||
    t.includes("mon reve") ||
    t.includes("mon projet")
  );
}

function nettoyerNom(texte = "") {
  if (estMessageSocial(texte)) return "";
  if (estCommandeProfil(texte)) return "";
  if (sembleClasse(texte)) return "";
  if (sembleReve(texte)) return "";

  let t = String(texte || "")
    .replace(/^mon\s+pr[eé]nom\s+est\s+/i, "")
    .replace(/^mon\s+nom\s+est\s+/i, "")
    .replace(/^je\s+m['’]?appelle\s+/i, "")
    .replace(/^je\s+me\s+nomme\s+/i, "")
    .replace(/^moi\s+c['’]?est\s+/i, "")
    .replace(/[.,!?;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const n = normaliser(t);

  if (!n) return "";
  if (n.length < 2) return "";
  if (n.includes("bonjour")) return "";
  if (n.includes("bonsoir")) return "";
  if (n.includes("mwalimu")) return "";
  if (n.includes("profil")) return "";
  if (n.includes("classe")) return "";
  if (n.includes("humanite")) return "";
  if (n.includes("devenir")) return "";

  const mots = t.split(/\s+/).filter(Boolean);

  if (mots.length > 3) return "";

  return titre(t);
}

function nettoyerClasse(texte = "") {
  let t = String(texte || "")
    .replace(/^je\s+suis\s+en\s+/i, "")
    .replace(/^ma\s+classe\s+est\s+/i, "")
    .replace(/^classe\s*:\s*/i, "")
    .replace(/\b([1-9])\s*[èe]me\b/gi, "$1e")
    .replace(/\b([1-9])\s*eme\b/gi, "$1e")
    .replace(/\b1\s*[èe]re\b/gi, "1ère")
    .replace(/\bhumanite\b/gi, "humanités")
    .replace(/\bhumanité\b/gi, "humanités")
    .replace(/\s+/g, " ")
    .trim();

  if (!sembleClasse(t)) return "";

  return t;
}

function nettoyerReve(texte = "") {
  let t = String(texte || "")
    .replace(/^mon\s+r[eê]ve\s+est\s+/i, "")
    .replace(/^mon\s+projet\s+est\s+/i, "")
    .replace(/^je\s+veux\s+devenir\s+/i, "")
    .replace(/^je\s+voudrais\s+devenir\s+/i, "")
    .replace(/^j['’]?aimerais\s+devenir\s+/i, "")
    .replace(/^je\s+souhaite\s+devenir\s+/i, "")
    .replace(/^devenir\s+/i, "")
    .replace(/^être\s+/i, "")
    .replace(/^etre\s+/i, "")
    .replace(/[.,!?;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!t) return "";
  if (estMessageSocial(t)) return "";
  if (sembleClasse(t)) return "";

  return t.charAt(0).toUpperCase() + t.slice(1);
}

function nomInvalide(nom = "") {
  const n = normaliser(nom);

  return (
    !n ||
    n.includes("bonjour") ||
    n.includes("bonsoir") ||
    n.includes("mwalimu") ||
    n.includes("profil") ||
    n.includes("classe") ||
    n.includes("humanite") ||
    n.includes("devenir")
  );
}

async function appelerDb(noms = [], ...args) {
  for (const nom of noms) {
    const fn = db?.[nom];

    if (typeof fn !== "function") continue;

    try {
      const r = await fn(...args);
      if (r !== undefined && r !== null) return r;
    } catch (_) {
      // autre fonction
    }
  }

  return null;
}

async function getUserSafe(phone = "") {
  const user = await appelerDb(
    [
      "getUser",
      "getUserByPhone",
      "getUtilisateur",
      "getUtilisateurByPhone",
      "getOrCreateUser",
      "getOrCreateUtilisateur"
    ],
    phone
  );

  if (user) {
    return {
      ...user,
      phone: user.phone || user.telephone || user.numero || phone
    };
  }

  return { phone, nom: "", classe: "", reve: "" };
}

async function createUserSafe(phone = "") {
  await appelerDb(
    [
      "createUser",
      "createUtilisateur",
      "getOrCreateUser",
      "getOrCreateUtilisateur"
    ],
    phone
  );

  return await getUserSafe(phone);
}

async function updateFieldSafe(phone = "", field = "", value = "") {
  await appelerDb(
    [
      "updateUserField",
      "updateUtilisateurField",
      "setUserField",
      "setUtilisateurField"
    ],
    phone,
    field,
    value
  );
}

async function resetProfilSafe(phone = "") {
  await updateFieldSafe(phone, "nom", "");
  await updateFieldSafe(phone, "classe", "");
  await updateFieldSafe(phone, "reve", "");

  return {
    phone,
    nom: "",
    classe: "",
    reve: ""
  };
}

async function traiterOnboarding(phone = "", user = {}, texteUtilisateur = "") {
  let profil = user;

  if (!profil || !profil.phone) {
    profil = await createUserSafe(phone);
  }

  if (estCommandeProfil(texteUtilisateur)) {
    profil = await resetProfilSafe(phone);

    return {
      handled: true,
      user: profil,
      reponse: `Profil remis à zéro 😊

Avant de commencer, quel est ton prénom ?`,
      fiche: null,
      bypassFormat: true
    };
  }

  if (!profil.nom || nomInvalide(profil.nom)) {
    const nom = nettoyerNom(texteUtilisateur);

    if (!nom) {
      return {
        handled: true,
        user: profil,
        reponse: `Bonjour 😊 Avant de commencer, quel est ton prénom ?`,
        fiche: null,
        bypassFormat: true
      };
    }

    await updateFieldSafe(phone, "nom", nom);
    profil = await getUserSafe(phone);

    return {
      handled: true,
      user: profil,
      reponse: `Enchanté **${nom}** 😊 Maintenant, dis-moi ta classe pour que je t'aide selon ton niveau.`,
      fiche: null,
      bypassFormat: true
    };
  }

  if (!profil.classe || !String(profil.classe).trim()) {
    const classe = nettoyerClasse(texteUtilisateur);

    if (!classe) {
      return {
        handled: true,
        user: profil,
        reponse: `**${profil.nom}** 😊 Écris-moi simplement ta classe.

Exemple : 5e année des humanités pédagogiques.`,
        fiche: null,
        bypassFormat: true
      };
    }

    await updateFieldSafe(phone, "classe", classe);
    profil = await getUserSafe(phone);

    return {
      handled: true,
      user: profil,
      reponse: `C'est bien noté **${profil.nom}** 😊

Tu es en **${classe}**.

Maintenant, dis-moi ton rêve ou ton projet futur : que veux-tu devenir plus tard ?`,
      fiche: null,
      bypassFormat: true
    };
  }

  if (!profil.reve || !String(profil.reve).trim()) {
    const reve = nettoyerReve(texteUtilisateur);

    if (!reve) {
      return {
        handled: true,
        user: profil,
        reponse: `Très bien **${profil.nom}** 😊

Quel est ton rêve ou ton projet futur ?

Exemple : enseignant, avocat, médecin, ingénieur, entrepreneur.`,
        fiche: null,
        bypassFormat: true
      };
    }

    await updateFieldSafe(phone, "reve", reve);
    profil = await getUserSafe(phone);

    return {
      handled: true,
      user: profil,
      reponse: `Magnifique ambition **${profil.nom}** 😊

Devenir **${reve}** est un beau projet.

Maintenant que je connais ton profil, dis-moi la matière, la leçon ou la notion que tu veux commencer.`,
      fiche: null,
      bypassFormat: true
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
  nettoyerReve,
  estCommandeProfil,
  nomInvalide
};
