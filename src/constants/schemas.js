
const JSON_SCHEMA_INTENTION = {
  type: "OBJECT",
  properties: {
    intention: { type: "STRING" },
    matiere: { type: "STRING" },
    besoinCorrectionRenforcee: { type: "BOOLEAN" },
    sujet: { type: "STRING" }
  },
  required: ["intention", "matiere", "besoinCorrectionRenforcee", "sujet"]
};

const JSON_SCHEMA_AUDIO = {
  type: "OBJECT",
  properties: {
    transcription: { type: "STRING" },
    type: { type: "STRING" }
  },
  required: ["transcription", "type"]
};

module.exports = {
  JSON_SCHEMA_INTENTION,
  JSON_SCHEMA_AUDIO
};
