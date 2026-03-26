/* =========================================================
   5) SÉCURITÉ WEBHOOK
========================================================= */

function verifierSignatureMeta(req) {
    try {
        const signature = req.get("x-hub-signature-256");
        if (!APP_SECRET || !signature || !req.rawBody) return false;

        const expectedSignature =
            "sha256=" +
            crypto
                .createHmac("sha256", APP_SECRET)
                .update(req.rawBody)
                .digest("hex");

        const sigBuf = Buffer.from(signature);
        const expBuf = Buffer.from(expectedSignature);

        if (sigBuf.length !== expBuf.length) return false;
        return crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
        return false;
    }
}

function extraireMessageWhatsApp(body) {
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    if (!value || value.statuses?.length || !value.messages?.length) return null;
    return value.messages[0];
}
