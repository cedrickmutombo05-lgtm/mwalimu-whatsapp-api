

const {
  pick,
  normaliserTexteRelationnel,
  normaliserMessageCourt,
  premierPrenom
} = require("../core");

const MATIERES_ORIENTATION = {
  geographie: {
    label: "géographie",
    aliases: ["geographie", "géographie", "geo", "géo"],
    themes: [
      "les provinces de la RDC",
      "les fleuves et lacs",
      "les reliefs",
      "les climats",
      "les territoires et villes"
    ]
  },
  mathematiques: {
    label: "mathématiques",
    aliases: ["math", "maths", "mathematiques", "mathématiques"],
    themes: [
      "les opérations",
      "les fractions",
      "les problèmes",
      "le système métrique",
      "les formes géométriques"
    ]
  },
  biologie: {
    label: "biologie",
    aliases: ["biologie", "bio"],
    themes: [
      "les êtres vivants",
      "la cellule",
      "les plantes",
      "les animaux",
      "le corps humain"
    ]
  },
  microbiologie: {
    label: "microbiologie",
    aliases: ["microbiologie", "microbes", "microbe"],
    themes: [
      "les microbes",
      "les bactéries",
      "les virus",
      "l'hygiène",
      "la prévention des maladies"
    ]
  },
  civisme: {
    label: "civisme / éducation à la citoyenneté",
    aliases: ["civisme", "citoyennete", "citoyenneté", "education a la citoyennete", "éducation à la citoyenneté"],
    themes: [
      "les droits et devoirs",
      "le respect des lois",
      "les symboles de l'État",
      "le patriotisme",
      "la vie en société"
    ]
  },
  etude_milieu: {
    label: "étude du milieu",
    aliases: ["etude du milieu", "étude du milieu", "milieu"],
    themes: [
      "la famille",
      "l'école",
      "le quartier",
      "l'environnement",
      "l'hygiène"
    ]
  },
  francais: {
    label: "français",
    aliases: ["francais", "français", "grammaire", "orthographe", "conjugaison"],
    themes: [
      "la grammaire",
      "la conjugaison",
      "l'orthographe",
      "la lecture",
      "la rédaction"
    ]
  },
  histoire: {
    label: "histoire",
    aliases: ["histoire"],
    themes: [
      "l'histoire de la RDC",
      "l'indépendance",
      "les royaumes anciens",
      "la colonisation",
      "les grandes dates"
    ]
  },
  droit: {
    label: "droit",
    aliases: ["droit", "juridique"],
    themes: [
      "les articles de loi",
      "la procédure",
      "la famille",
      "les droits de l'enfant",
      "les juridictions"
    ]
  },
  sciences: {
    label: "sciences",
    aliases: ["sciences", "science"],
    themes: [
      "le vivant",
      "la matière",
      "l'énergie",
      "l'environnement",
      "le corps humain"
    ]
  }
};

function detecterMatiereChoisie(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return null;

  const questionsDirectes = [
    "c est quoi",
    "qu est ce que",
    "explique",
    "definition",
    "définition",
    "donne moi",
    "quels sont",
    "quelle est",
    "pourquoi",
    "comment"
  ];

  const estQuestionDeCours = questionsDirectes.some((mot) => t.includes(mot));

  for (const [key, matiere] of Object.entries(MATIERES_ORIENTATION)) {
    if (matiere.aliases.includes(t)) {
      return { key, ...matiere };
    }
  }

  if (estQuestionDeCours) return null;

  const intentionsChoix = [
    "je veux etudier",
    "je veux étudier",
    "je veux apprendre",
    "je choisis",
    "je prends",
    "on fait",
    "nous faisons",
    "commencons par",
    "commençons par",
    "je prefere",
    "je préfère",
    "allons en",
    "travaillons",
    "je veux reviser",
    "je veux réviser"
  ];

  const aIntentionChoix = intentionsChoix.some((mot) => t.includes(mot));
  if (!aIntentionChoix) return null;

  for (const [key, matiere] of Object.entries(MATIERES_ORIENTATION)) {
    if (matiere.aliases.some((alias) => t.includes(alias))) {
      return { key, ...matiere };
    }
  }

  return null;
}

function estChoixMatiere(texte = "") {
  return Boolean(detecterMatiereChoisie(texte));
}

