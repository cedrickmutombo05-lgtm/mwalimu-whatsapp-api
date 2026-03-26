
/* =========================================================
   3) OUTILS SIMPLES
========================================================= */

function pick(arr = []) {
    if (!arr.length) return "";
    return arr[Math.floor(Math.random() * arr.length)];
}

function safeJsonParse(v, fallback) {
    try {
        return JSON.parse(v);
    } catch {
        return fallback;
    }
}

function supprimerDoublonsLignes(texte = "") {
    if (!texte) return "";

    const lignes = String(texte)
        .split("\n")
        .map(l => l.trimEnd());

    const resultat = [];
    let precedenteNormalisee = "";

    for (const ligne of lignes) {
        const normalisee = ligne.trim().toLowerCase();
        if (normalisee && normalisee === precedenteNormalisee) {
            continue;
        }
        resultat.push(ligne);
        precedenteNormalisee = normalisee;
    }

    return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function nettoyerReponseIA(texte = "") {
    if (!texte) return "";

    let t = String(texte);

    t = t.replace(/🔴🟡🔵\s*\*\*Mwalimu EdTech\s*:\s*Ton Mentor pour l'Excellence\*\*\s*🇨🇩/gi, "");
    t = t.replace(/\*\*\*«[^»]+»\*\*\*/g, "");
    t = t.replace(/^\s*🌟\s*\*?\*?\s*\[?MOT D['’]ENCOURAGEMENT\]?\s*\*?\*?\s*:\s*.*$/gim, "");
    t = t.replace(/^\s*🌟\s*Mot d['’]encouragement\s*:\s*.*$/gim, "");
    t = t.replace(/^\s*👉\s*\*?\*?\s*\[?OUVERTURE\]?\s*\*?\*?\s*:\s*.*$/gim, "");
    t = t.replace(/^\s*👉\s*Je suis fier de ton effort\..*$/gim, "");
    t = t.replace(/^\s*Continue à poser des questions.*$/gim, "");
    t = t.replace(/^\s*🔵\s*\*?\*?\[ACCUEIL\]\*?\*?\s*:\s*/gim, "🔵 ");

    t = t.replace(/^\s*👉\s*N['’]hésite pas à m['’]envoyer ta réponse.*$/gim, "");
    t = t.replace(/^\s*👉\s*Essaie maintenant de continuer.*$/gim, "");
    t = t.replace(/^\s*👉\s*Garde confiance.*$/gim, "");
    t = t.replace(/^\s*🌟\s*Continue à poser des questions.*$/gim, "");
    t = t.replace(/🔴🟡🔵\s*\*\*Mwalimu EdTech\s*:\s*Ton Mentor pour l'Excellence\*\*\s*🇨🇩/gi, "");

    t = supprimerDoublonsLignes(t);
    t = t.replace(/\n{3,}/g, "\n\n").trim();

    return t;
}

function simplifierNotationMath(texte = "") {
    if (!texte) return "";

    let t = String(texte);

    t = t.replace(/\\\[/g, "");
    t = t.replace(/\\\]/g, "");
    t = t.replace(/\\\(/g, "");
    t = t.replace(/\\\)/g, "");

    t = t.replace(/\\times/g, "×");
    t = t.replace(/\\div/g, "/");
    t = t.replace(/\\pm/g, "±");
    t = t.replace(/\\cdot/g, "×");
    t = t.replace(/\\leq/g, "≤");
    t = t.replace(/\\geq/g, "≥");
    t = t.replace(/\\neq/g, "≠");
    t = t.replace(/\\approx/g, "≈");

    t = t.replace(/\\sqrt\{([^}]+)\}/g, "√$1");
    t = t.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1 / $2");

    t = t.replace(/\^2/g, "²");
    t = t.replace(/\^3/g, "³");
    t = t.replace(/10\^([0-9]+)/g, "10^$1");

    t = t.replace(/[{}]/g, "");
    t = t.replace(/\(\s*([^)]+)\s*\)\s*\/\s*\(\s*([^)]+)\s*\)/g, "$1 / $2");

    t = t.replace(/\s*×\s*/g, " × ");
    t = t.replace(/\s*=\s*/g, " = ");
    t = t.replace(/\s*\+\s*/g, " + ");
    t = t.replace(/\s*-\s*/g, " - ");
    t = t.replace(/\s*\/\s*/g, " / ");

    t = t.replace(/\bv\s*=\s*d\s*\/\s*t\b/g, "v = d / t");
    t = t.replace(/\bV\s*=\s*d\s*\/\s*t\b/g, "v = d / t");
    t = t.replace(/\bF\s*=\s*m\s*×\s*a\b/g, "F = m × a");
    t = t.replace(/\bP\s*=\s*U\s*×\s*I\b/g, "P = U × I");
    t = t.replace(/\bC\s*=\s*n\s*\/\s*V\b/g, "C = n / V");
    t = t.replace(/\bm\s*=\s*n\s*×\s*M\b/g, "m = n × M");
    t = t.replace(/\bρ\s*=\s*m\s*\/\s*V\b/g, "ρ = m / V");

    t = t.replace(/\bcm2\b/g, "cm²");
    t = t.replace(/\bcm3\b/g, "cm³");
    t = t.replace(/\bm2\b/g, "m²");
    t = t.replace(/\bm3\b/g, "m³");
    t = t.replace(/\bkm2\b/g, "km²");
    t = t.replace(/\bmm2\b/g, "mm²");
    t = t.replace(/\bmm3\b/g, "mm³");

    t = t.replace(/\bm\/s2\b/g, "m/s²");
    t = t.replace(/\bm\/s3\b/g, "m/s³");
    t = t.replace(/\bcm\/s2\b/g, "cm/s²");
    t = t.replace(/\bkg\/m3\b/g, "kg/m³");
    t = t.replace(/\bg\/cm3\b/g, "g/cm³");
    t = t.replace(/\bmol\/L\b/gi, "mol/L");
    t = t.replace(/\bg\/L\b/gi, "g/L");
    t = t.replace(/\bmg\/L\b/gi, "mg/L");

    t = t.replace(/\bH2O\b/g, "H₂O");
    t = t.replace(/\bCO2\b/g, "CO₂");
    t = t.replace(/\bO2\b/g, "O₂");
    t = t.replace(/\bN2\b/g, "N₂");
    t = t.replace(/\bH2\b/g, "H₂");
    t = t.replace(/\bCl2\b/g, "Cl₂");
    t = t.replace(/\bNa2CO3\b/g, "Na₂CO₃");
    t = t.replace(/\bCaCO3\b/g, "CaCO₃");
    t = t.replace(/\bH2SO4\b/g, "H₂SO₄");
    t = t.replace(/\bHNO3\b/g, "HNO₃");
    t = t.replace(/\bNH3\b/g, "NH₃");
    t = t.replace(/\bCH4\b/g, "CH₄");
    t = t.replace(/\bSO2\b/g, "SO₂");
    t = t.replace(/\bSO3\b/g, "SO₃");
    t = t.replace(/\bFe2O3\b/g, "Fe₂O₃");
    t = t.replace(/\bAl2O3\b/g, "Al₂O₃");

    t = t.replace(/<=>/g, "⇌");
    t = t.replace(/=>/g, "→");
    t = t.replace(/->/g, "→");

    t = t.replace(/[ \t]{2,}/g, " ");
    t = t.replace(/\n{3,}/g, "\n\n").trim();

    return t;
}

function simplifierPresentationScientifique(texte = "") {
    if (!texte) return "";

    let t = String(texte);

    t = t.replace(/^\s*-\s*\\?\(/gm, "- ");
    t = t.replace(/^\s*\d+\.\s*\*\*(.*?)\*\*\s*:\s*/gm, (_, titre) => `${titre} : `);
    t = t.replace(/\b([0-9]+)\.([0-9]+)\b/g, "$1,$2");
    t = t.replace(/\(\s+/g, "(");
    t = t.replace(/\s+\)/g, ")");
    t = t.replace(/\+\s+\+/g, "+");
    t = t.replace(/-\s+-/g, "-");
    t = t.replace(/D\s*=\s*b²\s*-\s*4ac/g, "D = b² - 4ac");
    t = t.replace(/x\s*=\s*\(\s*-b\s*±\s*√D\s*\)\s*\/\s*2a/g, "x = (-b ± √D) / 2a");
    t = t.replace(/[ \t]{2,}/g, " ");
    t = t.replace(/\n{3,}/g, "\n\n").trim();

    return t;
}

function normaliserBaseScientifique(texte = "") {
    if (!texte) return "";

    let t = String(texte);

    t = t.replace(/\u00A0/g, " ");
    t = t.replace(/[‐-‒–—]/g, "-");
    t = t.replace(/…/g, "...");
    t = t.replace(/[ \t]{2,}/g, " ");
    t = t.replace(/\n{3,}/g, "\n\n");

    return t.trim();
}

function nettoyerSpecifiqueMath(texte = "") {
    if (!texte) return "";

    let t = String(texte);

    t = t.replace(/\\times/g, "×");
    t = t.replace(/\\div/g, "/");
    t = t.replace(/\\pm/g, "±");
    t = t.replace(/\\sqrt\{([^}]+)\}/g, "√$1");
    t = t.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1 / $2");

    t = t.replace(/\^2/g, "²");
    t = t.replace(/\^3/g, "³");

    t = t.replace(/D\s*=\s*b²\s*-\s*4ac/gi, "D = b² - 4ac");
    t = t.replace(/x\s*=\s*\(\s*-b\s*±\s*√D\s*\)\s*\/\s*2a/gi, "x = (-b ± √D) / 2a");

    t = t.replace(/\b([0-9]+)\.([0-9]+)\b/g, "$1,$2");
    t = t.replace(/\s*×\s*/g, " × ");
    t = t.replace(/\s*\/\s*/g, " / ");
    t = t.replace(/\s*\+\s*/g, " + ");
    t = t.replace(/\s*-\s*/g, " - ");
    t = t.replace(/\s*=\s*/g, " = ");

    t = t.replace(/[ \t]{2,}/g, " ");
    t = t.replace(/\n{3,}/g, "\n\n");

    return t.trim();
}

function nettoyerSpecifiquePhysique(texte = "") {
    if (!texte) return "";

    let t = String(texte);

    t = t.replace(/\\times/g, "×");
    t = t.replace(/\\div/g, "/");
    t = t.replace(/\^2/g, "²");
    t = t.replace(/\^3/g, "³");

    t = t.replace(/\bv\s*=\s*d\s*\/\s*t\b/gi, "v = d / t");
    t = t.replace(/\bF\s*=\s*m\s*×\s*a\b/g, "F = m × a");
    t = t.replace(/\bP\s*=\s*U\s*×\s*I\b/g, "P = U × I");
    t = t.replace(/\bρ\s*=\s*m\s*\/\s*V\b/g, "ρ = m / V");

    t = t.replace(/\bcm2\b/g, "cm²");
    t = t.replace(/\bcm3\b/g, "cm³");
    t = t.replace(/\bm2\b/g, "m²");
    t = t.replace(/\bm3\b/g, "m³");
    t = t.replace(/\bkm2\b/g, "km²");
    t = t.replace(/\bkg\/m3\b/g, "kg/m³");
    t = t.replace(/\bg\/cm3\b/g, "g/cm³");
    t = t.replace(/\bm\/s2\b/g, "m/s²");
    t = t.replace(/\bm\/s3\b/g, "m/s³");
    t = t.replace(/\bcm\/s2\b/g, "cm/s²");

    t = t.replace(/\b([0-9]+)\.([0-9]+)\b/g, "$1,$2");

    t = t.replace(/\s*×\s*/g, " × ");
    t = t.replace(/\s*\/\s*/g, " / ");
    t = t.replace(/\s*\+\s*/g, " + ");
    t = t.replace(/\s*-\s*/g, " - ");
    t = t.replace(/\s*=\s*/g, " = ");

    t = t.replace(/[ \t]{2,}/g, " ");
    t = t.replace(/\n{3,}/g, "\n\n");

    return t.trim();
}

function nettoyerSpecifiqueChimie(texte = "") {
    if (!texte) return "";

    let t = String(texte);

    t = t.replace(/\\times/g, "×");
    t = t.replace(/\\div/g, "/");
    t = t.replace(/\^2/g, "²");
    t = t.replace(/\^3/g, "³");

    t = t.replace(/\bC\s*=\s*n\s*\/\s*V\b/g, "C = n / V");
    t = t.replace(/\bm\s*=\s*n\s*×\s*M\b/g, "m = n × M");

    t = t.replace(/\bH2O\b/g, "H₂O");
    t = t.replace(/\bCO2\b/g, "CO₂");
    t = t.replace(/\bO2\b/g, "O₂");
    t = t.replace(/\bN2\b/g, "N₂");
    t = t.replace(/\bH2\b/g, "H₂");
    t = t.replace(/\bCl2\b/g, "Cl₂");
    t = t.replace(/\bNa2CO3\b/g, "Na₂CO₃");
    t = t.replace(/\bCaCO3\b/g, "CaCO₃");
    t = t.replace(/\bH2SO4\b/g, "H₂SO₄");
    t = t.replace(/\bHNO3\b/g, "HNO₃");
    t = t.replace(/\bNH3\b/g, "NH₃");
    t = t.replace(/\bCH4\b/g, "CH₄");
    t = t.replace(/\bSO2\b/g, "SO₂");
    t = t.replace(/\bSO3\b/g, "SO₃");
    t = t.replace(/\bFe2O3\b/g, "Fe₂O₃");
    t = t.replace(/\bAl2O3\b/g, "Al₂O₃");

    t = t.replace(/<=>/g, "⇌");
    t = t.replace(/=>/g, "→");
    t = t.replace(/->/g, "→");

    t = t.replace(/\bmol\/L\b/gi, "mol/L");
    t = t.replace(/\bg\/L\b/gi, "g/L");
    t = t.replace(/\bmg\/L\b/gi, "mg/L");

    t = t.replace(/\b([0-9]+)\.([0-9]+)\b/g, "$1,$2");

    t = t.replace(/\s*×\s*/g, " × ");
    t = t.replace(/\s*\/\s*/g, " / ");
    t = t.replace(/\s*\+\s*/g, " + ");
    t = t.replace(/\s*-\s*/g, " - ");
    t = t.replace(/\s*=\s*/g, " = ");
    t = t.replace(/\s*→\s*/g, " → ");
    t = t.replace(/\s*⇌\s*/g, " ⇌ ");

    t = t.replace(/[ \t]{2,}/g, " ");
    t = t.replace(/\n{3,}/g, "\n\n");

    return t.trim();
}

function nettoyerSelonMatiere(texte = "", matiere = MATIERE_GENERAL) {
    const base = normaliserBaseScientifique(texte);

    if (matiere === MATIERE_MATH) {
        return nettoyerSpecifiqueMath(base);
    }

    if (matiere === MATIERE_PHYSIQUE) {
        return nettoyerSpecifiquePhysique(base);
    }

    if (matiere === MATIERE_CHIMIE) {
        return nettoyerSpecifiqueChimie(base);
    }

    return base;
}

function reformaterFinalSelonMatiere(texte = "", matiere = MATIERE_GENERAL) {
    if (!texte) return "";

    let t = String(texte).trim();

    if (matiere === MATIERE_MATH) {
        t = t.replace(/Donnée[s]?\s*:/gi, "Données :");
        t = t.replace(/Méthode\s*:/gi, "Méthode :");
        t = t.replace(/Calcul\s*:/gi, "Calcul :");
        t = t.replace(/Conclusion\s*:/gi, "Conclusion :");
        t = t.replace(/(\bD = b² - 4ac\b)/g, "\n$1");
        t = t.replace(/(\bx = \(-b ± √D\) \/ 2a\b)/g, "\n$1");
    }

    if (matiere === MATIERE_PHYSIQUE) {
        t = t.replace(/Donnée[s]?\s*:/gi, "Données :");
        t = t.replace(/Formule\s*:/gi, "Formule :");
        t = t.replace(/Application\s*:/gi, "Application :");
        t = t.replace(/Unité\s*:/gi, "Unité :");
        t = t.replace(/Conclusion\s*:/gi, "Conclusion :");
    }

    if (matiere === MATIERE_CHIMIE) {
        t = t.replace(/Donnée[s]?\s*:/gi, "Données :");
        t = t.replace(/Formule\s*:/gi, "Formule :");
        t = t.replace(/Réaction\s*:/gi, "Réaction :");
        t = t.replace(/Application\s*:/gi, "Application :");
        t = t.replace(/Conclusion\s*:/gi, "Conclusion :");
    }

    t = t.replace(/\n{3,}/g, "\n\n").trim();
    return t;
}

function detecterMatiereScientifique(question = "", reponse = "", fiche = null) {
    const base = [
        String(question || ""),
        String(reponse || ""),
        String(fiche?.matiere || ""),
        String(fiche?.titre || ""),
        String(fiche?.contenu || "").slice(0, 1200)
    ].join(" ").toLowerCase();

    const indicesChimie = [
        "chimie", "mol", "mole", "moles", "molaire", "molarité", "molarite",
        "concentration", "solution", "soluté", "solute", "solvant",
        "atome", "molécule", "molecule", "ion", "cation", "anion",
        "réaction", "reaction", "équation chimique", "equation chimique",
        "acide", "base", "neutralisation", "ph", "oxydation", "réduction",
        "reduction", "h2o", "co2", "o2", "hcl", "naoh", "h2so4", "hno3",
        "nh3", "ch4", "nacl", "ca co3", "c = n / v", "m = n × m", "m = n x m"
    ];

    const indicesPhysique = [
        "physique", "force", "vitesse", "accélération", "acceleration",
        "mouvement", "énergie", "energie", "puissance", "pression",
        "masse volumique", "densité", "densite", "volume", "distance",
        "temps", "travail", "tension", "intensité", "intensite", "courant",
        "résistance", "resistance", "watt", "newton", "joule", "volt", "ampère",
        "ampere", "ohm", "m/s", "m/s²", "kg/m³", "f = m", "f = m × a",
        "p = u × i", "v = d / t", "ρ = m / v", "ro = m / v"
    ];

    const indicesMath = [
        "math", "maths", "mathématique", "mathematique", "algèbre", "algebre",
        "géométrie", "geometrie", "arithmétique", "arithmetique",
        "équation", "equation", "inéquation", "inequation", "fonction",
        "fraction", "puissance", "racine", "polynôme", "polynome",
        "trinôme", "trinome", "discriminant", "dérivée", "derivee",
        "intégrale", "integrale", "calcul", "résous", "resous", "factorise",
        "développe", "developpe", "simplifie", "x²", "y²", "2x", "3x",
        "a²", "b²", "d = b² - 4ac", "x = (-b ± √d) / 2a"
    ];

    const score = { math: 0, physique: 0, chimie: 0 };

    for (const mot of indicesChimie) {
        if (base.includes(mot)) score.chimie += 2;
    }

    for (const mot of indicesPhysique) {
        if (base.includes(mot)) score.physique += 2;
    }

    for (const mot of indicesMath) {
        if (base.includes(mot)) score.math += 2;
    }

    if (/\b(h2o|co2|o2|n2|hcl|naoh|h2so4|hno3|nh3|ch4|nacl)\b/i.test(base)) {
        score.chimie += 4;
    }

    if (/\b(m\/s|m\/s²|kg\/m³|g\/l|mol\/l|cm²|cm³)\b/i.test(base)) {
        score.physique += 2;
        score.chimie += 1;
    }

    if (/\b(x|y)\s*[²0-9+\-=/]/i.test(base) || /discriminant|trin[oô]me|fraction|racine/i.test(base)) {
        score.math += 3;
    }

    const maxScore = Math.max(score.math, score.physique, score.chimie);
    if (maxScore <= 0) return MATIERE_GENERAL;

    if (score.chimie === maxScore) return MATIERE_CHIMIE;
    if (score.physique === maxScore) return MATIERE_PHYSIQUE;
    if (score.math === maxScore) return MATIERE_MATH;

    return MATIERE_GENERAL;
}

function preparerSortieScientifique(reponse = "", question = "", fiche = null) {
    const matiere = detecterMatiereScientifique(question, reponse, fiche);

    let t = String(reponse || "");
    t = simplifierNotationMath(t);
    t = simplifierPresentationScientifique(t);
    t = nettoyerSelonMatiere(t, matiere);
    t = reformaterFinalSelonMatiere(t, matiere);

    return {
        matiere,
        texte: t
    };
}

function appliquerLes4EtapesScientifiques(reponse = "", question = "", fiche = null) {
    const matiere = detecterMatiereScientifique(question, reponse, fiche);

    let texte = String(reponse || "");

    // Étape 1 : détection matière/type
    const etape1 = matiere;

    // Étape 2 : nettoyage scientifique général
    texte = simplifierNotationMath(texte);
    texte = simplifierPresentationScientifique(texte);

    // Étape 3 : nettoyage spécialisé selon la matière
    texte = nettoyerSelonMatiere(texte, matiere);

    // Étape 4 : reformatage final selon la matière
    texte = reformaterFinalSelonMatiere(texte, matiere);

    return {
        etape1_matiere: etape1,
        etape2_nettoyage_general: true,
        etape3_nettoyage_specialise: true,
        etape4_reformatage_final: true,
        matiere,
        texte
    };
}

function humaniserDebutReponse(texte = "", user = {}) {
    if (!texte) return "";
    return String(texte).trim();
}

function normaliserTexteMemoire(texte = "") {
    return String(texte || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\w\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function estMessageSalutation(texte = "") {
    const t = String(texte || "").toLowerCase().trim();

    if (!t) return false;

    const salutationsExactes = [
        "bonjour",
        "bonsoir",
        "salut",
        "cc",
        "coucou",
        "hello",
        "bjr",
        "bonne nuit",
        "bonne soirée",
        "bonne soiree",
        "à demain",
        "a demain",
        "bon après-midi",
        "bon apres-midi",
        "bon apres midi",
        "bonjour mwalimu",
        "bonsoir mwalimu",
        "salut mwalimu",
        "cc mwalimu",
        "coucou mwalimu",
        "hello mwalimu",
        "bjr mwalimu",
        "mbote",
        "mbote mwalimu"
    ];

    if (salutationsExactes.includes(t)) return true;

    return /^(bonjour|bonsoir|salut|hello|coucou|mbote|bjr)(\s+mwalimu)?[!\s.]*$/i.test(t);
}

function extraireSujetMemoire(texte = "") {
    const brut = String(texte || "").trim();
    const t = normaliserTexteMemoire(brut);

    if (!t) return "";

    if (estMessageRelationnelSimple(brut)) return "";

    const motsASupprimer = [
        "bonjour", "bonsoir", "salut", "hello", "coucou", "mbote",
        "merci", "mwalimu", "cc", "bjr", "bonne nuit", "bonne soiree",
        "a demain", "ca va", "ça va", "ok", "okay", "dac", "d accord"
    ];

    const motsUtiles = t
        .split(" ")
        .filter(Boolean)
        .filter(m => !motsASupprimer.includes(m));

    const texteFiltre = motsUtiles.join(" ").trim();
    if (!texteFiltre) return "";

    const sujets = [
        "nepal", "chine", "geo", "geographie", "math", "mathematiques", "equation",
        "fraction", "histoire", "francais", "grammaire", "impot",
        "taxe", "civisme", "rdc", "congo", "province", "sud kivu", "haut katanga",
        "constitution", "droit", "sciences", "physique", "chimie"
    ];

    for (const s of sujets) {
        if (texteFiltre.includes(s)) return s;
    }

    const mots = texteFiltre.split(" ").filter(Boolean);
    return mots.length ? mots.slice(0, 4).join(" ") : "";
}

function retrouverSujetProche(historique = [], texteActuel = "") {
    const actuel = extraireSujetMemoire(texteActuel);
    if (!actuel) return "";

    for (let i = historique.length - 1; i >= 0; i--) {
        const item = historique[i];
        if (!item || item.role !== "user") continue;

        const contenu = String(item.content || "");
        const ancien = extraireSujetMemoire(contenu);

        if (ancien && (ancien === actuel || contenu.toLowerCase().includes(actuel))) {
            return ancien;
        }
    }

    return "";
}

function construirePhraseRetourMemoire(historique = [], texteActuel = "", user = {}) {
    if (estMessageRelationnelSimple(texteActuel)) return "";

    const sujet = retrouverSujetProche(historique, texteActuel);
    const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";

    if (!sujet) return "";

    const mapEtiquettes = {
        nepal: "le Népal",
        chine: "la Chine",
        geo: "la géographie",
        geographie: "la géographie",
        math: "les mathématiques",
        mathematiques: "les mathématiques",
        equation: "les équations",
        fraction: "les fractions",
        histoire: "l’histoire",
        francais: "le français",
        grammaire: "la grammaire",
        conjugaison: "la conjugaison",
        impot: "l’impôt",
        taxe: "la taxe",
        civisme: "le civisme",
        rdc: "la RDC",
        congo: "le Congo",
        province: "les provinces",
        "sud kivu": "le Sud-Kivu",
        "haut katanga": "le Haut-Katanga",
        constitution: "la Constitution",
        droit: "le droit",
        sciences: "les sciences",
        physique: "la physique",
        chimie: "la chimie"
    };

    const etiquette = mapEtiquettes[sujet] || sujet;

    return `🔵 [VÉCU] :
Je suis content que tu reviennes sur ${etiquette}, ${prenom}. Cela montre que tu veux vraiment bien comprendre, et c’est une très belle attitude.`;
}

function choisirCitationContextuelle(reponse = "", question = "", user = {}) {
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
        : (phraseRetour || `🔵 [VÉCU] :
Je suis heureux de continuer cet échange avec toi, ${prenom}. Prenons le temps de bien comprendre ensemble.`);

    const savoir = aSavoir
        ? ""
        : `🟡 [SAVOIR] :
Voici l’idée essentielle à retenir sur cette question.`;

    const inspiration = aInspiration
        ? ""
        : `🔴 [INSPIRATION] :
Chaque notion bien comprise renforce ton intelligence et ta confiance.`;

    const consolidation = aConsolidation
        ? ""
        : `❓ [CONSOLIDATION] :
Veux-tu maintenant essayer de reformuler cela avec tes propres mots, ou répondre à une petite question sur ce point ?`;

    const morceaux = [];

    if (!aVecu) morceaux.push(vecu);
    morceaux.push(t);
    if (!aSavoir) morceaux.push(savoir);
    if (!aInspiration) morceaux.push(inspiration);
    if (!aConsolidation) morceaux.push(consolidation);

    return morceaux.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function estSoumissionReponse(texte = "") {
    const t = String(texte || "").toLowerCase().trim();

    const indices = [
        "ma réponse",
        "ma reponse",
        "j'ai trouvé",
        "jai trouvé",
        "jai trouve",
        "j'ai trouvé que",
        "j'ai fait",
        "voici ma réponse",
        "voici ma reponse",
        "mon résultat",
        "mon resultat",
        "j'obtiens",
        "j’ai obtenu",
        "j'ai obtenu",
        "le résultat est",
        "le resultat est",
        "ça donne",
        "cela donne"
    ];

    if (indices.some(i => t.includes(i))) return true;
    if (/^[0-9xXyYzZ\s=+\-÷/*().,]+$/.test(t) && t.length <= 80) return true;

    return false;
}

function nettoyer(t) {
    if (!t) return "";
    return String(t)
        .replace(/je m'appelle|mon nom est|mon prénom est|je suis en|ma classe est|mon rêve est|je veux devenir/gi, "")
        .replace(/^devenir\s+/i, "")
        .replace(/^être\s+/i, "")
        .replace(/[.,!?;: ]+/g, " ")
        .trim();
}

function tronquerTexte(texte = "", max = 3500) {
    const t = String(texte || "").trim();
    return t.length <= max ? t : `${t.slice(0, max)}...`;
}

function normaliserNom(nom = "") {
    return String(nom || "").trim().replace(/\s+/g, " ");
}

function genreEleve(nom = "") {
    const prenom = String(nom || "").trim().split(" ")[0].toLowerCase();
    const prenomsFeminins = [
        "dora", "marie", "anne", "anna", "annie", "anuarite", "ruth", "grace", "grâce",
        "esther", "sarah", "sara", "debora", "débora", "fatou", "chantal", "nadine",
        "brigitte", "joyce", "elodie", "élodie", "mireille", "patience", "rebecca",
        "rebeca", "prisca", "gloria", "divine", "mercie", "naomie", "noella", "blandine", "huguette"
    ];
    const terminaisonsFeminines = ["a", "ia", "na", "ssa", "elle", "ine", "ette", "line"];

    if (prenomsFeminins.includes(prenom) || terminaisonsFeminines.some(fin => prenom.endsWith(fin))) {
        return "ma chère";
    }
    return "mon cher";
}

function adapterTexteGenre(texte = "", nom = "") {
    const prenomNettoye = normaliserNom(nom).split(" ")[0] || "élève";
    const prefixe = genreEleve(prenomNettoye);
    const appelComplet = `${prefixe} **${prenomNettoye}**`;

    return String(texte || "")
        .replace(/mon cher élève/gi, appelComplet)
        .replace(/ma chère élève/gi, appelComplet)
        .replace(/mon élève/gi, appelComplet)
        .replace(/cher élève/gi, appelComplet);
}

function construireAppel(user) {
    const prenom = normaliserNom(user?.nom || "élève").split(" ")[0];
    return `${genreEleve(prenom)} ${prenom}`;
}

function estQuestionTechnique(texte = "") {
    const t = String(texte || "").toLowerCase();
    const mots = [
        "calcule", "calculer", "résous", "resous", "équation", "equation", "fraction",
        "physique", "chimie", "exercice", "problème", "probleme", "géométrie",
        "geometrie", "puissance", "racine", "math", "maths", "formule"
    ];
    return mots.some(m => t.includes(m));
}

function typeMessage(msg) {
    if (!msg) return "unknown";
    if (msg.text?.body) return "text";
    if (msg.audio) return "audio";
    if (msg.image) return "image";
    if (msg.document) return "document";
    if (msg.interactive) return "interactive";
    return msg.type || "unknown";
}

function estMessageRemerciement(texte = "") {
    const t = String(texte || "").toLowerCase().trim();

    const remerciements = [
        "merci", "merci beaucoup", "mercii", "grand merci", "mersi",
        "merci mwalimu", "merci beaucoup mwalimu", "je te remercie",
        "je vous remercie", "ok merci", "d'accord merci", "dac merci"
    ];

    return remerciements.includes(t);
}

function estMessageCourtHumain(texte = "") {
    const t = String(texte || "").toLowerCase().trim();

    const expressions = [
        "ok", "okay", "d'accord", "dac", "ça va", "ca va", "oui", "non",
        "bien", "super", "parfait", "cool", "entendu", "compris"
    ];

    return expressions.includes(t);
}

function construireReponseHumaineSimple(user = {}, texte = "") {
    const prenom = normaliserNom(user?.nom || "").split(" ")[0] || "élève";
    const appel = `${genreEleve(prenom)} **${prenom}**`;
    const t = String(texte || "").toLowerCase().trim();

    const reponsesSalut = [
        `🔵 [VÉCU] :
Bonjour ${appel}. Je suis vraiment heureux de te retrouver.

🟡 [SAVOIR] :
Je suis bien là, disponible pour t’accompagner tranquillement aujourd’hui.

🔴 [INSPIRATION] :
Chaque échange compte, même un simple bonjour, parce qu’il ouvre la porte à de belles choses.

❓ [CONSOLIDATION] :
Comment vas-tu, et sur quoi veux-tu qu’on avance ensemble ?`,

        `🔵 [VÉCU] :
Bonsoir ${appel}. Cela me fait plaisir de te lire.

🟡 [SAVOIR] :
Nous pouvons prendre ce moment calmement et avancer à ton rythme.

🔴 [INSPIRATION] :
On progresse souvent mieux quand on garde un cœur paisible et une pensée claire.

❓ [CONSOLIDATION] :
Veux-tu simplement me saluer, ou bien as-tu une question à me confier ?`,

        `🔵 [VÉCU] :
Salut ${appel}. Merci d’être revenu vers moi.

🟡 [SAVOIR] :
Je suis prêt à t’écouter et à t’aider avec simplicité.

🔴 [INSPIRATION] :
Quand on garde l’habitude d’échanger avec confiance, on apprend aussi avec plus d’assurance.

❓ [CONSOLIDATION] :
Dis-moi ce que tu veux travailler, ou comment se passe ta journée.`
    ];

    const reponsesMerci = [
        `🔵 [VÉCU] :
Avec plaisir, ${appel}. Cela me fait vraiment plaisir de pouvoir t’aider.

🟡 [SAVOIR] :
Je reste disponible chaque fois que tu as besoin d’une explication ou d’un accompagnement.

🔴 [INSPIRATION] :
La gratitude et la constance sont de belles forces dans le chemin de l’apprentissage.

❓ [CONSOLIDATION] :
Veux-tu qu’on continue, ou préfères-tu reprendre plus tard ?`,

        `🔵 [VÉCU] :
Je t’en prie, ${appel}. Merci aussi pour ta confiance.

🟡 [SAVOIR] :
Tu peux revenir sans hésiter chaque fois qu’un point n’est pas encore clair.

🔴 [INSPIRATION] :
Les élèves qui osent demander finissent souvent par comprendre plus solidement.

❓ [CONSOLIDATION] :
Y a-t-il encore un point que tu veux revoir avec moi ?`
    ];

    const reponsesBonneNuit = [
        `🔵 [VÉCU] :
Bonne nuit ${appel}. Merci pour ce moment partagé.

🟡 [SAVOIR] :
Le repos aide aussi l’esprit à mieux retenir et à revenir plus fort.

🔴 [INSPIRATION] :
Un élève qui sait aussi se reposer construit un apprentissage plus solide.

❓ [CONSOLIDATION] :
Reviens quand tu voudras ; nous continuerons ensemble avec calme.`,

        `🔵 [VÉCU] :
Bonne soirée ${appel}. Je suis content d’avoir échangé avec toi.

🟡 [SAVOIR] :
Tu peux maintenant te reposer tranquillement.

🔴 [INSPIRATION] :
Demain sera encore une belle occasion d’apprendre avec confiance.

❓ [CONSOLIDATION] :
Je resterai disponible quand tu voudras reprendre.`
    ];

    const reponsesCourtes = [
        `🔵 [VÉCU] :
Très bien ${appel}.

🟡 [SAVOIR] :
Je te suis et je reste disponible pour la suite.

🔴 [INSPIRATION] :
Même les petits échanges entretiennent la confiance et la progression.

❓ [CONSOLIDATION] :
Que veux-tu faire maintenant ?`,

        `🔵 [VÉCU] :
D’accord ${appel}, je suis avec toi.

🟡 [SAVOIR] :
Nous pouvons avancer simplement, sans nous presser.

🔴 [INSPIRATION] :
La régularité dans les petits pas produit souvent de grands résultats.

❓ [CONSOLIDATION] :
Quelle est la suite pour toi ?`
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

function estMessageRelationnelSimple(texte = "") {
    return estMessageSalutation(texte) || estMessageRemerciement(texte) || estMessageCourtHumain(texte);
}

function construireConsignePedagogique(texte = "", type = "text") {
    const t = String(texte || "");

    if (type === "image") {
        return `
MODE PÉDAGOGIQUE IMAGE :
- Il s'agit probablement d'un exercice envoyé en image
- Tu expliques la démarche
- Tu aides l'élève à comprendre ce qu'il doit faire
- Tu ne résous pas tout jusqu'à la réponse finale
- Tu termines en demandant à l'élève d'essayer lui-même puis de t'envoyer sa réponse
`;
    }

    if (estSoumissionReponse(t)) {
        return `
MODE CORRECTION BIENVEILLANTE :
- L'élève soumet probablement sa propre réponse
- Tu dois d'abord féliciter son effort
- Tu vérifies calmement
- Tu corriges avec douceur si nécessaire
- Tu expliques précisément l'erreur
- Tu encourages l'élève avec chaleur
`;
    }

    if (estQuestionTechnique(t)) {
        return `
MODE EXERCICE GUIDÉ :
- C'est un exercice ou un calcul
- Tu expliques la méthode
- Tu montres le démarrage utile
- Tu ne donnes pas la réponse finale complète à la place de l'élève
- Tu invites l'élève à continuer
- Tu lui demandes ensuite de t'envoyer sa réponse pour vérification
`;
    }

    return `
MODE ÉCHANGE NORMAL :
- Réponds naturellement
- Sois humain, chaleureux et utile
- Après la réponse, pose une petite question de retour liée au sujet
`;
}

function choisirOuvertureContextuelle(reponse = "", user = {}, question = "") {
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

    if (corps.includes("bonne nuit") || corps.includes("bonne soirée") || corps.includes("bonne soiree") || corps.includes("repose-toi")) {
        return "👉 Je reste disponible dès que tu voudras reprendre.";
    }

    if (corps.includes("merci") || corps.includes("je t’en prie") || corps.includes("je reste disponible")) {
        return "👉 Reviens quand tu veux ; je serai toujours heureux de t’aider.";
    }

    if (estQuestionTechnique(q)) {
        return "👉 Essaie maintenant de continuer, puis envoie-moi ta réponse pour que je la vérifie avec toi.";
    }

    if (corps.includes("bravo") || corps.includes("bonne réponse") || corps.includes("bonne reponse") || corps.includes("félicit") || corps.includes("felicit")) {
        return "👉 Tu avances bien. On peut continuer ensemble avec la suite.";
    }

    if (corps.includes("chine") || corps.includes("népal") || corps.includes("nepal") || corps.includes("géographie") || corps.includes("geographie") || corps.includes("pays")) {
        return "👉 Nous pouvons continuer avec une autre petite question de géographie.";
    }

    if (corps.includes("histoire") || corps.includes("date") || corps.includes("événement") || corps.includes("evenement")) {
        return "👉 Nous pouvons continuer doucement avec une autre question du même thème.";
    }

    return pick(OUVERTURES);
}

function choisirEncouragementContextuel(reponse = "", user = {}, question = "") {
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

    if (corps.includes("bonne nuit") || corps.includes("bonne soirée") || corps.includes("bonne soiree") || corps.includes("repose-toi")) {
        return "🌟 Mot d'encouragement : Un esprit reposé revient souvent plus fort et plus clair.";
    }

    if (corps.includes("merci") || corps.includes("je t’en prie") || corps.includes("je reste disponible")) {
        return "🌟 Mot d'encouragement : Garde cette belle habitude de demander quand quelque chose n’est pas encore clair.";
    }

    if (estQuestionTechnique(q)) {
        return "🌟 Mot d'encouragement : Continue avec méthode ; en travaillant étape par étape, tu peux trouver toi-même la bonne réponse.";
    }

    if (corps.includes("bonne réponse") || corps.includes("bonne reponse") || corps.includes("bravo") || corps.includes("félicit") || corps.includes("felicit")) {
        return "🌟 Mot d'encouragement : Bravo pour ton effort ; tu avances réellement, et cela fait plaisir à voir.";
    }

    if (corps.includes("c'est normal") || corps.includes("je suis là pour t'aider") || corps.includes("pas de souci")) {
        return "🌟 Mot d'encouragement : Ne crains pas de ne pas savoir au départ ; c’est justement en apprenant qu’on devient plus fort.";
    }

    if (corps.includes("géographie") || corps.includes("geographie") || corps.includes("pays") || corps.includes("frontière") || corps.includes("frontiere")) {
        return "🌟 Mot d'encouragement : Ta curiosité est une belle force ; elle t’ouvre peu à peu l’intelligence du monde.";
    }

    return pick(MOTS_ENCOURAGEMENT);
}
