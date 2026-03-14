
const express = require("express");
const axios = require("axios");
const { OpenAI } = require("openai");
const cron = require("node-cron");
const { Pool } = require("pg");
require("dotenv").config();

const app = express().use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const HEADER_MWALIMU = "_🔴🟡🔵 **Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant** 🇨🇩_";

const citations = [
    "_« L'éducation chrétienne de la jeunesse c'est le meilleur apostolat. »_",
    "_« Science sans conscience n'est que ruine de l'âme. »_",
    "_« Le Congo de demain se construit avec ton savoir d'aujourd'hui. »_",
    "_« Sans formation, on n'est rien du tout dans ce monde. » - Patrice Lumumba_",
    "_« L'excellence n'est pas une action, c'est une habitude. »_"
];

async function envoyerWhatsApp(to, texte) {
    try {
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp",
            to,
            text: { body: `${HEADER_MWALIMU}\n\n________________________________\n\n${texte}` }
        }, { headers: { Authorization: `Bearer ${process.env.TOKEN}` } });
    } catch (e) { console.error("Erreur API WhatsApp"); }
}

// --- RAPPEL DU MATIN PATRIOTIQUE ---
cron.schedule("0 7 * * *", async () => {
    try {
        const res = await pool.query("SELECT phone, nom, reve FROM conversations WHERE nom IS NOT NULL AND nom != ''");
        for (const user of res.rows) {
            const cit = citations[Math.floor(Math.random() * citations.length)];
            const salutations = ["Ebwe", "Mbote", "Jambo", "Moyo", "Bonjour"];
            const sal = salutations[Math.floor(Math.random() * salutations.length)];
            const messageMatin = `🔵 ${sal} cher élève ${user.nom} !\n\n🟡 ${cit}\n\n🔴 Le Congo compte sur toi aujourd'hui pour avancer vers ton rêve de devenir ${user.reve}.`;
            await envoyerWhatsApp(user.phone, messageMatin);
        }
    } catch (e) { console.error("Erreur Cron"); }
}, { timezone: "Africa/Lubumbashi" });

// --- RECHERCHE SQL PRÉCISE ---
async function consulterBibliotheque(phrase) {
    if (!phrase) return null;
    const nettoyer = (str) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const texteNettoye = nettoyer(phrase);
    const mots = texteNettoye.replace(/[?.,!]/g, "").split(/\s+/);

    for (let mot of mots) {
        if (mot.length < 3) continue;
        try {
            const res = await pool.query(
                `SELECT * FROM drc_population_villes
                 WHERE LOWER(province) LIKE $1 OR LOWER(territoires) LIKE $1
                 OR LOWER(chef_lieu) LIKE $1 OR LOWER(villes) LIKE $1
                 LIMIT 1`, [`%${mot}%`]
            );
            if (res.rows.length > 0) return res.rows[0];
        } catch (e) { console.error("Erreur SQL"); }
    }
    return null;
}

// --- WEBHOOK PRINCIPAL ---
app.post("/webhook", async (req, res) => {
    res.sendStatus(200);
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg?.text?.body) return;

    const from = msg.from;
    const text = msg.text.body.trim();

    try {
        let { rows } = await pool.query("SELECT * FROM conversations WHERE phone=$1", [from]);
        let user = rows[0];

        // CYCLE ENRÔLEMENT
        if (!user) {
            await pool.query("INSERT INTO conversations (phone, nom, classe, reve, historique) VALUES ($1, '', '', '', '[]')", [from]);
            return await envoyerWhatsApp(from, "🔵 Mbote ! Je suis Mwalimu EdTech.\n\n🟡 Quel est ton **prénom** ?");
        }
        if (!user.nom) {
            const nomNettoye = text.replace(/Mon prénom est|Je m'appelle|Moi c'est/gi, "").trim();
            await pool.query("UPDATE conversations SET nom=$1 WHERE phone=$2", [nomNettoye, from]);
            return await envoyerWhatsApp(from, `🔵 Enchanté **${nomNettoye}** ! En quelle **classe** es-tu ?`);
        }
        if (!user.classe) {
            await pool.query("UPDATE conversations SET classe=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 C'est noté. Quel est ton plus grand **rêve** ?`);
        }
        if (!user.reve) {
            await pool.query("UPDATE conversations SET reve=$1 WHERE phone=$2", [text, from]);
            return await envoyerWhatsApp(from, `🔵 Magnifique ! Je t'aiderai à devenir **${text}**.\n\n🟡 Pose-moi ta question.`);
        }

        const info = await consulterBibliotheque(text);
        const citAleatoire = citations[Math.floor(Math.random() * citations.length)];
       
        let rawData = "VIDE";
        if (info) {
            const v = Object.values(info);
            rawData = `PROVINCE: ${info.province || v[1]} | CHEF-LIEU: ${info.chef_lieu || v[2]} | VILLES: ${info.villes || 'Zongo, Beni, Butembo, Uvira, Baraka, Likasi, Boma'} | TERRITOIRES: ${info.territoires || v[3]} | GÉOGRAPHIE: ${info.relief || ''} ${info.hydrographie || ''} | RICHESSES: ${info.richesses || ''}`;
        }

        const systemPrompt = `
Tu es Mwalimu EdTech, le Grand Précepteur du Congo. Ton style est celui d'un enseignant patriotique, rigoureux et d'une clarté absolue.

<INSTRUCTIONS_PEDAGOGIQUES>
1. SALUTATION : Commence TOUJOURS par saluer ${user.nom}. Alterne uniquement entre : Ebwe (Kikongo), Mbote (Lingala), Jambo (Swahili), Moyo (Tshiluba) ou Bonjour/Bonsoir.
2. STYLE : Parle comme un mentor qui transmet l'héritage national. Utilise des étapes claires (1, 2, 3).
3. RIGUEUR SQL : Tu as interdiction formelle de résumer la liste des territoires. Recopie TOUS les noms présents dans la source.
4. CONSOLIDATION : Termine ta leçon par une question directe à l'élève pour vérifier sa compréhension.
</INSTRUCTIONS_PEDAGOGIQUES>

<SOURCE_A_RECOPIER_FIDÈLEMENT>
${rawData}
</SOURCE_A_RECOPIER_FIDÈLEMENT>

<STRUCTURE_LECON>
🔵 [VÉCU] : Anecdote humaine et patriotique sur la province.
🟡 [SAVOIR] :
   - Chef-lieu & Villes : (Note bien que les Villes ne sont pas des territoires).
   - Liste des Territoires : [RECOPIER TOUTE LA LISTE SANS EXCEPTION].
   - Nature & Richesses : [Détailler Relief, Hydrographie, Climat et Mines].
🔴 [INSPIRATION] : Relie ce potentiel au rêve de devenir ${user.reve}.
❓ [CONSOLIDATION] : Question de cours pour ${user.nom}.

Finis par la citation EN ITALIQUE : ${citAleatoire}.
</STRUCTURE_LECON>
`;

        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: text }],
            temperature: 0.1
        });

        const reponse = completion.choices[0].message.content;
        await envoyerWhatsApp(from, reponse);

    } catch (e) { console.error("Erreur:", e.message); }
});

app.listen(process.env.PORT || 10000);
