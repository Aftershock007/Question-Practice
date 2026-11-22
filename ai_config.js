window.AI_CONFIG = {
  autoEvaluate: false,

  engines: {
    check: {
      provider: "gemini",
      model: "gemini-4-hydrogen",
      thinking: "low"
    },
    grade: {
      provider: "gemini",
      model: "gemini-4-neon",
      thinking: "high"
    }
  },

  keys: {
    gemini: "DEMO_GEMINI_API_KEY"
  },

  customBaseUrl: "http://localhost:11434/v1"
};
