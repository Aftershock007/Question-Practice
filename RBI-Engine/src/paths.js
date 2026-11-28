"use strict";

const os = require("os");
const path = require("path");

function enginePaths(env = process.env) {
  const root = path.resolve(__dirname, "..");
  const data = env.RBI_ENGINE_DATA ? path.resolve(env.RBI_ENGINE_DATA) : path.join(root, "data");
  return {
    root,
    data,
    cache: path.join(data, "cache"),
    schemes: path.join(data, "schemes"),
    history: path.join(data, "history.json"),
    settings: path.join(data, "settings.json"),
    reports: env.RBI_ENGINE_REPORTS ? path.resolve(env.RBI_ENGINE_REPORTS) : path.join(root, "reports"),
    answers: env.RBI_ENGINE_ANSWERS ? path.resolve(env.RBI_ENGINE_ANSWERS) : path.join(root, "answers"),
    examples: path.join(root, "examples"),
    keysFile: env.RBI_ENGINE_KEYS ? path.resolve(env.RBI_ENGINE_KEYS) : path.join(os.homedir(), ".rbi-engine", "keys.json")
  };
}

module.exports = { enginePaths };
