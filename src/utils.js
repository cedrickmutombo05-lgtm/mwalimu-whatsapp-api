
// =========================================================
// UTILITAIRES – LOGS, CACHE, QUEUE, OUTILS TEXTE
// =========================================================

// ---------- LOGS ----------
function horodatage() {
  return new Date().toISOString();
}

function logInfo(event, meta = {}) {
  console.log(JSON.stringify({ level: "info", event, ts: horodatage(), ...meta }));
}

function logWarn(event, meta = {}) {
  console.warn(JSON.stringify({ level: "warn", event, ts: horodatage(), ...meta }));
}

function logError(event, error, meta = {}) {
  console.error(JSON.stringify({
    level: "error",
    event,
    ts: horodatage(),
    message: error?.message || String(error || ""),
    stack: error?.stack || null,
    data: error?.response?.data || null,
    ...meta
  }));
}

function nowMs() {
  return Date.now();
}

// ---------- CACHE ----------
class TTLCache {
  constructor({ ttlMs = 60000, maxEntries = 1000, cleanupIntervalMs = 120000 } = {}) {
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.store = new Map();
    this.timer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    entry.lastAccess = Date.now();
    return entry.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.store.size >= this.maxEntries) this.evictOldest();
    this.store.set(key, {
      value,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      expiresAt: Date.now() + ttlMs
    });
  }

  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt <= now) this.store.delete(key);
    }
  }

  evictOldest() {
    let oldestKey = null;
    let oldestAccess = Infinity;
    for (const [key, entry] of this.store.entries()) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) this.store.delete(oldestKey);
  }
}

const cache = new TTLCache();

function makeCacheKey(user = {}, texte = "") {
  return [
    String(user?.nom || "").toLowerCase().trim(),
    String(user?.classe || "").toLowerCase().trim(),
    String(texte || "").toLowerCase().trim()
  ].join("|");
}

function getCache(key) {
  return cache.get(key);
}

function setCache(key, value) {
  cache.set(key, value);
}

// ---------- QUEUE ----------
const processingQueues = new Map();

function runSequentialByKey(key, task) {
  const previous = processingQueues.get(key) || Promise.resolve();
  const execution = previous.catch(() => {}).then(() => task());
  const tracked = execution.finally(() => {
    if (processingQueues.get(key) === tracked) processingQueues.delete(key);
  });
  processingQueues.set(key, tracked);
  return tracked;
}

// ---------- OUTILS GÉNÉRAUX ----------
function pick(arr = []) {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : "";
}

function safeJsonParse(v, fallback = []) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tronquerTexte(texte = "", max = 3500) {
  const t = String(texte || "").trim();
  return t.length <= max ? t : `${t.slice(0, max)}...`;
}

function estErreurQuotaGemini(err) {
  const msg = String(err?.message || "").toLowerCase();
  const data = String(err?.response?.data ? JSON.stringify(err.response.data) : "").toLowerCase();
  return msg.includes("429") || msg.includes("quota") || data.includes("429") || data.includes("quota");
}

// ---------- OUTILS TEXTE ----------
function normaliserNom(nom = "") {
  return String(nom || "").trim().replace(/\s+/g, " ");
}

function premierPrenom(nom = "") {
  return normaliserNom(nom).split(" ")[0] || "élève";
}

