// ============================================================================
// AI EVALUATION - API KEYS & DEFAULTS
// ----------------------------------------------------------------------------
// After you submit a subjective test, the app sends each answer (with the
// evaluation prompt from prompt.js) to the AI provider chosen here and shows
// you an examiner-style assessment. It needs an API key from ONE provider.
//
// HOW TO ADD YOUR KEY - pick one:
//
//   1. Recommended: open the app -> "AI Settings" (top bar) -> paste key -> Save.
//      The key is stored only in that browser (localStorage). It never goes
//      into this repository, so it is safe even on GitHub Pages.
//
//   2. Replace a DEMO_ placeholder below with your real key.
//      WARNING: this repository is public. Anything you write in this file is
//      visible to everyone once you commit/push it (and Google/OpenAI revoke
//      leaked keys). Only do this in a private, local copy.
//
// Keys saved in AI Settings take priority over this file.
// A key that is empty or starts with "DEMO_" counts as "not set up": it is
// never sent anywhere, and the app shows "Add API key" instead of grading.
// ============================================================================

// Built-in OpenRouter key (added on request): the AI check, analysis and grading use it
// without asking. NOTE: this file is public on GitHub / GitHub Pages, so anyone can read
// this key. A key saved in AI Settings still takes priority.
const OPENROUTER_API_KEY = "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";

window.AI_CONFIG = {
  // Which provider grades your answers:
  // "gemini" | "openai" | "anthropic" | "groq" | "openrouter" | "deepseek" | "mistral" | "custom"
  provider: "openrouter",

  // Grade every answer automatically as soon as a subjective test is submitted.
  autoEvaluate: true,

  // One key per provider. Only the selected provider's key is used.
  keys: {
    gemini:     "DEMO_GEMINI_API_KEY",      // https://aistudio.google.com/app/apikey  (free tier)
    openai:     "DEMO_OPENAI_API_KEY",      // https://platform.openai.com/api-keys
    anthropic:  "DEMO_ANTHROPIC_API_KEY",   // https://console.anthropic.com/settings/keys
    groq:       "DEMO_GROQ_API_KEY",        // https://console.groq.com/keys           (free tier)
    openrouter: OPENROUTER_API_KEY,         // built in (see above) - https://openrouter.ai/settings/keys
    deepseek:   "DEMO_DEEPSEEK_API_KEY",    // https://platform.deepseek.com/api_keys
    mistral:    "DEMO_MISTRAL_API_KEY",     // https://console.mistral.ai/api-keys
    custom:     ""                          // optional - local servers usually need no key
  },

  // Model per provider. Providers retire models often: if one stops working,
  // open AI Settings -> "Load models" to see every model your key can use.
  models: {
    gemini:     "gemini-3.8-flash",
    openai:     "gpt-6.2-sol",
    anthropic:  "claude-opus-5-5",
    groq:       "openai/gpt-oss-120b",
    openrouter: "nvidia/nemotron-3.5-super-vl:free",   // free; NVIDIA Nemotron 3.5 Super VL
    deepseek:   "deepseek-chat",
    mistral:    "mistral-medium-latest",
    custom:     "llama3.1"
  },

  // Only for provider "custom": any OpenAI-compatible server
  // (Ollama, LM Studio, vLLM, LiteLLM...). For Ollama, start it with
  // OLLAMA_ORIGINS=* so the browser is allowed to call it.
  customBaseUrl: "http://localhost:11434/v1"
};
