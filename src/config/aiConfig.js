
const aiConfig = {
  model: "gemini-2.5-flash",

  temperature: {
    strict: 0,
    normal: 0.1,
    media: 0.2
  },

  retry: {
    maxRetries: 2,
    baseDelayMs: 1800,
    extraDelayMs: 1400,
    quotaDelayMs: 4000
  }
};

module.exports = {
  aiConfig
};
