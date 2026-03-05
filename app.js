
const express = require('express');
const axios = require('axios');
const { OpenAI } = require('openai');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const app = express().use(express.json());
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Header corrigé selon tes instructions (Italique, EdTech, sans astérisques aux extrémités)
const HEADER_MWALIMU = "_🔵🟡🔴 *Je suis Mwalimu EdTech, ton assistant éducatif et ton mentor pour un DRC brillant* 🇨🇩_";

// 1. CONNEXION SQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 2. MÉMOIRE RÉSISTANTE (JSON)
const memoryPath = path.join(__dirname, 'student_memory.json');
let studentMemory = fs.existsSync(memoryPath) ? JSON.parse(fs.readFileSync(memoryPath, 'utf8')) : {};

const saveMemory = () => {
    fs.writeFileSync(memoryPath, JSON.stringify(studentMemory, null, 2));
};

// 3. RÉCUPÉRATION DES DONNÉES DRC
async function getDbData() {
    try {
        const geo = await pool.query('SELECT * FROM drc_geographie');
        const hist = await pool.query('SELECT * FROM drc_histoire_ancienne');
        return JSON.stringify({ geo: geo.rows, hist: hist.rows });
    } catch (err) { return "Données indisponibles."; }
}

// 4. WEBHOOK META (VÉRIFICATION)
app.get('/webhook', (req, res) => {
    if (req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) {
        res.status(200).send(req.query['hub.challenge']);
    } else { res.sendStatus(403); }
});

// 5. LOGIQUE DU PRÉCEPTEUR (SANS BÉGAIEMENT)
app.post("/webhook", async (req, res) => {
    const body = req.body;
   
    // --- LA SOLUTION : RÉPONDRE IMMÉDIATEMENT À META ---
    res.sendStatus(200);

    // Bloquer les notifications de lecture/distribution
    if (body.entry?.[0]?.changes?.[0]?.value?.statuses) return;

    const msgObj = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msgObj || msgObj.type !== 'text') return;

    const from = msgObj.from;
    const text = msgObj.text.body;

    if (!studentMemory[from]) {
        studentMemory[from] = { profile: { name: null, grade: null, location: null }, history: [] };
    }

    let profile = studentMemory[from].profile;

    // --- PHASE D'IDENTIFICATION ---
    if (!profile.name || !profile.grade || !profile.location) {
        const aicheck = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: `L'élève dit: "${text}". Extrais Nom, Classe, Ville en JSON: {"name": "...", "grade": "...", "location": "..."}. Si inconnu, mets null.` }]
        });

        try {
            const found = JSON.parse(aicheck.choices[0].message.content);
            if (found.name) profile.name = found.name;
            if (found.grade) profile.grade = found.grade;
            if (found.location) profile.location = found.location;
            saveMemory();
        } catch (e) {}

        let reply = "";
        if (!profile.name) reply = "Bienvenue ! Je suis Mwalimu EdTech, ton précepteur. Pour commencer, quel est ton nom ? Je suis là pour toi.";
        else if (!profile.grade) reply = `Enchanté ${profile.name} ! En quelle classe es-tu ?`;
        else if (!profile.location) reply = "C'est noté. Enfin, dans quelle ville ou province habites-tu ?";

        if (reply !== "") {
            // Un seul message envoyé ici
            return axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
                messaging_product: "whatsapp", to: from, text: { body: `${HEADER_MWALIMU}\n\n${reply}` }
            }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });
        }
    }

    // --- TUTORAT APPROFONDI (RESTE DU CODE) ---
    const dbContent = await getDbData();
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: `Tu es Mwalimu EdTech. Utilise : ${dbContent}. Structure : 🔵🟡🔴. Termine par un Quiz.` },
                ...studentMemory[from].history.slice(-4),
                { role: "user", content: text }
            ]
        });

        const finalReply = `${HEADER_MWALIMU}\n\n${completion.choices[0].message.content}`;
        await axios.post(`https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`, {
            messaging_product: "whatsapp", to: from, text: { body: finalReply }
        }, { headers: { 'Authorization': `Bearer ${process.env.TOKEN}` } });

        studentMemory[from].history.push({ role: "user", content: text }, { role: "assistant", content: completion.choices[0].message.content });
        saveMemory();
    } catch (e) { console.error("Erreur OpenAI"); }
});

app.listen(process.env.PORT || 10000, () => {
    console.log("Mwalimu EdTech opérationnel.");
});