function construireReponseChoixMatiere(user = {}, texte = "") {
  const matiere = detecterMatiereChoisie(texte);
  if (!matiere) return "";

  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom ? `**${prenom}**` : "toi";

  const themes = matiere.themes
    .map((theme, index) => `${index + 1}. ${theme}`)
    .join("\n");

  return `Très bien ${appel} 😊
Nous allons travailler **${matiere.label}**.

Tu veux commencer par :
${themes}
${matiere.themes.length + 1}. une question de ton choix ?`;
}

function estMessagePurementSocial(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  if (estChoixMatiere(texte)) return true;

  if (/^(bonjour|bonsoir|salut|hello|coucou|bjr|bsr|mbote|yo|cc|slt)\b/i.test(t)) return true;
  if (/^(merci|merci beaucoup|grand merci|mille mercis|merci infiniment|merci encore|merci bien|merci a toi|merci mwalimu|je te remercie|je vous remercie|cimer|thanks|thx)\b/i.test(t)) return true;
  if (/^(ok|okay|d accord|dac|dacc|oui|non|ca va|bien|super|cool|entendu|compris|parfait|tres bien|nickel|ca marche|ca va merci|pas de souci|pas de probleme|a plus|a tantot|a toute|bye|tchao)\b/i.test(t)) return true;
  if (/^(bonne nuit|fais de beaux reves|dors bien|bonne soiree|bonne journee|bonne matinee|bon apres midi|bon week end|bon weekend|a demain|a bientot)\b/i.test(t)) return true;
  if (/^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\s]+$/u.test(t)) return true;
  if (/^(tu vas bien\??|comment vas-tu\??|comment tu vas\??|et toi\??|et vous\??|vous allez bien\??|comment ca va\??|ca va\??)$/i.test(t)) return true;

  if (/^(je vais bien|je vais tres bien|je vais super bien|je vais bien merci|je vais tres bien merci|je me porte bien|je me porte tres bien|je me porte super bien|je me sens bien|je me sens tres bien|je me sens super bien|tranquille|tranquille merci|pas mal|pas mal merci|au top|au top merci|ca roule|ca roule merci|imboko|imboko merci|bien merci|bien et toi|je vais bien et toi|je me porte bien et toi|oui je vais bien|oui je vais tres bien|oui je me porte bien|oui ca va|oui ca va merci)$/i.test(t)) return true;

  if (/^(je suis fatigue|je suis fatiguee|je suis triste|je suis content|je suis contente|je suis decourage|je suis decouragee|je veux parler un peu|tu es la|tu es là|on reprend demain|je t aime bien mwalimu|tu es fort|tu es forte)$/i.test(t)) return true;

  return false;
}

function estMessageRelationnelSimple(texte = "") {
  return estMessagePurementSocial(texte);
}

function estMessageSalutation(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  return (
    /^(bonjour|bonsoir|salut|hello|coucou|bjr|mbote|yo|cc|slt)$/.test(t) ||
    /^(bonne?\s+nuit)$/.test(t) ||
    /^(bonne?\s+soiree)$/.test(t) ||
    /^(bonne?\s+journee)$/.test(t) ||
    /^(bonne?\s+matinee)$/.test(t) ||
    /^(bon(ne)?\s+apres\s+midi)$/.test(t) ||
    /^(bon(ne)?\s+week\s*end)$/.test(t) ||
    /^(bon(ne)?\s+weekend)$/.test(t) ||
    /^(a\s+demain)$/.test(t) ||
    /^(bon\s+reveil)$/.test(t) ||
    /^(re\s*bonjour)$/.test(t)
  );
}

function estMessageRemerciement(texte = "") {
  const t = normaliserTexteRelationnel(texte);
  if (!t) return false;

  const exacts = [
    "merci",
    "merci beaucoup",
    "grand merci",
    "mille mercis",
    "merci infiniment",
    "merci encore",
    "merci bien",
    "un grand merci",
    "vraiment merci",
    "ok merci",
    "okay merci",
    "d accord merci",
    "merci pour tout",
    "merci pour ton aide",
    "merci pour votre aide",
    "je te remercie",
    "je vous remercie",
    "je te dis merci",
    "je vous dis merci"
  ];

  return exacts.includes(t);
}

