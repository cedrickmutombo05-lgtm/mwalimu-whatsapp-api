

const db = require("../db");
const whatsapp = require("../services/whatsapp");
const { logInfo, logError } = require("../core/logger");
const { traiterTexte } = require("./textProcessor");
const { traiterCommande } = require("./commands");
const { traiterIntentionsProfil } = require("./intentions");

let onboardingProcessor = {};
try {
  onboardingProcessor = require("./onboarding");
} catch (_) {
  onboardingProcessor = {};
}

let formatting = {};
try {
  formatting = require("./formatting");
} catch (_) {
  formatting = {};
}

let audioProcessor = {};
try {
  audioProcessor = require("./audioProcessor");
} catch (_) {
  audioProcessor = {};
}

let imageProcessor = {};
try {
  imageProcessor = require("./imageProcessor");
} catch (_) {
  imageProcessor = {};
}

const HEADER_MWALIMU = `🔴🟡🔵 *Mwalimu EdTech : Ton Mentor pour l'Excellence 🇨🇩*
────────────────`;

function contientHeaderMwalimu(texte = "") {
  const t = String(texte || "");
  return (
    t.includes("🔴🟡🔵") ||
    /Mwalimu EdTech\s*:\s*Ton Mentor/i.test(t)
  );
}

function ajouterHeaderPedagogique(texte = "") {
  const reponse = String(texte || "").trim();
  if (!reponse) return "";
  if (contientHeaderMwalimu(reponse)) return reponse;

  return `${HEADER_MWALIMU}
${reponse}`;
}

function contientFuiteInterneIA(texte = "") {
  const t = String(texte || "").toLowerCase();

  return (
    t.includes("tool_code") ||
    t.includes("google_search") ||
    t.includes("google_search.search") ||
    t.includes("queries=") ||
    t.includes("print(") ||
    t.includes("thought") ||
    t.includes("here's a plan") ||
    t.includes("heres a plan") ||
    t.includes("the user wants") ||
    t.includes("i need to") ||
    t.includes("i will") ||
    t.includes("i should") ||
    t.includes("provided context") ||
    t.includes("mwalimu edtech persona") ||
    t.includes("use a warm") ||
    t.includes("rigorous, pedagogical") ||
    t.includes("benevolent tone") ||
    t.includes("guide without doing") ||
    t.includes("explain like a real tutor") ||
    t.includes("use a human") ||
    t.includes("motivating, and respectful tone") ||
    t.includes("adapt the level") ||
    t.includes("refer to the drc") ||
    t.includes("school context") ||
    t.includes("keep the response") ||
    t.includes("clear, natural, and brief") ||
    t.includes("avoid repetitions") ||
    t.includes("being verbose") ||
    t.includes("not over-praise") ||
    t.includes("start human") ||
    t.includes("use the student's name") ||
    t.includes("student's name naturally") ||
    t.includes("follow the pedagogical structure") ||
    t.includes("ensure that") ||
    t.includes("ask one or two") ||
    t.includes("check dora") ||
    t.includes("dora's understanding") ||
    t.includes("core concepts") ||
    t.includes("do not mention") ||
    t.includes("do not reveal") ||
    /"\s*[^"]+\s+huitième\s+rdc\s*"/i.test(t) ||
    /définition.+huitième.+rdc/i.test(t) ||
    /definition.+huitieme.+rdc/i.test(t)
  );
}