function nettoyer(texte = "") {
  return String(texte || "")
    .replace(/je m'appelle|mon nom est|mon prénom est|je suis en|ma classe est|mon rêve est|je veux devenir/gi, "")
    .replace(/^devenir\s+/i, "")
    .replace(/^être\s+/i, "")
    .replace(/[.,!?;: ]+/g, " ")
    .trim();
}

function retirerAccents(texte = "") {
  return String(texte || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normaliserMessageCourt(texte = "") {
  return String(texte || "")
    .toLowerCase()
    .replace(/[.,!?;:()"'`´’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normaliserTexteRelationnel(texte = "") {
  let t = retirerAccents(String(texte || "").toLowerCase());
  t = t
    .replace(/[-_]/g, " ")
    .replace(/[.,!?;:()"`'’´]/g, " ")
    .replace(/\bmwalimu\b/g, " ")
    .replace(/\bmon\s+cher\b/g, " ")
    .replace(/\bma\s+chere\b/g, " ")
    .replace(/\bcher\b/g, " ")
    .replace(/\bchere\b/g, " ")
    .replace(/\bsvp\b/g, " ")
    .replace(/\bstp\b/g, " ")
    .replace(/\bs il te plait\b/g, " ")
    .replace(/\beuh|ah|oh|hum|hein\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return t
    .replace(/^mercii+$/i, "merci")
    .replace(/^mersi$/i, "merci")
    .replace(/^mercie$/i, "merci")
    .replace(/^okai$/i, "okay")
    .replace(/^okey$/i, "okay")
    .replace(/^okayy+$/i, "okay")
    .replace(/^dac$/i, "d accord")
    .replace(/^dacc$/i, "d accord")
    .replace(/^sa va$/i, "ca va")
    .replace(/^ça va$/i, "ca va")
    .trim();
}

function construireAppel(user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  return pick([prenom, `**${prenom}**`]);
}

function adapterTexteGenre(texte = "", nom = "") {
  const appel = construireAppel({ nom });
  return String(texte || "")
    .replace(/ma chère\s+\*\*[^*]+\*\*/gi, appel)
    .replace(/mon cher\s+\*\*[^*]+\*\*/gi, appel)
    .replace(/ma chère\s+[^,\n]+/gi, appel)
    .replace(/mon cher\s+[^,\n]+/gi, appel)
    .replace(/mon élève/gi, appel)
    .replace(/cher élève/gi, appel);
}

function nettoyerAppelsRepetitifs(texte = "", nom = "") {
  return adapterTexteGenre(texte, nom)
    .replace(/(ma chère|mon cher)\s+\*\*[^\*]+\*\*/gi, construireAppel({ nom }));
}

function supprimerFormulesLourdesDAppel(texte = "", user = {}) {
  const prenom = premierPrenom(user?.nom || "");
  return String(texte || "")
    .replace(/\bAh,\s*\*\*[^*]+\*\*,?\s*/gi, "")
    .replace(/\bAh,\s*[^,\n]+,?\s*/gi, "")
    .replace(/\bfuture avocate\b/gi, "")
    .replace(/\bfutur avocat\b/gi, "")
    .replace(/\bmon cher\b/gi, prenom)
    .replace(/\bma chère\b/gi, prenom)
    .replace(/\bcher élève\b/gi, prenom)
    .replace(/\bmon élève\b/gi, prenom)
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function supprimerDoublonsLignes(texte = "") {
  const lignes = String(texte || "").split("\n");
  const resultat = [];
  let precedent = "";

  for (const ligne of lignes) {
    const n = ligne.trim().toLowerCase();
    if (n && n === precedent) continue;
    resultat.push(ligne.trimEnd());
    precedent = n;
  }

  return resultat.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------- MATH / SCIENCES ----------
function simplifierNotationMath(texte = "") {
  let t = String(texte || "");
  t = t.replace(/\\times/g, "×");
  t = t.replace(/\\div/g, "/");
  t = t.replace(/\\pm/g, "±");
  t = t.replace(/\\cdot/g, "×");
  t = t.replace(/\\sqrt\{([^}]+)\}/g, "√$1");
  t = t.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "$1 / $2");
  t = t.replace(/\^2/g, "²");
  t = t.replace(/\^3/g, "³");
  t = t.replace(/[{}]/g, "");
  t = t.replace(/\bH2O\b/g, "H₂O");
  t = t.replace(/\bCO2\b/g, "CO₂");
  t = t.replace(/\bO2\b/g, "O₂");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function simplifierPresentationScientifique(texte = "") {
  return String(texte || "")
    .replace(/\b([0-9]+)\.([0-9]+)\b/g, "$1,$2")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

module.exports = {
  horodatage,
  logInfo,
  logWarn,
  logError,
  nowMs,
  TTLCache,
  cache,
  makeCacheKey,
  getCache,
  setCache,
  processingQueues,
  runSequentialByKey,
  pick,
  safeJsonParse,
  attendre,
  tronquerTexte,
  estErreurQuotaGemini,
  normaliserNom,
  premierPrenom,
  nettoyer,
  retirerAccents,
  normaliserMessageCourt,
  normaliserTexteRelationnel,
  construireAppel,
  adapterTexteGenre,
  nettoyerAppelsRepetitifs,
  supprimerFormulesLourdesDAppel,
  supprimerDoublonsLignes,
  simplifierNotationMath,
  simplifierPresentationScientifique
};