function estMessageCourtHumain(texte = "") {
  const t = normaliserTexteRelationnel(texte);

  return [
    "ok",
    "okay",
    "d accord",
    "oui",
    "non",
    "ca va",
    "bien",
    "super",
    "cool",
    "entendu",
    "compris",
    "parfait",
    "tres bien",
    "nickel",
    "ca marche",
    "ca va merci"
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
    n.startsWith("toujours la") ||
    n.startsWith("bonjour") ||
    n.startsWith("bonsoir") ||
    n.startsWith("salut") ||
    n.startsWith("bonne nuit") ||
    n.startsWith("d accord") ||
    n.startsWith("bonne journee") ||
    n.startsWith("bon apres midi") ||
    n.startsWith("bon week end")
  );
}

function dernierMessageEstQuestionBienEtre(historique = []) {
  if (!historique.length) return false;

  const dernierAssistant = [...historique].reverse().find((m) => m.role === "assistant");
  if (!dernierAssistant) return false;

  const texte = normaliserTexteRelationnel(dernierAssistant.content || "");

  const motifs = [
    "comment vas-tu",
    "comment te sens-tu",
    "comment se passe ta journee",
    "comment s est passee ta journee",
    "j espere que tu as bien dormi",
    "contente de te retrouver",
    "ravie de te parler",
    "est ce que tout va bien pour toi",
    "prete a te detendre",
    "raconte moi vite comment s est passee ta journee"
  ];

  if (motifs.some((motif) => texte.includes(motif))) return true;
  if (/comment\b.*\bvas\b.*\btu\b/i.test(texte)) return true;
  if (/comment\b.*\bte\b.*\bsens\b/i.test(texte)) return true;
  if (/comment\b.*\bse\b.*\bpasse\b/i.test(texte)) return true;
  if (/est(\s|-)ce(\s|-)que\b.*\bva\b.*\bbien\b/i.test(texte)) return true;

  return false;
}

function estSecondTourSalutation(historique = [], texteUtilisateur = "") {
  if (!dernierMessageEstQuestionBienEtre(historique)) return false;

  const t = normaliserTexteRelationnel(texteUtilisateur);

  const reponsesCourtes = [
    "ca va", "ca va bien", "je vais bien", "bien et toi", "oui je vais bien",
    "ca va merci", "je vais bien merci", "tranquille", "cool", "super",
    "pas mal", "tres bien", "nickel", "je vais super bien", "au top",
    "tu vas bien", "comment vas-tu", "et toi", "et vous", "comment ca va",
    "vous allez bien", "je vais tres bien", "je me sens bien",
    "je me porte bien", "ca roule", "imboko", "bien merci",
    "je vais bien et toi", "je me porte bien et toi", "oui ca va",
    "oui ca va merci"
  ];

  return t.length < 80 && reponsesCourtes.includes(t);
}

function genererRepriseApresBienEtre(user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom ? `**${prenom}**` : "toi";

  return pick([
    `Tant mieux ${appel} ! 😊 Qu'est-ce que tu aimerais apprendre maintenant ?`,
    `Je suis content de l'entendre ${appel}. Quelle matière te tente aujourd'hui ?`,
    `Heureux de te voir en forme ${appel}. Dis-moi, que veux-tu réviser ?`
  ]);
}