function nettoyerFuiteInterneIA(texte = "") {
  let t = String(texte || "").trim();

  if (!t) return "";
  if (!contientFuiteInterneIA(t)) return t;

  t = t.replace(/```[\s\S]*?```/g, "");

  t = t.replace(
    /tool_code[\s\S]*?(?=(🔵|🟡|🔴|❓|\[VÉCU\]|\[SAVOIR\]|\[INSPIRATION\]|\[CONSOLIDATION\]|Bonjour|D'accord|Très bien|En fait|La |Le |Les |Un |Une |Voici))/i,
    ""
  );

  t = t.replace(
    /\bthought\b[\s\S]*?(?=(🔵|🟡|🔴|❓|\[VÉCU\]|\[SAVOIR\]|\[INSPIRATION\]|\[CONSOLIDATION\]|Bonjour|D'accord|Très bien|En fait|La |Le |Les |Un |Une |Voici))/i,
    ""
  );

  const lignesInterdites = [
    /tool_code/i,
    /google_search/i,
    /queries=/i,
    /print\(/i,
    /\bthought\b/i,
    /here'?s a plan/i,
    /the user wants/i,
    /i need to/i,
    /i will/i,
    /i should/i,
    /provided context/i,
    /mwalimu edtech persona/i,
    /use a warm/i,
    /rigorous, pedagogical/i,
    /benevolent tone/i,
    /guide without doing/i,
    /explain like a real tutor/i,
    /use a human/i,
    /motivating, and respectful tone/i,
    /adapt the level/i,
    /refer to the drc/i,
    /school context/i,
    /keep the response/i,
    /clear, natural, and brief/i,
    /avoid repetitions/i,
    /being verbose/i,
    /not over-praise/i,
    /start human/i,
    /use the student's name/i,
    /student's name naturally/i,
    /follow the pedagogical structure/i,
    /ensure that/i,
    /ask one or two/i,
    /check dora/i,
    /dora's understanding/i,
    /core concepts/i,
    /do not mention/i,
    /do not reveal/i,
    /définition.+huitième.+rdc/i,
    /definition.+huitieme.+rdc/i,
    /réaction chimique.+huitième/i,
    /reaction chimique.+huitieme/i,
    /^\s*[-•]\s*use\s+/i,
    /^\s*[-•]\s*guide\s+/i,
    /^\s*[-•]\s*explain\s+/i,
    /^\s*[-•]\s*adapt\s+/i,
    /^\s*[-•]\s*refer\s+/i,
    /^\s*[-•]\s*keep\s+/i,
    /^\s*[-•]\s*avoid\s+/i,
    /^\s*[-•]\s*not\s+/i,
    /^\s*[-•]\s*start\s+/i,
    /^\s*[-•]\s*follow\s+/i,
    /^\s*[-•]\s*ensure\s+/i
  ];

  t = t
    .split("\n")
    .filter((ligne) => {
      const l = String(ligne || "").trim();
      if (!l) return true;
      return !lignesInterdites.some((regex) => regex.test(l));
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (contientFuiteInterneIA(t)) return "";
  if (t.length < 40) return "";

  return t;
}

function construireReponseSecurite(user = {}, question = "") {
  const nom = String(user?.nom || "").trim();
  const prenom = nom ? nom.split(/\s+/)[0] : "";
  const appel = prenom ? `**${prenom}**` : "toi";

  return `Je reprends correctement ${appel} 😊

Une erreur de formulation s'est glissée dans la réponse précédente. Reprenons calmement.

Réécris simplement ta demande, par exemple :

**Explique-moi cela simplement.**`;
}

function extrairePhone(msg = {}) {
  return (
    msg.from ||
    msg.phone ||
    msg.sender ||
    msg?.contacts?.[0]?.wa_id ||
    msg?.messages?.[0]?.from ||
    ""
  );
}

function extraireTypeMessage(msg = {}) {
  return (
    msg.type ||
    msg.msgType ||
    msg.message_type ||
    msg?.messages?.[0]?.type ||
    "text"
  );
}

function extraireTexteMessage(msg = {}) {
  return (
    msg?.text?.body ||
    msg?.body ||
    msg?.message ||
    msg?.text ||
    msg?.messages?.[0]?.text?.body ||
    ""
  ).trim();
}

function extraireMediaId(msg = {}) {
  const type = extraireTypeMessage(msg);

  return (
    msg?.[type]?.id ||
    msg?.audio?.id ||
    msg?.image?.id ||
    msg?.document?.id ||
    msg?.messages?.[0]?.[type]?.id ||
    ""
  );
}

async function chargerUtilisateur(phone = "") {
  if (!phone) return { phone };

  const noms = [
    "getOrCreateUser",
    "getOrCreateUtilisateur",
    "findOrCreateUser",
    "findOrCreateUtilisateur",
    "getUserByPhone",
    "getUtilisateurByPhone",
    "getUser",
    "getUtilisateur"
  ];

  for (const nom of noms) {
    const fn = db?.[nom];
    if (typeof fn !== "function") continue;

    try {
      const user = await fn(phone);

      if (user) {
        return {
          ...user,
          phone: user.phone || user.telephone || user.numero || phone
        };
      }
    } catch (_) {
      // On essaie une autre fonction disponible.
    }
  }

  return { phone };
}

async function getHistoriqueSafe(phone = "") {
  const noms = [
    "getHistorique",
    "getHistory",
    "getConversationHistory",
    "getRecentHistory",
    "lireHistorique"
  ];

  for (const nom of noms) {
    const fn = db?.[nom];
    if (typeof fn !== "function") continue;

    try {
      const historique = await fn(phone);
      return Array.isArray(historique) ? historique : [];
    } catch (_) {
      // On continue.
    }
  }

  return [];
}

async function appendHistoriqueSafe(phone = "", role = "", content = "") {
  const noms = [
    "appendHistorique",
    "appendHistory",
    "addHistorique",
    "addHistory",
    "saveMessageHistory",
    "ajouterHistorique"
  ];

  for (const nom of noms) {
    const fn = db?.[nom];
    if (typeof fn !== "function") continue;

    try {
      const historique = await fn(phone, role, content);

      if (Array.isArray(historique)) return historique;

      return await getHistoriqueSafe(phone);
    } catch (_) {
      // On continue.
    }
  }

  return await getHistoriqueSafe(phone);
}

async function traiterOnboardingSafe(phone = "", user = {}, texteUtilisateur = "") {
  const noms = [
    "traiterOnboarding",
    "handleOnboarding",
    "traiterProfilInitial",
    "gererOnboarding"
  ];

  for (const nom of noms) {
    const fn = onboardingProcessor?.[nom];
    if (typeof fn !== "function") continue;

    try {
      const resultat = await fn(phone, user, texteUtilisateur);

      if (resultat?.handled) {
        logInfo("onboarding_handled", {
          phone,
          handler: nom,
          hasResponse: Boolean(resultat?.reponse)
        });

        return resultat;
      }

      return {
        handled: false,
        user: resultat?.user || user
      };
    } catch (err) {
      logError("onboarding_error", err, {
        phone,
        handler: nom
      });

      return {
        handled: false,
        user
      };
    }
  }

  return {
    handled: false,
    user
  };
}

function normaliserPipeline(texte = "") {
  return String(texte || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,!?;:()"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estVraieIntentionProfil(texte = "") {
  const t = normaliserPipeline(texte);

  if (!t) return false;

  return (
    t.includes("mon prenom") ||
    t.includes("mon nom") ||
    t.includes("je m appelle") ||
    t.includes("ma classe") ||
    /^je suis en\s+([1-9]|premiere|deuxieme|troisieme|quatrieme|cinquieme|sixieme|terminale|humanite|humanites|primaire|secondaire)/i.test(t) ||
    t.includes("mon reve") ||
    t.includes("je veux devenir") ||
    t.includes("je voudrais devenir") ||
    t.includes("j aimerais devenir") ||
    t.includes("je souhaite devenir") ||
    t.includes("changer mon profil") ||
    t.includes("modifier mon profil")
  );
}

function extraireReponseDepuisResultat(result = {}) {
  if (!result) return "";

  if (typeof result === "string") {
    return result;
  }

  return (
    result.reponse ||
    result.response ||
    result.message ||
    result.text ||
    ""
  );
}

function resultatSimple(reponse = "") {
  return {
    reponse,
    fiche: null,
    bypassFormat: true
  };
}

async function formaterReponseSiNecessaire(result = {}, user = {}, question = "") {
  const reponseBrute = extraireReponseDepuisResultat(result);

  if (!reponseBrute) return "";

  const reponseNettoyeeDirecte = nettoyerFuiteInterneIA(reponseBrute);

  if (!reponseNettoyeeDirecte) {
    return ajouterHeaderPedagogique(construireReponseSecurite(user, question));
  }

  if (result.bypassFormat) {
    return reponseNettoyeeDirecte;
  }

  const noms = [
    "formaterReponseFinale",
    "formatterReponseFinale",
    "formaterReponse",
    "formatterReponse",
    "formatReponse",
    "formatResponse",
    "formatBotResponse"
  ];

  for (const nom of noms) {
    const fn = formatting?.[nom];
    if (typeof fn !== "function") continue;

    try {
      const sortie = await fn(
        reponseNettoyeeDirecte,
        user,
        question,
        result.fiche || null
      );

      if (typeof sortie === "string" && sortie.trim()) {
        const propre = nettoyerFuiteInterneIA(sortie);

        return ajouterHeaderPedagogique(
          propre || construireReponseSecurite(user, question)
        );
      }

      if (sortie?.reponse) {
        const propre = nettoyerFuiteInterneIA(sortie.reponse);

        return ajouterHeaderPedagogique(
          propre || construireReponseSecurite(user, question)
        );
      }
    } catch (_) {
      // On essaie l'autre forme.
    }

    try {
      const sortie = await fn({
        reponse: reponseNettoyeeDirecte,
        user,
        question,
        fiche: result.fiche || null
      });

      if (typeof sortie === "string" && sortie.trim()) {
        const propre = nettoyerFuiteInterneIA(sortie);

        return ajouterHeaderPedagogique(
          propre || construireReponseSecurite(user, question)
        );
      }

      if (sortie?.reponse) {
        const propre = nettoyerFuiteInterneIA(sortie.reponse);

        return ajouterHeaderPedagogique(
          propre || construireReponseSecurite(user, question)
        );
      }
    } catch (_) {
      // On garde la réponse brute nettoyée.
    }
  }

  return ajouterHeaderPedagogique(reponseNettoyeeDirecte);
}

async function envoyerMessageSafe(phone = "", message = "") {
  if (!phone || !message) return false;

  const noms = [
    "envoyerWhatsApp",
    "sendTextMessage",
    "sendWhatsAppMessage",
    "sendMessage",
    "sendText",
    "envoyerMessageWhatsApp",
    "envoyerMessageTexte",
    "envoyerTexte"
  ];

  for (const nom of noms) {
    const fn = whatsapp?.[nom];
    if (typeof fn !== "function") continue;

    try {
      await fn(phone, message);
      return true;
    } catch (_) {
      // On essaie une autre fonction disponible.
    }
  }

  console.log("Réponse non envoyée, aucune fonction WhatsApp compatible trouvée.");
  return false;
}

async function traiterAudioSafe(user = {}, msg = {}, historique = []) {
  const mediaId = extraireMediaId(msg);

  const noms = [
    "traiterAudio",
    "processAudio",
    "traiterMessageAudio",
    "handleAudio"
  ];

  for (const nom of noms) {
    const fn = audioProcessor?.[nom];
    if (typeof fn !== "function") continue;

    try {
      return await fn(user, msg, historique);
    } catch (_) {
      try {
        return await fn(user, mediaId, historique, msg);
      } catch (err) {
        throw err;
      }
    }
  }

  return resultatSimple(
    "J'ai bien reçu ton audio 😊 Pour l'instant, écris-moi ta question en texte afin que je puisse t'aider correctement."
  );
}

async function traiterImageSafe(user = {}, msg = {}, historique = []) {
  const mediaId = extraireMediaId(msg);

  const noms = [
    "traiterImage",
    "processImage",
    "traiterMessageImage",
    "handleImage"
  ];

  for (const nom of noms) {
    const fn = imageProcessor?.[nom];
    if (typeof fn !== "function") continue;

    try {
      return await fn(user, msg, historique);
    } catch (_) {
      try {
        return await fn(user, mediaId, historique, msg);
      } catch (err) {
        throw err;
      }
    }
  }

  return resultatSimple(
    "J'ai bien reçu l'image 😊 Pour l'instant, décris-moi ce que tu veux comprendre dans cette image."
  );
}

async function traiterMessageEntrant(msg = {}) {
  const phone = extrairePhone(msg);
  const msgType = extraireTypeMessage(msg);

  if (!phone) {
    logInfo("message_sans_phone", {
      msgType
    });

    return null;
  }

  let user = await chargerUtilisateur(phone);

  user = {
    ...user,
    phone
  };

  let questionUtilisateur = "";
  let historique = await getHistoriqueSafe(phone);

  let result = {
    reponse: "",
    fiche: null,
    bypassFormat: false
  };

  try {
    if (msgType === "text") {
      questionUtilisateur = extraireTexteMessage(msg);

      if (!questionUtilisateur) {
        return null;
      }

      const commande = await traiterCommande(user, questionUtilisateur);

      if (commande?.handled) {
        result = {
          reponse: commande.reponse,
          fiche: null,
          bypassFormat: true
        };
      } else {
        const onboarding = await traiterOnboardingSafe(
          phone,
          user,
          questionUtilisateur
        );

        if (onboarding?.handled) {
          user = {
            ...(onboarding.user || user),
            phone
          };

          if (onboarding.reponse) {
            result = {
              reponse: onboarding.reponse,
              fiche: onboarding.fiche || null,
              bypassFormat: true
            };

            const reponseFinale = await formaterReponseSiNecessaire(
              result,
              user,
              questionUtilisateur
            );

            if (reponseFinale) {
              await envoyerMessageSafe(phone, reponseFinale);
              await appendHistoriqueSafe(phone, "user", questionUtilisateur);
              await appendHistoriqueSafe(phone, "assistant", reponseFinale);
            }

            return {
              ok: true,
              phone,
              msgType,
              onboarding: true,
              reponse: reponseFinale || ""
            };
          }

          return {
            ok: true,
            phone,
            msgType,
            onboarding: true
          };
        }

        user = {
          ...(onboarding?.user || user),
          phone
        };

        historique = await appendHistoriqueSafe(
          phone,
          "user",
          questionUtilisateur
        );

        if (estVraieIntentionProfil(questionUtilisateur)) {
          const profil = await traiterIntentionsProfil(
            user,
            questionUtilisateur
          );

          if (profil?.handled) {
            user = {
              ...(profil.user || user),
              phone
            };

            result = {
              reponse: profil.reponse,
              fiche: profil.fiche || null,
              bypassFormat: true
            };
          } else {
            result = await traiterTexte(
              user,
              questionUtilisateur,
              historique
            );
          }
        } else {
          result = await traiterTexte(
            user,
            questionUtilisateur,
            historique
          );
        }
      }
    } else if (msgType === "audio" || msgType === "voice") {
      questionUtilisateur = "[audio]";

      historique = await appendHistoriqueSafe(
        phone,
        "user",
        questionUtilisateur
      );

      result = await traiterAudioSafe(
        user,
        msg,
        historique
      );
    } else if (msgType === "image") {
      questionUtilisateur = "[image]";

      historique = await appendHistoriqueSafe(
        phone,
        "user",
        questionUtilisateur
      );

      result = await traiterImageSafe(
        user,
        msg,
        historique
      );
    } else {
      result = resultatSimple(
        "J'ai bien reçu ton message 😊 Pour l'instant, envoie-moi ta question en texte, audio ou image."
      );
    }

    const reponseFinale = await formaterReponseSiNecessaire(
      result,
      user,
      questionUtilisateur
    );

    if (!reponseFinale) {
      const fallback =
        "Je rencontre un petit souci technique pour traiter ta demande correctement maintenant. Réessaie dans un instant.";

      await envoyerMessageSafe(phone, fallback);
      await appendHistoriqueSafe(phone, "assistant", fallback);

      return {
        ok: false,
        phone,
        reponse: fallback
      };
    }

    await envoyerMessageSafe(phone, reponseFinale);
    await appendHistoriqueSafe(phone, "assistant", reponseFinale);

    return {
      ok: true,
      phone,
      msgType,
      reponse: reponseFinale
    };
  } catch (err) {
    if (typeof logError === "function") {
      logError("traiter_message_entrant", err, {
        phone,
        msgType
      });
    } else {
      console.error("traiter_message_entrant", err);
    }

    const fallback =
      "Je rencontre un petit souci technique pour traiter ta demande correctement maintenant. Réessaie dans un instant.";

    await envoyerMessageSafe(phone, fallback);

    return {
      ok: false,
      phone,
      msgType,
      error: err?.message || String(err)
    };
  }
}

module.exports = {
  traiterMessageEntrant,
  extrairePhone,
  extraireTypeMessage,
  extraireTexteMessage,
  extraireMediaId,
  chargerUtilisateur,
  getHistoriqueSafe,
  appendHistoriqueSafe,
  envoyerMessageSafe,
  traiterOnboardingSafe,
  estVraieIntentionProfil,
  ajouterHeaderPedagogique,
  contientHeaderMwalimu,
  contientFuiteInterneIA,
  nettoyerFuiteInterneIA
};
