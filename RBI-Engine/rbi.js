#!/usr/bin/env node
"use strict";

const major = Number(String(process.versions.node).split(".")[0]);
if (major < 18) {
  process.stderr.write("RBI-Engine needs Node.js 18 or newer. You have " + process.version + ". Install the LTS version from https://nodejs.org and try again.\n");
  process.exit(1);
}

require("./src/cli").main(process.argv.slice(2)).then(
  code => {
    process.exitCode = code;
    setTimeout(() => process.exit(code), 300).unref();
  },
  err => {
    process.stderr.write("Unexpected error: " + ((err && err.stack) || String(err)) + "\n");
    process.exitCode = 1;
  }
);