function construireReponseHumaineSimple(user = {}, texte = "") {
  const choixMatiere = construireReponseChoixMatiere(user, texte);
  if (choixMatiere) return choixMatiere;

  const prenom = premierPrenom(user?.nom || "");
  const appel = prenom ? `**${prenom}**` : "toi";
  const t = normaliserTexteRelationnel(texte);
  const heure = new Date().getHours();

  if (estMessageRemerciement(t)) {
    return pick([
      `Avec plaisir ${appel} 😊 Si tu as une question, je suis là.`,
      `Je t'en prie ${appel} 🤗 Dis-moi si tu veux revoir quelque chose.`,
      `C'est normal ${appel}, je suis là pour ça 💪 Une petite question à me poser ?`,
      `Heureux de t'aider ${appel} ✨ N'hésite pas si tu as besoin d'explications.`
    ]);
  }

  if (/je suis fatiguee|je suis fatigue/.test(t)) {
    return `Je comprends ${appel} 😊 Repose-toi un peu. Quand tu seras prêt·e, on reprendra calmement.`;
  }

  if (/je suis triste|je suis decouragee|je suis decourage/.test(t)) {
    return `Je suis là ${appel} 🤍 Ne te décourage pas. On peut avancer doucement, sans pression.`;
  }

  if (/je suis contente|je suis content/.test(t)) {
    return `Ça me fait plaisir ${appel} 😊 Profitons de cette bonne énergie pour apprendre quelque chose simplement.`;
  }

  if (/tu es la|tu es là/.test(t)) {
    return `Oui ${appel}, je suis là 😊 Dis-moi ce que tu veux faire : parler un peu, réviser ou poser une question.`;
  }

  if (/on reprend demain/.test(t)) {
    return `D'accord ${appel} 😊 Repose-toi bien. Demain, nous reprendrons calmement.`;
  }

  if (/je t aime bien mwalimu|tu es fort|tu es forte/.test(t)) {
    return `Merci ${appel} 😊 Ça me fait plaisir. Je suis là pour t'accompagner avec patience et sérieux.`;
  }

  if (/je veux parler un peu/.test(t)) {
    return `D'accord ${appel} 😊 Je suis là. Tu peux me parler un peu, puis quand tu seras prêt·e, on reprendra l'étude.`;
  }

  if (estMessageSalutation(t)) {
    if (/(bonjour|salut|bjr|mbote|yo|cc|slt)/i.test(t)) {
      if (heure < 12) {
        return pick([
          `Bonjour ${appel} ☀️ Comment vas-tu aujourd'hui ?`,
          `Salut ${appel} 😊 J'espère que tu as bien dormi.`,
          `Coucou ${appel} 👋 Content de te retrouver. Comment te sens-tu ?`
        ]);
      }

      if (heure < 18) {
        return pick([
          `Bon après-midi ${appel} 🌤 Comment se passe ta journée ?`,
          `Salut ${appel} ☀️ Est-ce que tout va bien pour toi ?`
        ]);
      }

      return pick([
        `Bonsoir ${appel} 🌙 Comment s'est passée ta journée ?`,
        `Salut ${appel} 🌆 Content de te retrouver. Tu veux parler un peu ou réviser quelque chose ?`
      ]);
    }

    if (t.includes("bonsoir")) {
      return pick([
        `Bonsoir ${appel} 🌙 J'espère que ta journée s'est bien passée. As-tu une question ou une matière à revoir ?`,
        `Bonsoir ${appel} 😊 Content de te retrouver. Qu'est-ce que tu aimerais apprendre maintenant ?`
      ]);
    }

    if (t.includes("bonne nuit")) return `Bonne nuit ${appel} 🌜 Fais de beaux rêves. Demain, on pourra reprendre calmement.`;
    if (t.includes("bonne journee")) return `Bonne journée à toi aussi ${appel} ☀️ Qu'as-tu envie de découvrir aujourd'hui ?`;
    if (t.includes("bon apres midi")) return `Merci ${appel} ! Passe un bon après-midi 🌤 Et si tu veux, on peut revoir quelque chose ensemble.`;
    if (t.includes("bonne soiree")) return `Bonne soirée ${appel} 🌙 Si tu veux revoir un point avant de dormir, je suis là.`;
    if (t.includes("bon week end") || t.includes("bon weekend")) return `Bon week-end ${appel} 😄 Profite bien ! Si tu as un moment, on pourra réviser une notion.`;
    if (t.includes("a demain")) return `À demain ${appel} 👋 Nous continuerons calmement.`;

    return `Salut ${appel} 👋`;
  }

  if (estMessageCourtHumain(t)) {
    if (t === "ca va" || t === "ca va merci") {
      return `Oui, ça va très bien ${appel}, merci ! Et toi ? 😊 Si tu veux, on peut revoir une notion.`;
    }

    return pick([
      `D'accord ${appel} 👍 Tu as quelque chose à revoir ?`,
      `Parfait ${appel} ✅ Dis-moi si tu veux travailler une matière.`,
      `Entendu ${appel} 😉 Je suis prêt à t'aider si tu as une question.`
    ]);
  }

  if (/^(tu vas bien\??|comment vas-tu\??|comment tu vas\??|et toi\??|et vous\??|vous allez bien\??|comment ca va\??|ca va\??)$/i.test(t)) {
    return pick([
      `Je vais très bien, merci ${appel} ! Et toi, comment vas-tu ? 😊`,
      `Tout va bien de mon côté, ${appel}. Merci de demander ! Et toi, qu'as-tu envie d'apprendre aujourd'hui ?`,
      `Je me sens en pleine forme, ${appel} ! Dis-moi, quelle matière veux-tu explorer ?`
    ]);
  }

  return "";
}

module.exports = {
  MATIERES_ORIENTATION,
  detecterMatiereChoisie,
  estChoixMatiere,
  construireReponseChoixMatiere,
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
