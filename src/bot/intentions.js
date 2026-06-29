

const {
  premierPrenom,
  normaliserTexteRelationnel
} = require("../core");

const db = require("../db");

const {
  estChoixMatiere,
  construireReponseChoixMatiere,
  estMessagePurementSocial
} = require("./social");

function sansAccents(texte = "") {
  return String(texte || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normaliserIntentions(texte = "") {
  return sansAccents(normaliserTexteRelationnel(texte))
    .replace(/[’']/g, " ")
    .replace(/[.,!?;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function formatterNom(nom = "") {
  return String(nom || "")
    .trim()
    .replace(/[.,!?;:()]/g, "")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function classeEstInvalide(classe = "") {
  const c = normaliserIntentions(classe);

  const invalides = [
    "",
    "en",
    "fatigue",
    "fatiguee",
    "fatiguee",
    "je suis fatigue",
    "je suis fatiguee",
    "triste",
    "content",
    "contente",
    "decourage",
    "decouragee",
    "oui",
    "non",
    "ok",
    "okay",
    "merci"
  ];

  return invalides.includes(c);
}

function nomEstInvalide(nom = "") {
  const n = normaliserIntentions(nom);

  const invalides = [
    "",
    "eleve",
    "en",
    "bonjour",
    "bonsoir",
    "salut",
    "hello",
    "merci",
    "ok",
    "okay",
    "oui",
    "non",
    "fatigue",
    "fatiguee",
    "triste",
    "content",
    "contente",
    "decourage",
    "decouragee",
    "francais",
    "geographie",
    "mathematiques",
    "math",
    "maths",
    "systeme metrique",
    "grammaire",
    "conjugaison",
    "orthographe",
    "biologie",
    "histoire",
    "civisme",
    "droit",
    "science",
    "sciences"
  ];

  if (invalides.includes(n)) return true;
  if (n.length < 2 || n.length > 40) return true;
  if (/\d/.test(n)) return true;

  return false;
}

function extraireNomDepuisMessage(texte = "") {
  const brut = String(texte || "").trim();
  const t = normaliserIntentions(brut);

  if (!t) return "";

  if (estChoixMatiere(brut)) return "";
  if (estMessagePurementSocial(brut)) return "";
  if (/^je suis en\s+/.test(t)) return "";
  if (/^je suis fatigue/.test(t)) return "";

  const patterns = [
    /^(?:je m appelle|je me nomme|mon nom est|mon prenom est|mon prénom est|moi c est|moi je suis|appelle moi)\s+(.+)$/i,
    /^(?:c est|cest)\s+(.+)$/i,
    /^(?:je suis)\s+([a-zA-ZÀ-ÿ\s'-]{2,40})$/i
  ];

  for (const pattern of patterns) {
    const match = brut.match(pattern);
    if (match?.[1]) {
      const candidat = formatterNom(match[1]);
      if (!nomEstInvalide(candidat)) return candidat;
    }
  }

  const simple = brut
    .replace(/[.,!?;:()]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const estNomSimple =
    /^[\p{L}][\p{L}\s'-]{1,40}$/u.test(simple) &&
    simple.split(" ").length <= 2;

  if (estNomSimple) {
    const candidat = formatterNom(simple);
    if (!nomEstInvalide(candidat)) return candidat;
  }

  return "";
}

function nettoyerClasse(classe = "") {
  let c = String(classe || "").trim();

  c = c
    .replace(/[.,!?;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const coupeurs = [
    " je veux ",
    " je voudrais ",
    " j aimerais ",
    " j'aimerais ",
    " je souhaite ",
    " et je veux ",
    " et je voudrais "
  ];

  const cNorm = normaliserIntentions(c);

  for (const coupeur of coupeurs) {
    const index = cNorm.indexOf(normaliserIntentions(coupeur));
    if (index > -1) {
      c = c.slice(0, index).trim();
      break;
    }
  }

  return c;
}

function extraireClasseDepuisMessage(texte = "") {
  const brut = String(texte || "").trim();
  const t = normaliserIntentions(brut);

  if (!t) return "";

  if (/je suis fatigue|je suis triste|je suis content|je suis contente/.test(t)) {
    return "";
  }

  const patterns = [
    /(?:je suis en|je suis au|je suis a la|je suis à la)\s+(.+)$/i,
    /(?:ma classe est|classe est|classe)\s*:?\s+(.+)$/i,
    /(?:je fais|je frequente|je fréquente)\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = brut.match(pattern);
    if (match?.[1]) {
      const candidat = nettoyerClasse(match[1]);
      if (!classeEstInvalide(candidat)) return candidat;
    }
  }

  const contientClasse =
    /\b([1-9]|10|11|12)\s*(e|eme|ème|er|ere|ère)\b/i.test(t) ||
    /\b(sixieme|septieme|huitieme|neuvieme|dixieme|onzieme|douzieme|premiere|terminale)\b/i.test(t) ||
    /\b(primaire|secondaire|humanite|humanites|annee|section|pedagogie|scientifique|commerciale|litteraire|latin|math physique|bio chimie)\b/i.test(t);

  if (contientClasse && t.length <= 80) {
    const candidat = nettoyerClasse(brut);
    if (!classeEstInvalide(candidat)) return candidat;
  }

  return "";
}

function extraireReveDepuisMessage(texte = "") {
  const brut = String(texte || "").trim();

  const patterns = [
    /(?:je veux devenir|je voudrais devenir|j aimerais devenir|j'aimerais devenir|mon reve est de devenir|mon rêve est de devenir)\s+(.+)$/i,
    /(?:plus tard je veux etre|plus tard je veux être|plus tard je voudrais etre|plus tard je voudrais être)\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const match = brut.match(pattern);
    if (match?.[1]) {
      return match[1]
        .replace(/[.,!?;:()]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  return "";
}

function profilAUnNomValide(user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  return Boolean(prenom && prenom !== "élève" && !nomEstInvalide(prenom));
}

function profilAUneClasseValide(user = {}) {
  return !classeEstInvalide(user?.classe || "");
}

async function sauvegarderProfilUtilisateur(user = {}, patch = {}) {
  const phone =
    user?.phone ||
    user?.telephone ||
    user?.numero ||
    user?.whatsapp ||
    user?.wa_id ||
    "";

  const profil = {
    ...user,
    ...patch
  };

  if (!phone) return profil;

  const fonctionsGenerales = [
    "updateUserProfile",
    "updateUserProfil",
    "updateUser",
    "updateUtilisateur",
    "mettreAJourUtilisateur",
    "mettreAJourProfil",
    "saveUserProfile",
    "upsertUser",
    "createOrUpdateUser"
  ];

  for (const nomFonction of fonctionsGenerales) {
    const fn = db?.[nomFonction];

    if (typeof fn !== "function") continue;

    try {
      if (fn.length >= 4) {
        const resultat = await fn(
          phone,
          profil.nom || "",
          profil.classe || "",
          profil.reve || ""
        );

        return resultat || profil;
      }

      const resultat = await fn(phone, patch);
      return resultat || profil;
    } catch (_) {
      // On essaie une autre fonction disponible sans bloquer le bot.
    }
  }

  try {
    if (patch.nom && typeof db?.updateUserName === "function") {
      await db.updateUserName(phone, patch.nom);
    }

    if (patch.classe && typeof db?.updateUserClasse === "function") {
      await db.updateUserClasse(phone, patch.classe);
    }

    if (patch.reve && typeof db?.updateUserReve === "function") {
      await db.updateUserReve(phone, patch.reve);
    }

    return profil;
  } catch (_) {
    return profil;
  }
}

async function traiterIntentionsProfil(user = {}, texteUtilisateur = "") {
  const texte = String(texteUtilisateur || "").trim();

  if (!texte) {
    return {
      handled: false,
      user
    };
  }

  const dejaNom = profilAUnNomValide(user);
  const dejaClasse = profilAUneClasseValide(user);

  if (dejaNom && dejaClasse) {
    return {
      handled: false,
      user
    };
  }

  if (!dejaNom) {
    const nom = extraireNomDepuisMessage(texte);

    if (nom) {
      const userMisAJour = await sauvegarderProfilUtilisateur(user, { nom });

      return {
        handled: true,
        user: userMisAJour,
        reponse: `Enchanté **${nom}** 😊 Maintenant, dis-moi ta classe pour que je t'aide selon ton niveau.`,
        fiche: null,
        bypassFormat: true
      };
    }

    return {
      handled: true,
      user,
      reponse: `Bonsoir 😊 Avant de commencer, quel est ton prénom ?`,
      fiche: null,
      bypassFormat: true
    };
  }

  if (!dejaClasse) {
    const classe = extraireClasseDepuisMessage(texte);

    if (classe) {
      const reve = extraireReveDepuisMessage(texte);
      const patch = reve ? { classe, reve } : { classe };

      const userMisAJour = await sauvegarderProfilUtilisateur(user, patch);
      const prenom = premierPrenom(userMisAJour?.nom || user?.nom || "");
      const reponseChoix = construireReponseChoixMatiere(userMisAJour, texte);

      if (reponseChoix) {
        return {
          handled: true,
          user: userMisAJour,
          reponse: `Merci **${prenom}** 😊 Ta classe est notée : **${classe}**.\n\n${reponseChoix}`,
          fiche: null,
          bypassFormat: true
        };
      }

      return {
        handled: true,
        user: userMisAJour,
        reponse: `Merci **${prenom}** 😊 Ta classe est notée : **${classe}**. Quelle matière veux-tu travailler ?`,
        fiche: null,
        bypassFormat: true
      };
    }

    const prenom = premierPrenom(user?.nom || "");

    return {
      handled: true,
      user,
      reponse: `Merci **${prenom}** 😊 Maintenant, dis-moi ta classe pour que je t'aide selon ton niveau.`,
      fiche: null,
      bypassFormat: true
    };
  }

  return {
    handled: false,
    user
  };
}

module.exports = {
  normaliserIntentions,
  formatterNom,
  classeEstInvalide,
  nomEstInvalide,
  extraireNomDepuisMessage,
  extraireClasseDepuisMessage,
  extraireReveDepuisMessage,
  profilAUnNomValide,
  profilAUneClasseValide,
  sauvegarderProfilUtilisateur,
  traiterIntentionsProfil
};
