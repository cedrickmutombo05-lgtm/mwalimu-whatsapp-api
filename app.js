
require('dotenv').config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");

const app = express();
app.use(express.json());

// --- CONFIGURATION ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// --- RÈGLE D'OR : IDENTITÉ VISUELLE & CITATIONS ---
const HEADER_MWALIMU = "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

const CITATIONS = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***",
    "***« Aimer son pays, c'est aussi contribuer à sa force : payer son impôt, c'est bâtir nos propres écoles. »***",
    "***« Le patriotisme n'est pas un sentiment, c'est un acte de bâtisseur. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
    "***« Ne demande pas ce que ton pays peut faire pour toi, mais ce que tu peux faire pour le Congo. »***"
];

// --- OUTILS DE NETTOYAGE ---
function nettoyerEntree(texte) {
    return texte.replace(/mon prénom est|je m'appelle|mon nom est|je suis|en classe de|mon rêve est de devenir|je veux être/gi, "").replace(/[.!]*/g, "").trim();
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WA"); }
}

// --- RAPPEL AUTOMATIQUE DU MATIN (07:00) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const citation = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            const message = `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour **${eleve.nom}** !\n\nC'est l'heure de te lever pour bâtir ton avenir et celui du Grand Congo.\n\n${citation}\n\nExcellente journée d'études !`;
            await envoyerWhatsApp(eleve.phone, message);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- RECHERCHE BIBLIOTHÈQUE ---
async function consulterBibliotheque(question) {
    if (!question) return null;
    try {
        const clean = question.toLowerCase().trim();
        const mots = clean.split(/\s+/).filter(m => m.length > 4);
        const motCle = mots.length > 0 ? `%${mots[mots.length - 1]}%` : `%${clean}%`;
        const res = await pool.query(
            "SELECT description_tuteur FROM entites_administratives WHERE nom_entite ILIKE $1 OR description_tuteur ILIKE $1 LIMIT 1",
            [motCle]
        );
        return res.rows[0]?.description_tuteur || null;
    } catch (e) { return null; }
}

// --- WEBHOOK ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // 1. INSCRIPTION (Onboarding)
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            const nom = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${nom}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            const classe = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [classe, from]);
            return await envoyerWhatsApp(from, "🟡 C'est noté. Quel est ton plus grand **rêve** professionnel ?");
        }
        if (!user.reve) {
            const reve = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reve, from]);
            return await envoyerWhatsApp(from, `🔴 Magnifique ! Je t'aiderai à devenir **${reve}**.\n\nPose-moi ta question sur tes cours ou sur la RDC.`);
        }

        // 2. PRÉPARATION DES DONNÉES
        const savoirSQL = await consulterBibliotheque(text);
        const citAleatoire = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
        let historique = JSON.parse(user.historique || "[]");

        // 3. SYSTEM PROMPT (Mentor DRC)
        const systemPrompt = `Tu es Mwalimu EdTech, mentor d'élite en RDC.
        L'ÉLÈVE : Prénom: ${user.nom} | Classe: ${user.classe} | Rêve: ${user.reve}.
       
        TON RÔLE : Enseignant bienveillant, fier de sa nation. Utilise le "tu".
        SOURCE SQL : ${savoirSQL || "Données non trouvées. Utilise tes connaissances générales sur la RDC."}.

        STRUCTURE DE RÉPONSE :
        🔵 [VÉCU] : Contexte réel ou anecdote.
        🟡 [SAVOIR] : Explication pédagogique (utilise les données SQL si présentes).
        🔴 [INSPIRATION] : Motivation pour son rêve de devenir ${user.reve}.
        ❓ [CONSOLIDATION] : Une question de test.
       
        👉 TRÈS IMPORTANT : Après la question de consolidation, ajoute une "Parole Charnière" chaleureuse pour inviter l'élève à continuer (ex: "Je reste à ton écoute si tu as une autre préoccupation...", "Y a-t-il un autre sujet que tu aimerais explorer avec moi ?", etc.).`;

        // 4. APPEL IA
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-6), { role: "user", content: text }],
            temperature: 0.5
        });

        const reponseIA = completion.choices[0].message.content;

        // 5. MISE À JOUR MÉMOIRE
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponseIA });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-10)), from]);

        // 6. ENVOI FINAL
        const messageFinal = `${HEADER_MWALIMU}\n________________________________\n\n${reponseIA}\n\n\n${citAleatoire}`;
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) { console.error("Erreur Webhook :", e.message); }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

app.listen(process.env.PORT || 10000);
