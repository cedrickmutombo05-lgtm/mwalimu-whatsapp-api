
const {
    HEADER_MWALIMU,
    CITATIONS,
    OUVERTURES,
    MOTS_ENCOURAGEMENT,
    SYSTEM_BASE,
    SYSTEM_HUMAIN,
    SYSTEM_TUTORAT
} = require("../constants/messages");

const {
    pick,
    normaliserNom,
    genreEleve,
    construireAppel,
    adapterTexteGenre,
    nettoyerReponseIA,
    appliquerLes4EtapesScientifiques,
    estMessageSalutation,
    estMessageRemerciement,
    estMessageCourtHumain,
    estMessageRelationnelSimple,
    estSoumissionReponse,
    estQuestionTechnique,
    construirePhraseRetourMemoire
} = require("../utils/helpers");

/* =========================================================
   FICHIER : core/mwalimu.js
   RÔLE : cœur pédagogique léger de Mwalimu
========================================================= */

function humaniserDebutReponse(texte = "") {
    if (!texte) return "";
    return String(texte).trim();
}

function verifierStructureMwalimu(corps = "", user = {}, historique = [], question = "") {
    let t = String(corps || "").trim();

    const aVecu = /🔵\s*\[VÉCU\]/i.test(t);
    const aSavoir = /🟡\s*\[SAVOIR\]/i.test(t);
    const aInspiration = /🔴\s*\[INSPIRATION\]/i.test(t);
    const aConsolidation = /❓\s*\[CONSOLIDATION\]/i.test(t);

    if (aVecu && aSavoir && aInspiration && aConsolidation) {
        return t;
    }

    const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";
    const phraseRetour = construirePhraseRetourMemoire(historique, question, user);

    const vecu = aVecu
        ? ""
        : (phraseRetour || `🔵 [VÉCU] :Je suis heureux de continuer cet échange avec toi, ${prenom}. Prenons le temps de bien comprendre ensemble.`);

    const savoir = aSavoir
        ? ""
        : `🟡 [SAVOIR] :Voici l’idée essentielle à retenir sur cette question.`;

    const inspiration = aInspiration
        ? ""
        : `🔴 [INSPIRATION] :Chaque notion bien comprise renforce ton intelligence et ta confiance.`;

    const consolidation = aConsolidation
        ? ""
        : `❓ [CONSOLIDATION] :Veux-tu maintenant essayer de reformuler cela avec tes propres mots, ou répondre à une petite question sur ce point ?`;

    const morceaux = [];
    if (!aVecu) morceaux.push(vecu);
    morceaux.push(t);
    if (!aSavoir) morceaux.push(savoir);
    if (!aInspiration) morceaux.push(inspiration);
    if (!aConsolidation) morceaux.push(consolidation);

    return morceaux.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function construireConsignePedagogique(texte = "", type = "text") {
    const t = String(texte || "");

    if (type === "image") {
        return `MODE PÉDAGOGIQUE IMAGE :- Il s'agit probablement d'un exercice envoyé en image- Tu dois d'abord recopier fidèlement ce que contient l'image avant d'expliquer- Tu signales honnêtement ce qui est flou ou illisible- Tu expliques la démarche- Tu aides l'élève à comprendre ce qu'il doit faire- Tu ne résous pas tout jusqu'à la réponse finale- Tu termines en demandant à l'élève d'essayer lui-même puis de t'envoyer sa réponse`;
    }

    if (estSoumissionReponse(t)) {
        return `MODE CORRECTION BIENVEILLANTE :- L'élève soumet probablement sa propre réponse- Tu dois d'abord féliciter son effort- Tu vérifies calmement- Tu corriges avec douceur si nécessaire- Tu expliques précisément l'erreur- Tu encourages l'élève avec chaleur`;
    }

    if (estQuestionTechnique(t)) {
        return `MODE EXERCICE GUIDÉ :- C'est un exercice ou un calcul- Tu expliques la méthode- Tu montres seulement le démarrage utile- Tu ne donnes pas la réponse finale complète à la place de l'élève- Tu invites l'élève à continuer- Tu lui demandes ensuite de t'envoyer sa réponse pour vérification`;
    }

    return `MODE ÉCHANGE NORMAL :- Réponds naturellement- Sois humain, chaleureux et utile- Après la réponse, pose une petite question de retour liée au sujet`;
}

function construireReponseHumaineSimple(user = {}, texte = "") {
    const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";
    const appel = `${genreEleve(prenom)} **${prenom}**`;
    const t = String(texte || "").toLowerCase().trim();

    const reponsesSalut = [
        `🔵 [VÉCU] :Bonjour ${appel}. Je suis vraiment heureux de te retrouver.\n\n🟡 [SAVOIR] :Je suis bien là, disponible pour t’accompagner tranquillement aujourd’hui.\n\n🔴 [INSPIRATION] :Chaque échange compte, même un simple bonjour, parce qu’il ouvre la porte à de belles choses.\n\n❓ [CONSOLIDATION] :Comment vas-tu, et sur quoi veux-tu qu’on avance ensemble ?`,
        `🔵 [VÉCU] :Bonsoir ${appel}. Cela me fait plaisir de te lire.\n\n🟡 [SAVOIR] :Nous pouvons prendre ce moment calmement et avancer à ton rythme.\n\n🔴 [INSPIRATION] :On progresse souvent mieux quand on garde un cœur paisible et une pensée claire.\n\n❓ [CONSOLIDATION] :Veux-tu simplement me saluer, ou bien as-tu une question à me confier ?`
    ];

    const reponsesMerci = [
        `🔵 [VÉCU] :Avec plaisir, ${appel}. Cela me fait vraiment plaisir de pouvoir t’aider.\n\n🟡 [SAVOIR] :Je reste disponible chaque fois que tu as besoin d’une explication ou d’un accompagnement.\n\n🔴 [INSPIRATION] :La gratitude et la constance sont de belles forces dans le chemin de l’apprentissage.\n\n❓ [CONSOLIDATION] :Veux-tu qu’on continue, ou préfères-tu reprendre plus tard ?`,
        `🔵 [VÉCU] :Je t’en prie, ${appel}. Merci aussi pour ta confiance.\n\n🟡 [SAVOIR] :Tu peux revenir sans hésiter chaque fois qu’un point n’est pas encore clair.\n\n🔴 [INSPIRATION] :Les élèves qui osent demander finissent souvent par comprendre plus solidement.\n\n❓ [CONSOLIDATION] :Y a-t-il encore un point que tu veux revoir avec moi ?`
    ];

    const reponsesBonneNuit = [
        `🔵 [VÉCU] :Bonne nuit ${appel}. Merci pour ce moment partagé.\n\n🟡 [SAVOIR] :Le repos aide aussi l’esprit à mieux retenir et à revenir plus fort.\n\n🔴 [INSPIRATION] :Un élève qui sait aussi se reposer construit un apprentissage plus solide.\n\n❓ [CONSOLIDATION] :Reviens quand tu voudras ; nous continuerons ensemble avec calme.`,
        `🔵 [VÉCU] :Bonne soirée ${appel}. Je suis content d’avoir échangé avec toi.\n\n🟡 [SAVOIR] :Tu peux maintenant te reposer tranquillement.\n\n🔴 [INSPIRATION] :Demain sera encore une belle occasion d’apprendre avec confiance.\n\n❓ [CONSOLIDATION] :Je resterai disponible quand tu voudras reprendre.`
    ];

    const reponsesCourtes = [
        `🔵 [VÉCU] :Très bien ${appel}.\n\n🟡 [SAVOIR] :Je te suis et je reste disponible pour la suite.\n\n🔴 [INSPIRATION] :Même les petits échanges entretiennent la confiance et la progression.\n\n❓ [CONSOLIDATION] :Que veux-tu faire maintenant ?`,
        `🔵 [VÉCU] :D’accord ${appel}, je suis avec toi.\n\n🟡 [SAVOIR] :Nous pouvons avancer simplement, sans nous presser.\n\n🔴 [INSPIRATION] :La régularité dans les petits pas produit souvent de grands résultats.\n\n❓ [CONSOLIDATION] :Quelle est la suite pour toi ?`
    ];

    if (t === "bonne nuit" || t === "bonne soirée" || t === "bonne soiree" || t === "à demain" || t === "a demain") {
        return pick(reponsesBonneNuit);
    }

    if (estMessageRemerciement(t)) {
        return pick(reponsesMerci);
    }

    if (estMessageSalutation(t)) {
        return pick(reponsesSalut);
    }

    if (estMessageCourtHumain(t)) {
        return pick(reponsesCourtes);
    }

    return "";
}

function choisirOuvertureContextuelle(reponse = "", question = "") {
    const corps = String(reponse || "").toLowerCase();
    const q = String(question || "").toLowerCase().trim();

    if (estMessageRelationnelSimple(q)) {
        if (q.includes("merci")) {
            return "👉 Reviens quand tu veux ; je t’accueillerai toujours avec plaisir.";
        }

        if (
            q.includes("bonne nuit") ||
            q.includes("bonne soirée") ||
            q.includes("bonne soiree") ||
            q.includes("à demain") ||
            q.includes("a demain")
        ) {
            return "👉 Repose-toi bien, et nous reprendrons ensemble quand tu reviendras.";
        }

        return "👉 Je reste disponible pour toi, dès que tu veux continuer.";
    }

    if (estQuestionTechnique(q)) {
        return "👉 Essaie maintenant de continuer, puis envoie-moi ta réponse pour que je la vérifie avec toi.";
    }

    if (
        corps.includes("bravo") ||
        corps.includes("bonne réponse") ||
        corps.includes("bonne reponse") ||
        corps.includes("félicit") ||
        corps.includes("felicit")
    ) {
        return "👉 Tu avances bien. On peut continuer ensemble avec la suite.";
    }

    return pick(OUVERTURES);
}

function choisirEncouragementContextuel(reponse = "", question = "") {
    const corps = String(reponse || "").toLowerCase();
    const q = String(question || "").toLowerCase().trim();

    if (estMessageRelationnelSimple(q)) {
        if (q.includes("merci")) {
            return "🌟 Mot d'encouragement : Garde cette belle habitude d’échanger avec confiance et respect.";
        }

        if (
            q.includes("bonne nuit") ||
            q.includes("bonne soirée") ||
            q.includes("bonne soiree") ||
            q.includes("à demain") ||
            q.includes("a demain")
        ) {
            return "🌟 Mot d'encouragement : Le repos fait aussi partie d’un apprentissage équilibré et solide.";
        }

        return "🌟 Mot d'encouragement : Une relation simple, respectueuse et confiante aide aussi à bien apprendre.";
    }

    if (estQuestionTechnique(q)) {
        return "🌟 Mot d'encouragement : Continue avec méthode ; en travaillant étape par étape, tu peux trouver toi-même la bonne réponse.";
    }

    if (
        corps.includes("bonne réponse") ||
        corps.includes("bonne reponse") ||
        corps.includes("bravo") ||
        corps.includes("félicit") ||
        corps.includes("felicit")
    ) {
        return "🌟 Mot d'encouragement : Bravo pour ton effort ; tu avances réellement, et cela fait plaisir à voir.";
    }

    return pick(MOTS_ENCOURAGEMENT);
}

function choisirCitationContextuelle(reponse = "", question = "") {
    const t = `${reponse} ${question}`.toLowerCase();

    if (t.includes("merci") || t.includes("bonjour") || t.includes("bonsoir") || t.includes("bonne nuit") || t.includes("à demain") || t.includes("a demain")) {
        return pick(CITATIONS.relationnel);
    }

    if (t.includes("impôt") || t.includes("impot") || t.includes("taxe") || t.includes("civisme") || t.includes("citoyen")) {
        return pick(CITATIONS.civisme);
    }

    if (t.includes("géographie") || t.includes("geographie") || t.includes("pays") || t.includes("frontière") || t.includes("frontiere") || t.includes("népal") || t.includes("nepal") || t.includes("chine")) {
        return pick(CITATIONS.geographie);
    }

    if (t.includes("math") || t.includes("calcul") || t.includes("équation") || t.includes("equation") || t.includes("fraction") || t.includes("racine")) {
        return pick(CITATIONS.mathematiques);
    }

    if (t.includes("physique") || t.includes("chimie") || t.includes("science") || t.includes("sciences")) {
        return pick(CITATIONS.sciences);
    }

    if (t.includes("histoire") || t.includes("roi") || t.includes("date") || t.includes("indépendance") || t.includes("independance")) {
        return pick(CITATIONS.histoire);
    }

    if (t.includes("français") || t.includes("francais") || t.includes("grammaire") || t.includes("conjugaison") || t.includes("orthographe")) {
        return pick(CITATIONS.francais);
    }

    if (t.includes("congo") || t.includes("rdc") || t.includes("patrie") || t.includes("nation")) {
        return pick(CITATIONS.patriotisme);
    }

    return pick(CITATIONS.general);
}

function construireSystemPrompt(user = {}) {
    const appelEleve = construireAppel(user);
    const classe = user?.classe ? `Classe de l'élève : ${user.classe}` : "Classe non précisée";
    const reve = user?.reve ? `Rêve de l'élève : ${user.reve}` : "Rêve non précisé";

    return `${SYSTEM_BASE}${SYSTEM_HUMAIN}${SYSTEM_TUTORAT}
PERSONNALISATION :
- Adresse l'élève ainsi : ${appelEleve}
- ${classe}
- ${reve}

INTERDICTION :
- Ne dis pas "mon élève"
- Utilise naturellement le prénom quand c'est utile
- Ne donne pas une réponse froide de moteur de recherche
- Ne saute pas à la conclusion
- Ne répète jamais le header Mwalimu
- Ne génère jamais une citation finale
- Ne génère jamais une deuxième ouverture finale
- Ne génère jamais un mot d'encouragement final
- Ne termine jamais un exercice complet à la place de l'élève`;
}

function construireMessageFinal(user = {}, reponseBrute = "", historique = [], question = "", fiche = null) {
    const reponseNettoyee = nettoyerReponseIA(reponseBrute);
    const sortieScientifique = appliquerLes4EtapesScientifiques(reponseNettoyee, question, fiche);
    const reponseHumanisee = humaniserDebutReponse(sortieScientifique.texte);
    const corpsAvecStructure = verifierStructureMwalimu(reponseHumanisee, user, historique, question);
    const corps = adapterTexteGenre(corpsAvecStructure, user.nom);

    const ouverture = adapterTexteGenre(
        choisirOuvertureContextuelle(corps, question),
        user.nom
    );

    const encouragement = choisirEncouragementContextuel(corps, question);
    const citation = choisirCitationContextuelle(corps, question);

    return `${HEADER_MWALIMU}${corps}${ouverture}${encouragement}${citation}`;
}

function messageSecours(user = {}) {
    const appel = `${genreEleve(user?.nom || "élève")} **${normaliserNom(user?.nom || "élève").split(" ")[0]}**`;

    return `${HEADER_MWALIMU}
🔵 [VÉCU] :J'ai bien reçu ton message, ${appel}.

🟡 [SAVOIR] :Je rencontre un petit souci technique pour traiter ta demande correctement maintenant.

🔴 [INSPIRATION] :Même quand cela bloque un peu, on peut reprendre avec calme et méthode.

❓ [CONSOLIDATION] :Réessaie dans un instant, ou reformule ta question plus simplement. Tu peux aussi m'envoyer une seule question à la fois.

👉 Je reste à tes côtés.
🌟 Mot d'encouragement : Même quand cela bloque un peu, on continue avec calme et méthode.
${pick(CITATIONS.general)}`;
}

module.exports = {
    construireSystemPrompt,
    construireConsignePedagogique,
    construireReponseHumaineSimple,
    verifierStructureMwalimu,
    construireMessageFinal,
    messageSecours,
    humaniserDebutReponse,
    choisirOuvertureContextuelle,
    choisirEncouragementContextuel,
    choisirCitationContextuelle
};
