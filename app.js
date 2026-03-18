
require('dotenv').config();
const express = require("express");
const axios = require("axios");
const { Pool } = require("pg");
const { OpenAI } = require("openai");
const cron = require("node-cron");

const app = express();
app.use(express.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const HEADER_MWALIMU = "🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩";

const CITATIONS = [
    "***« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »***",
    "***« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »***",
    "***« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba***",
    "***« L'excellence n'est pas une action, c'est une habitude. »***",
    "***« Un DRC brillant demande des citoyens intègres qui soutiennent l'État pour une souveraineté réelle. »***",
    "***« Ne demande pas ce que ton pays peut faire pour toi, mais ce que tu peux faire pour le Congo. »***"
];

// --- 1. RAPPEL DU MATIN (Postures de Mentor) ---
cron.schedule('0 7 * * *', async () => {
    try {
        const { rows: eleves } = await pool.query("SELECT phone, nom FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (let eleve of eleves) {
            const cit = CITATIONS[Math.floor(Math.random() * CITATIONS.length)];
            const message = `${HEADER_MWALIMU}\n________________________________\n\n☀️ Bonjour mon cher **${eleve.nom}** !\n\nLe soleil se lève sur notre beau pays. C'est une nouvelle chance pour toi de grandir en sagesse. Prépare ton esprit, car le Grand Congo compte sur ton génie.\n\n${cit}\n\nExcellente journée d'études !`;
            await envoyerWhatsApp(eleve.phone, message);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { scheduled: true, timezone: "Africa/Lubumbashi" });

// --- 2. OUTILS ---
function nettoyerEntree(texte) {
    if (!texte) return "";
    return texte.replace(/mon prénom est|je m'appelle|mon nom est|je suis|en classe de|mon rêve est de devenir|mon plus grand rêve professionnel est de devenir|je voudrais devenir|je veux devenir|je rêve d'être/gi, "").replace(/[.!]*/g, "").trim();
}

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to, text: { body: texte }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur WhatsApp"); }
}

async function consulterBibliotheque(question) {
    if (!question) return null;
    try {
        const mots = question.toLowerCase().replace(/[?.,!]/g, "").split(/\s+/).filter(m => m.length > 3);
        if (mots.length === 0) return null;
        const patterns = mots.map(m => `%${m.substring(0, 5)}%`);
        const query = `SELECT contenu FROM bibliotheque_mwalimu WHERE unaccent(sujet) ILIKE ANY($1) OR unaccent(contenu) ILIKE ANY($1) LIMIT 1`;
        const res = await pool.query(query, [patterns]);
        return res.rows.length > 0 ? res.rows[0].contenu : null;
    } catch (e) { return null; }
}

// --- 3. WEBHOOK ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body;

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔵 Mbote ! Je suis Mwalimu EdTech, ton mentor personnel.\n\n🟡 Pour que je puisse mieux t'accompagner, quel est ton **prénom** ?`);
        }
        if (!user.nom) {
            const nom = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nom, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${nom}** ! C'est un beau prénom. En quelle **classe** es-tu actuellement ?`);
        }
        if (!user.classe) {
            const classe = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [classe, from]);
            return await envoyerWhatsApp(from, `🟡 C'est noté. La classe de **${classe}** est une étape importante. Quel est ton plus grand **rêve** professionnel ?`);
        }
        if (!user.reve) {
            const reve = nettoyerEntree(text);
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [reve, from]);
            return await envoyerWhatsApp(from, `${HEADER_MWALIMU}\n________________________________\n\n🔴 Magnifique ! Devenir **${reve}** est une noble ambition pour notre nation. Je serai à tes côtés pour t'aider à y arriver.\n\nPose-moi maintenant ta première question sur tes cours ou sur la RDC.`);
        }

        const savoirSQL = await consulterBibliotheque(text);
        let historique = JSON.parse(user.historique || "[]");

        // --- PROMPT PÉDAGOGIQUE & HUMAIN ---
        const systemPrompt = `Tu es Mwalimu EdTech, un mentor d'élite, un professeur passionné et un grand frère spirituel pour la jeunesse de la RDC.
        L'ÉLÈVE : ${user.nom} | CLASSE : ${user.classe} | RÊVE : Devenir ${user.reve}.

        TA POSTURE :
        1. Ton ton est professionnel, chaleureux et très pédagogue. Tu n'es pas un robot, tu es un guide qui transmet un héritage.
        2. Si l'élève te soumet un exercice ou un devoir : NE DONNE PAS la réponse tout de suite. Explique la méthode, donne un exemple similaire, puis encourage-le à essayer.
        3. SOURCE SQL (À RECOPIER IMPÉRATIVEMENT) : """${savoirSQL || "Information non répertoriée dans ma bibliothèque officielle."}"""
       
        CONSIGNE CRITIQUE DE DONNÉES :
        - Si la SOURCE contient des chiffres ou termes techniques (ex: "Mazuku", "100 km/h", "OVG", "347m", "384m", "Nyiragongo, Rutshuru, Masisi"), tu DOIS les inclure mot pour mot dans la section 🟡 [SAVOIR]. C'est une obligation absolue.

        STRUCTURE DE RÉPONSE :
        🔵 [VÉCU] : Connecte le sujet à la vie réelle de l'élève ou à l'importance pour le pays.
        🟡 [SAVOIR] : Transpose les faits de la SOURCE avec clarté et rigueur professorale.
        🔴 [INSPIRATION] : Fais un lien direct entre cette leçon et son rêve de devenir ${user.reve}.
        ❓ [CONSOLIDATION] : Pose une question de réflexion ou propose un petit exercice.
        👉 [OUVERTURE] : Une parole humaine et chaleureuse pour dire que tu es là pour la suite.

        INTERDIT : Pas d'introduction IA. Pas de "Bonjour". Ne cite pas "Dora" dans chaque phrase. Finis par 👉 [OUVERTURE].`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, ...historique.slice(-4), { role: "user", content: text }],
            temperature: 0,
        });

        const reponseIA = completion.choices[0].message.content;
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
