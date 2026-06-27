
function pick(arr = []) {
  if (!arr.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function safeJsonParse(v, fallback = []) {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

function nowMs() {
  return Date.now();
}

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tronquerTexte(texte = "", max = 3500) {
  const t = String(texte || "").trim();
  return t.length <= max ? t : `${t.slice(0, max)}...`;
}

module.exports = {
  pick,
  safeJsonParse,
  nowMs,
  attendre,
  tronquerTexte
};
