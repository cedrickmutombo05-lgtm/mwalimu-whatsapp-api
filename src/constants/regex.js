

const REGEX_HEADER_MWALIMU = /🔴🟡🔵\s*\*?Mwalimu EdTech\s*:\s*Ton Mentor pour l'Excellence\*?\s*🇨🇩/gi;

const REGEX_BLOC_CONSOLIDATION = /❓\s*\*?\*?\[?CONSOLIDATION\]?\*?\*?[\s\S]*?(?=\n👉|\n🌟|\n\*\*\*«|$)/i;

const REGEX_STRUCTURE_MWALIMU = /🔵\s*\*?\*?\[?VÉCU\]?\*?\*?|🟡\s*\*?\*?\[?SAVOIR\]?\*?\*?|🔴\s*\*?\*?\[?INSPIRATION\]?\*?\*?|❓\s*\*?\*?\[?CONSOLIDATION\]?\*?\*?/i;

const REGEX_VECU = /🔵\s*\*?\*?\[?VÉCU\]?\*?\*?/i;
const REGEX_SAVOIR = /🟡\s*\*?\*?\[?SAVOIR\]?\*?\*?/i;
const REGEX_INSPIRATION = /🔴\s*\*?\*?\[?INSPIRATION\]?\*?\*?/i;
const REGEX_CONSOLIDATION = /❓\s*\*?\*?\[?CONSOLIDATION\]?\*?\*?/i;

module.exports = {
  REGEX_HEADER_MWALIMU,
  REGEX_BLOC_CONSOLIDATION,
  REGEX_STRUCTURE_MWALIMU,
  REGEX_VECU,
  REGEX_SAVOIR,
  REGEX_INSPIRATION,
  REGEX_CONSOLIDATION
};
