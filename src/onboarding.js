
// =========================================================
// ONBOARDING – INSCRIPTION ET PROFIL ÉLÈVE
// =========================================================

const { HEADER_MWALIMU, SEPARATOR } = require("./constants");
const { envoyerWhatsApp } = require("./whatsapp");
const { nettoyer, normaliserNom } = require("./utils");
const { getUser, createUser, updateUserField } = require("./db");

async function traiterOnboarding({ from, user, texteUtilisateur }) {
  if (!user) {
    await createUser(from);
    user = await getUser(from);

    await envoyerWhatsApp(from, `${HEADER_MWALIMU}
${SEPARATOR}
🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.
🟡 Quel est ton *prénom* ?`);

    return { handled: true, user };
  }

  if (!user.nom) {
    const nom = normaliserNom(nettoyer(texteUtilisateur));

    if (!nom) {
      await envoyerWhatsApp(from, `${HEADER_MWALIMU}
${SEPARATOR}
🟡 Donne-moi simplement ton *prénom*, s'il te plaît.`);

      return { handled: true, user };
    }

    await updateUserField(from, "nom", nom);
    user = await getUser(from);

    await envoyerWhatsApp(from, `🤝 Enchanté *${nom}* !
🟡 En quelle *classe* es-tu ?`);

    return { handled: true, user };
  }

  if (!user.classe) {
    const classe = normaliserNom(nettoyer(texteUtilisateur));

    if (!classe) {
      await envoyerWhatsApp(from, `🟡 Écris-moi ta *classe* simplement.
Exemple : 6e, 8e, Terminale.`);

      return { handled: true, user };
    }

    await updateUserField(from, "classe", classe);
    user = await getUser(from);

    await envoyerWhatsApp(from, `🟡 C'est bien noté, *${user.nom}*.
❓ Quel est ton plus grand *rêve* professionnel ?`);

    return { handled: true, user };
  }

  if (!user.reve) {
    const reve = normaliserNom(nettoyer(texteUtilisateur));

    if (!reve) {
      await envoyerWhatsApp(from, `❓ Dis-moi simplement ton *rêve* professionnel.
Exemple : avocat, médecin, ingénieur.`);

      return { handled: true, user };
    }

    await updateUserField(from, "reve", reve);
    user = await getUser(from);

    await envoyerWhatsApp(from, `✨ *Quelle ambition magnifique !*
🔴 Devenir *${reve}* est un rêve noble.
🔵 *Pour commencer notre parcours ensemble :*
👉 Quelle matière ou quel chapitre te pose problème en ce moment ?`);

    return { handled: true, user };
  }

  return { handled: false, user };
}

module.exports = {
  traiterOnboarding
};
