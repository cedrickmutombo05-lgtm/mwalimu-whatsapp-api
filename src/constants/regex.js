
const REGEX_HEADER_MWALIMU = /🔴🟡🔵\s*\*?Mwalimu EdTech\s*:\s*Ton Mentor pour l'Excellence\*?\s*🇨🇩/gi;

const REGEX_BLOC_CONSOLIDATION = /❓\s*\[CONSOLIDATION\][\s\S]*?(?=\n👉|\n🌟|\n\*\*\*«|$)/i;

const REGEX_STRUCTURE_MWALIMU = /🔵\s*\[VÉCU\]|🟡\s*\[SAVOIR\]|🔴\s*\[INSPIRATION\]|❓\s*\[CONSOLIDATION\]/i;

module.exports = {
  REGEX_HEADER_MWALIMU,
  REGEX_BLOC_CONSOLIDATION,
  REGEX_STRUCTURE_MWALIMU
};
