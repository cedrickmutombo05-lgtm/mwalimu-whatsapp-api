const { OpenAI } = require("openai");
const fs = require("fs");
const os = require("os");
const path = require("path");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/* =========================================================
   TRANSCRIPTION AUDIO
========================================================= */
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

/* =========================================================
   CHAT IA
========================================================= */
async function appelerChatCompletion(messages) {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages
    });

    return completion.choices?.[0]?.message?.content?.trim() || "";
}

/* =========================================================
   IMAGE IA
========================================================= */
async function expliquerImageAvecIA(system, base64Image, mimeType, historique = [], consignePedagogique = "") {
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
            { role: "system", content: system },
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
                        image_url: {
                            url: `data:${mimeType};base64,${base64Image}`
                        }
                    }
                ]
            }
        ]
    });

    return completion.choices?.[0]?.message?.content?.trim() || "";
}

module.exports = {
    transcrireAudioAvecIA,
    appelerChatCompletion,
    expliquerImageAvecIA
};
