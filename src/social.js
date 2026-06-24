
const {
  pick,
  premierPrenom,
  normaliserTexteRelationnel,
  normaliserMessageCourt
} = require("./utils");

function estMessagePurementSocial(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  if (/^(bonjour|bonsoir|salut|hello|coucou|bjr|bsr|mbote|yo|cc|slt)\b/i.test(t)) return true;
  if (/^(merci|merci beaucoup|grand merci|mille mercis|merci infiniment|merci encore|merci bien|je te remercie|je vous remercie|thanks|thx)\b/i.test(t)) return true;
  if (/^(ok|okay|d accord|dac|dacc|oui|non|ca va|bien|super|cool|entendu|compris|parfait|tres bien|nickel|ca marche|ca va merci)\b/i.test(t)) return true;
  if (/^(bonne nuit|dors bien|bonne soiree|bonne journee|bonne matinee|bon apres midi|bon week end|bon weekend|a demain|a bientot)\b/i.test(t)) return true;
  if (/^(tu vas bien|comment vas tu|comment ca va|ca va|et toi|et vous)$/i.test(t)) return true;
  if (/^(je vais bien|je vais tres bien|je me porte bien|je me sens bien|tranquille|pas mal|au top|ca roule|bien merci|oui ca va|oui je vais bien)$/i.test(t)) return true;

  return false;
}

function estMessageRelationnelSimple(texte = "") {
  return estMessagePurementSocial(texte);
}

function estMessageSalutation(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  return /^(bonjour|bonsoir|salut|hello|coucou|bjr|mbote|yo|cc|slt|bonne nuit|bonne soiree|bonne journee|bon apres midi|bon weekend|bon week end|a demain)$/.test(t);
}

function estMessageRemerciement(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  return /^(merci|merci beaucoup|grand merci|mille mercis|merci infiniment|merci encore|merci bien|je te remercie|je vous remercie|ok merci|okay merci|d accord merci)$/.test(t);
}

function estMessageCourtHumain(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  return [
    "ok", "okay", "d accord", "oui", "non", "ca va", "bien",
    "super", "cool", "entendu", "compris", "parfait",
    "tres bien", "nickel", "ca marche", "ca va merci"
  ].includes(t);
}

function estReponseRelationnelleSimpleIA(texte = "") {
  const t = String(texte || "").trim();
  const n = normaliserMessageCourt(t);

  if (!t) return false;
  if (/🔵\s*\[VÉCU\]|🟡\s*\[SAVOIR\]|🔴\s*\[INSPIRATION\]|❓\s*\[CONSOLIDATION\]/i.test(t)) return false;
  if (t.length > 180) return false;

  return (
    n.startsWith("je t en prie") ||
    n.startsWith("avec plaisir") ||
    n.startsWith("c est normal") ||
    n.startsWith("bonjour") ||
    n.startsWith("bonsoir") ||
    n.startsWith("salut") ||
    n.startsWith("bonne nuit") ||
    n.startsWith("d accord")
  );
}

function dernierMessageEstQuestionBienEtre(historique = []) {
  const dernierAssistant = [...historique].reverse().find(m => m.role === "assistant");
  if (!dernierAssistant) return false;

  const texte = normaliserTexteRelationnel(dernierAssistant.content || "");

  return (
    texte.includes("comment vas tu") ||
    texte.includes("comment te sens tu") ||
    texte.includes("comment se passe ta journee") ||
    texte.includes("comment s est passee ta journee") ||
    texte.includes("est ce que tout va bien")
  );
}

function estSecondTourSalutation(historique = [], texteUtilisateur = "") {
  if (!dernierMessageEstQuestionBienEtre(historique)) return false;
  const t = normaliserTexteRelationnel(texteUtilisateur);

  return t.length < 80 && [
    "ca va", "ca va bien", "je vais bien", "bien et toi",
    "oui je vais bien", "ca va merci", "je vais bien merci",
    "tranquille", "cool", "super", "pas mal", "tres bien",
    "nickel", "au top", "et toi", "et vous"
  ].includes(t);
}

function genererRepriseApresBienEtre(user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom ? `**${prenom}**` : "toi";

  return pick([
    `Tant mieux ${appel} ! 😊 Qu'est-ce que tu aimerais apprendre maintenant ?`,
    `Je suis content de l'entendre ${appel}. Quelle matière veux-tu revoir ?`,
    `Heureux de te voir en forme ${appel}. Dis-moi, que veux-tu réviser ?`
  ]);
}

function construireReponseHumaineSimple(user = {}, texte = "") {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom ? `**${prenom}**` : "toi";
  const t = normaliserTexteRelationnel(texte);
  const heure = new Date().getHours();

  if (estMessageRemerciement(t)) {
    return pick([
      `Avec plaisir ${appel} 😊 Si tu as une question, je suis là.`,
      `Je t'en prie ${appel} 🤗 Dis-moi si tu veux revoir quelque chose.`,
      `C'est normal ${appel}, je suis là pour ça 💪 Une petite question à me poser ?`
    ]);
  }

  if (estMessageSalutation(t)) {
    if (t.includes("bonjour") || t.includes("salut") || t.includes("bjr") || t.includes("mbote") || t.includes("cc")) {
      if (heure < 12) return `Bonjour ${appel} ☀️ Comment vas-tu aujourd'hui ?`;
      if (heure < 18) return `Bon après-midi ${appel} 🌤 Comment se passe ta journée ?`;
      return `Bonsoir ${appel} 🌙 Comment s'est passée ta journée ?`;
    }

    if (t.includes("bonne nuit")) return `Bonne nuit ${appel} 🌜 Fais de beaux rêves.`;
    if (t.includes("bonne journee")) return `Bonne journée à toi aussi ${appel} ☀️`;
    if (t.includes("bonne soiree")) return `Bonne soirée ${appel} 🌙`;
    if (t.includes("a demain")) return `À demain ${appel} 👋`;

    return `Salut ${appel} 👋`;
  }

  if (estMessageCourtHumain(t)) {
    return pick([
      `D'accord ${appel} 👍 Tu as quelque chose à revoir ?`,
      `Parfait ${appel} ✅ Dis-moi si tu veux travailler une matière.`,
      `Entendu ${appel} 😉 Je suis prêt à t'aider si tu as une question.`
    ]);
  }

  if (/^(tu vas bien|comment vas tu|comment ca va|ca va|et toi|et vous)$/i.test(t)) {
    return `Je vais très bien, merci ${appel} ! Et toi ? 😊`;
  }

  return "";
}

module.exports = {
  estMessagePurementSocial,
  estMessageRelationnelSimple,
  estMessageSalutation,
  estMessageRemerciement,
  estMessageCourtHumain,
  estReponseRelationnelleSimpleIA,
  dernierMessageEstQuestionBienEtre,
  estSecondTourSalutation,
  genererRepriseApresBienEtre,
  construireReponseHumaineSimple
};
