
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

// --- RÈGLE D'OR : IDENTITÉ VISUELLE ---
const HEADER_MWALIMU = "🔴🟡🔵 **Mwalimu EdTech : Ton Mentor pour l'Excellence** 🇨🇩";

const CITATIONS = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
    "***« Ne demande pas ce que ton pays peut faire pour toi, mais ce que tu peux faire pour le Congo. »***"
];

// --- 1. RAPPEL DU MATIN (La voix du mentor à 07:00) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            const messageMatin = `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${eleve.nom}** !\n\nLe soleil se lève sur notre beau pays. C'est une nouvelle chance pour toi de grandir en sagesse. Prépare ton esprit, car le Grand Congo compte sur ton génie.\n\n${cit}\n\nExcellente journée d'études !`;
            await envoyerWhatsApp(eleve.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- 2. OUTILS DE NETTOYAGE & ENVOI ---
function nettoyer(texte) {
    if (!texte) return "";
    return texte.replace(/mon prénom est|je m'appelle|mon nom est|je suis|en classe de|mon rêve est de devenir|mon plus grand rêve professionnel est de devenir/gi, "").replace(/[.!]*/g, "").trim();
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur d'envoi"); }
}

// --- 3. RECHERCHE SQL MAGISTRALE ---
async function consulterBibliotheque(question) {
    if (!question) return null;
    try {
        const mots = question.toLowerCase().trim().split(/\s+/).filter(m => m.length > 4);
        const search = mots.length > 0 ? `%${mots[0]}%` : `%${question}%`;
       
        // Priorité absolue au Sujet pour éviter les mélanges de provinces
        const res = await pool.query(
            "SELECT contenu FROM bibliotheque_mwalimu WHERE unaccent(sujet) ILIKE $1 OR unaccent(contenu) ILIKE $1 ORDER BY (unaccent(sujet) ILIKE $1) DESC LIMIT 1",
            [search]
        );
        return res.rows[0]?.contenu || null;
    } catch (e) { return null; }
}

// --- 4. WEBHOOK (L'interaction continue) ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // SEQUENCE D'INSCRIPTION PÉDAGOGIQUE
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.\n\n🟡 Je vais t'accompagner dans tes études pour faire de toi une élite. Dis-moi, quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            const nom = nettoyer(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return await envoyerWhatsApp(from, `🤝 Enchanté **${nom}** ! Un futur bâtisseur du Grand Congo. En quelle **classe** es-tu actuellement ?`);
        }
        if (!user.classe) {
            const classe = nettoyer(text);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [classe, from]);
            return await envoyerWhatsApp(from, `🟡 C'est noté. La classe de **${classe}** demande beaucoup de rigueur. Quel est ton plus grand **rêve** professionnel ?`);
        }
        if (!user.reve) {
            const reve = nettoyer(text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reve, from]);
            return await envoyerWhatsApp(from, `🔴 Magnifique ! Devenir **${reve}**, c'est une noble manière de servir notre Nation. Je serai à tes côtés pour t'aider à comprendre tes leçons.\n\nPose-moi ta question, mon cher enfant.`);
        }

        // TRAITEMENT DE LA LEÇON PAR LE MAÎTRE
        const savoir = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        const systemPrompt = `Tu es Mwalimu EdTech, un précepteur congolais d'élite. Ton ton est celui d'un Maître d'école : exigeant, aimant, paternel et très méthodique.
        ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : Devenir ${user.reve}.

        MÉTHODE MWALIMU :
        - Tu ne donnes pas juste l'information, tu l'EXPLIQUES avec pédagogie et amour.
        - Utilise des analogies congolaises pour rendre le savoir vivant (ex: comparer les volcans à des marmites, le fleuve à une artère).
        - SOURCE : """${savoir || "Donnée absente. Utilise ta sagesse de précepteur."}"""
       
        CONSIGNE DE RIGUEUR (VITAL) :
        - Un Maître ne simplifie JAMAIS les noms propres ou les termes techniques.
        - Si la SOURCE mentionne "MAZUKU", "OVG", ou "100 km/h", tu DOIS impérativement les inclure et les expliquer.
        - Si la SOURCE cite des territoires précis (ex: Nyiragongo, Rutshuru, Masisi), ne les remplace jamais par d'autres. La précision est la marque des élites.

        STRUCTURE DE RÉPONSE OBLIGATOIRE :
        🔵 [VÉCU] : Connecte chaleureusement le sujet au quotidien de l'élève ou au pays. (Toujours en PREMIER).
        🟡 [SAVOIR] : Explique le concept en utilisant TOUS les détails techniques et chiffres de la SOURCE SQL.
        🔴 [INSPIRATION] : Montre comment ce savoir fera de ${user.nom} une excellente ${user.reve}.
        ❓ [CONSOLIDATION] : Pose une question de réflexion profonde pour stimuler son esprit.
        👉 [OUVERTURE] : Une parole humaine pour inviter à continuer...`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-4), { role: "user", content: text }],
            temperature: 0.3, // Équilibre entre chaleur humaine et précision des faits
        });

        const reponseIA = completion.choices[0].message.content;
       
        // Mémoire de la discussion
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
app.listen(PORT, () => console.log(`Mwalimu EdTech opérationnel.`));
