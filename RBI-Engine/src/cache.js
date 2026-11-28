"use strict";

const fs = require("fs");
const path = require("path");
const { sha256 } = require("./util");

function requestKey(parts) {
  return sha256(JSON.stringify(parts));
}

function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + "." + process.pid + "." + Date.now() + "." + Math.random().toString(36).slice(2, 8) + ".tmp";
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

function store(dir) {
  const api = {
    dir,
    lastError: null,
    get(key) {
      return readJSON(path.join(dir, key + ".json"));
    },
    set(key, value) {
      try {
        writeAtomic(path.join(dir, key + ".json"), JSON.stringify(value));
        return true;
      } catch (err) {
        api.lastError = err;
        return false;
      }
    }
  };
  return api;
}

function createCache(dir) {
  return store(dir);
}

function createSchemeStore(dir) {
  return store(dir);
}

function createLimiter(n) {
  const size = Math.max(1, Number(n) || 1);
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= size || !queue.length) return;
    active++;
    const job = queue.shift();
    Promise.resolve()
      .then(job.fn)
      .then(job.resolve, job.reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return fn => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
}

module.exports = { requestKey, createCache, createSchemeStore, createLimiter, writeAtomic, readJSON };
