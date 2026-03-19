
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
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
    "***« Ne demande pas ce que ton pays peut faire pour toi, mais ce que tu peux faire pour le Congo. »***"
];

// --- 1. LE RAPPEL AUTOMATIQUE DU MATIN (07:00) ---
// Note : S'exécute chaque jour à 7h du matin (Fuseau Afrique/Lubumbashi)
cron.schedule('0 7 * * *', async () => {
    try {
        console.log("Mwalimu prépare les rappels du matin...");
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
       
        for (let eleve of eleves) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            const messageMatin = `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${eleve.nom}** !\n\nLe soleil se lève sur notre grand pays. C'est une nouvelle opportunité pour toi d'étudier avec courage. Prépare ton esprit, car le Congo de demain a besoin de ton génie.\n\n${cit}\n\nExcellente journée d'études !`;
           
            await envoyerWhatsApp(eleve.phone, messageMatin);
        }
        console.log(`✅ ${eleves.length} rappels envoyés.`);
    } catch (e) {
        console.error("Erreur lors du rappel Cron :", e.message);
    }
}, {
    scheduled: true,
    timezone: "Africa/Lubumbashi"
});

// --- 2. OUTILS DE NETTOYAGE & ENVOI ---
function nettoyerEntree(texte) {
    if (!texte) return "";
    return texte.replace(/mon prénom est|je m'appelle|mon nom est|je suis|en classe de|mon rêve est de devenir|mon plus grand rêve professionnel est de devenir|je voudrais devenir|je veux devenir|je rêve d'être/gi, "").replace(/[.!]*/g, "").trim();
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur API WhatsApp"); }
}

// --- 3. RECHERCHE SQL ANTI-HALLUCINATION (Score de priorité) ---
async function consulterBibliotheque(question) {
    if (!question || question.length < 3) return null;
    try {
        const clean = question.toLowerCase().trim();
        const mots = clean.split(/\s+/).filter(m => m.length > 3);
        const patterns = mots.map(m => `%${m.substring(0, 5)}%`);

        const query = `
            SELECT contenu, sujet,
            (CASE WHEN unaccent(sujet) ILIKE ANY($1) THEN 20 ELSE 0 END +
             CASE WHEN unaccent(contenu) ILIKE ANY($1) THEN 1 ELSE 0 END) as score
            FROM bibliotheque_mwalimu
            WHERE unaccent(sujet) ILIKE ANY($1) OR unaccent(contenu) ILIKE ANY($1)
            ORDER BY score DESC LIMIT 1`;

        const res = await pool.query(query, [patterns]);
        return res.rows.length > 0 ? res.rows[0].contenu : null;
    } catch (e) { return null; }
}

// --- 4. WEBHOOK PRINCIPAL ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // --- PHASE D'INSCRIPTION ---
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.\n\n🟡 Pour que je puisse mieux t'aider, quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            const nom = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${nom}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            const classe = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [classe, from]);
            return await envoyerWhatsApp(from, `🟡 C'est noté. Quel est ton plus grand **rêve** professionnel ?`);
        }
        if (!user.reve) {
            const reve = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reve, from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔴 Magnifique ! Je t'aiderai à devenir **${reve}**.\n\nPose-moi maintenant ta question sur la RDC ou tes cours.`);
        }

        // --- TRAITEMENT DE LA LEÇON ---
        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        const systemPrompt = `Tu es Mwalimu EdTech, mentor d'élite congolais. Ton ton est professionnel, pédagogue et fraternel.
        ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : Devenir ${user.reve}.
       
        SOURCE SQL (OBLIGATION DE RECOPIE) : """${savoirSQL || "VIDE"}"""

        CONSIGNES STRICTES :
        1. RECOPIE INTÉGRALEMENT les termes techniques de la SOURCE (ex: Mazuku, 100 km/h, OVG, Territoire de Nyiragongo).
        2. NE RÉSUME PAS. Si la source dit "100 km/h", n'écris pas "coulées rapides".
        3. TEMPÉRATURE : 0 (Précision absolue).
       
        STRUCTURE OBLIGATOIRE :
        🔵 [VÉCU] : Lien avec la vie réelle ou l'importance pour le pays.
        🟡 [SAVOIR] : Recopie exacte et explication pédagogique des données SOURCE.
        🔴 [INSPIRATION] : Conseil motivant lié à son rêve de devenir ${user.reve}.
        ❓ [CONSOLIDATION] : Une question de test pour l'élève.
        👉 [OUVERTURE] : Parole charnière chaleureuse pour inviter à continuer.`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-4), { role: "user", content: text }],
            temperature: 0,
        });

        const reponseIA = completion.choices[0].message.content;

        // Sauvegarde de l'échange
        historique.push({ role: "user", content: text }, { role: "assistant", content: reponseIA });
        await pool.query("UPDATE conversations SET historique=$1 WHERE phone=$2", [JSON.stringify(historique.slice(-10)), from]);

        const messageFinal = `${HEADER_MWALIMU}\n________________________________\n\n${reponseIA}\n\n\n${CITATIONS[Math.floor(Math.random() * CITATIONS.length)]}`;
        await envoyerWhatsApp(from, messageFinal);

    } catch (e) { console.error("Erreur Webhook"); }
});

app.get("/webhook", (req, res) => {
    if (req.query["hub.verify_token"] === process.env.VERIFY_TOKEN) res.send(req.query["hub.challenge"]);
    else res.sendStatus(403);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Mwalimu EdTech en ligne sur le port ${PORT}`));
