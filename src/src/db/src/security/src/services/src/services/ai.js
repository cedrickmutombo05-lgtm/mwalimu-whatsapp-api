/* =========================================================
   7) IA : BIBLIOTHÈQUE / AUDIO / IMAGE / TEXTE
========================================================= */

async function consulterBibliotheque(question = "", classe = "") {
    try {
        const q = `
            SELECT id, titre, matiere, classe, contenu
            FROM bibliotheque
            WHERE (
                unaccent(lower(coalesce(titre, ''))) LIKE unaccent(lower($1))
                OR unaccent(lower(coalesce(matiere, ''))) LIKE unaccent(lower($1))
                OR unaccent(lower(coalesce(mots_cles, ''))) LIKE unaccent(lower($1))
                OR unaccent(lower(coalesce(contenu, ''))) LIKE unaccent(lower($1))
            )
            AND ($2 = '' OR unaccent(lower(coalesce(classe, ''))) LIKE unaccent(lower($3)))
            ORDER BY id DESC
            LIMIT 1
        `;

        const motifQuestion = `%${question}%`;
        const motifClasse = `%${classe}%`;

        const { rows } = await pool.query(q, [motifQuestion, classe || "", motifClasse]);
        return rows[0] || null;
    } catch (e) {
        console.error("Erreur consulterBibliotheque:", e.message);
        return null;
    }
}

async function transcrireAudioAvecIA(audioBuffer, mimeType = "audio/ogg") {
    const extMap = {
        "audio/ogg": ".ogg",
        "audio/opus": ".ogg",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
        "audio/mp4": ".m4a",
        "audio/aac": ".aac",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav"
    };

    const ext = extMap[mimeType] || ".ogg";
    const tempPath = path.join(os.tmpdir(), `mwalimu_${Date.now()}${ext}`);

    try {
        fs.writeFileSync(tempPath, audioBuffer);

        const transcript = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempPath),
            model: "whisper-1"
        });

        return String(transcript?.text || "").trim();
    } finally {
        try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {}
    }
}

async function appelerChatCompletion(messages) {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages
    });
    return completion.choices?.[0]?.message?.content?.trim() || "";
}

function construireSystemPrompt(user) {
    const appelEleve = construireAppel(user);
    const classe = user?.classe ? `Classe de l'élève : ${user.classe}` : "Classe non précisée";
    const reve = user?.reve ? `Rêve de l'élève : ${user.reve}` : "Rêve non précisé";

    return `
${SYSTEM_BASE}

${SYSTEM_HUMAIN}

${SYSTEM_TUTORAT}

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
- Ne termine jamais un exercice complet à la place de l'élève
`;
}

async function expliquerFiche(user, fiche, questionEleve, historique = [], consignePedagogique = "") {
    const system = construireSystemPrompt(user);

    return appelerChatCompletion([
        { role: "system", content: system },
        { role: "system", content: "Réponds comme un humain chaleureux, jamais comme une machine." },
        { role: "system", content: consignePedagogique || "Sois pédagogique et bienveillant." },
        ...historique.slice(-6),
        {
            role: "user",
            content: `
QUESTION DE L'ÉLÈVE :
${questionEleve}

FICHE DE BIBLIOTHÈQUE :
Titre : ${fiche?.titre || "Sans titre"}
Matière : ${fiche?.matiere || "Non précisée"}
Classe : ${fiche?.classe || "Non précisée"}

Contenu :
${fiche?.contenu || ""}
`
        }
    ]);
}

async function repondreSansFiche(user, texte, historique = [], consignePedagogique = "") {
    const system = construireSystemPrompt(user);

    return appelerChatCompletion([
        { role: "system", content: system },
        { role: "system", content: "Réponds comme un humain chaleureux, jamais comme une machine." },
        { role: "system", content: consignePedagogique || "Sois pédagogique et bienveillant." },
        ...historique.slice(-6),
        { role: "user", content: texte }
    ]);
}

async function expliquerImageAvecIA(user, base64Image, mimeType, historique = []) {
    const system = construireSystemPrompt(user);
    const consignePedagogique = construireConsignePedagogique("", "image");

    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
            { role: "system", content: system },
            { role: "system", content: "Réponds comme un humain chaleureux, jamais comme une machine." },
            { role: "system", content: consignePedagogique },
            ...historique.slice(-4),
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Analyse cette image d'exercice ou de leçon. Explique pas à pas, aide l'élève à comprendre, mais ne fais pas tout l'exercice complet à sa place. Invite-le ensuite à essayer lui-même puis à t'envoyer sa réponse."
                    },
                    {
                        type: "image_url",
                        image_url: { url: `data:${mimeType};base64,${base64Image}` }
                    }
                ]
            }
        ]
    });

    return completion.choices?.[0]?.message?.content?.trim() || "";
}

function construireMessageFinal(user, reponseBrute, historique = [], question = "", fiche = null) {
    const reponseNettoyee = nettoyerReponseIA(reponseBrute);
    const sortieScientifique = appliquerLes4EtapesScientifiques(reponseNettoyee, question, fiche);
    const reponseHumanisee = humaniserDebutReponse(sortieScientifique.texte, user);
    const corpsAvecStructure = verifierStructureMwalimu(reponseHumanisee, user, historique, question);
    const corps = adapterTexteGenre(corpsAvecStructure, user.nom);

    const ouverture = adapterTexteGenre(
        choisirOuvertureContextuelle(corps, user, question),
        user.nom
    );

    const encouragement = choisirEncouragementContextuel(corps, user, question);
    const citation = choisirCitationContextuelle(corps, question, user);

    return `${HEADER_MWALIMU}

${corps}

${ouverture}

${encouragement}

${citation}`;
}

function messageSecours(user) {
    const appel = `${genreEleve(user?.nom || "élève")} **${normaliserNom(user?.nom || "élève").split(" ")[0]}**`;
    return `${HEADER_MWALIMU}

🔵 [VÉCU] :
J'ai bien reçu ton message, ${appel}.

🟡 [SAVOIR] :
Je rencontre un petit souci technique pour traiter ta demande correctement maintenant.

🔴 [INSPIRATION] :
Même quand cela bloque un peu, on peut reprendre avec calme et méthode.

❓ [CONSOLIDATION] :
Réessaie dans un instant, ou reformule ta question plus simplement. Tu peux aussi m'envoyer une seule question à la fois.

👉 Je reste à tes côtés.

🌟 Mot d'encouragement : Même quand cela bloque un peu, on continue avec calme et méthode.

${pick(CITATIONS.general)}`;
}
