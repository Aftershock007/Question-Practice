// ============================================================================
// AI - MODELS & DEFAULTS (no real keys in this file: the repository is public)
// ----------------------------------------------------------------------------
// The app uses two AI set-ups ("engines"), both with ONE Gemini key:
//
//   check   Model 1 - everything except subjective grading: the AI Check of
//           uploaded questions (only when you press AI Check), the marking
//           checklist and the objective topic analysis (AI Analysis button).
//           Default: Google Gemini "gemini-4-hydrogen", low thinking tier.
//
//   grade   Model 2 - marks and the full analysis of every subjective answer
//           (AI Analysis button). Default: "gemini-4-neon", high thinking tier.
//
// The thinking tier you pick for each model in the API keys dialog (low /
// medium / high) is the one that model uses.
//
// API KEY: press "API keys" in the top bar of the app and paste your Gemini
// key once - both models use it. The key is kept only for the browser session: it
// survives a page refresh and is removed when you close the browser. It is never written
// to this repository or to permanent browser storage.
//
// The provider, model and thinking tier below are only defaults: the API keys
// dialog can change them per browser. A key here that is empty or starts with
// "DEMO_" counts as "not set up" and is never sent anywhere.
// ============================================================================

window.AI_CONFIG = {
  // Not used any more: AI analysis and grading start only from the "AI Analysis" button.
  autoEvaluate: false,

  engines: {
    check: {                        // AI Check, marking checklist, objective analysis
      provider: "gemini",           // "gemini" | "openai" | "anthropic" | "groq" | "openrouter" | "deepseek" | "mistral" | "custom"
      model: "gemini-4-hydrogen",
      thinking: "low"               // Gemini thinking level: "low" | "medium" | "high" | "default"
    },
    grade: {                        // subjective marks and analysis (AI Analysis button)
      provider: "gemini",
      model: "gemini-4-neon",
      thinking: "high"
    }
  },

  // One key per provider; both models above use the same Gemini key.
  // Leave these as DEMO_ placeholders: paste the real key in the app (API keys).
  keys: {
    gemini: "DEMO_GEMINI_API_KEY"
  },

  // Only for provider "custom": any OpenAI-compatible server
  // (Ollama, LM Studio, vLLM, LiteLLM...). For Ollama, start it with
  // OLLAMA_ORIGINS=* so the browser is allowed to call it.
  customBaseUrl: "http://localhost:11434/v1"
};
