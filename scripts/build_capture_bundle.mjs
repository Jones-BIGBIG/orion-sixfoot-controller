#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function opt(name) {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : null;
}

const bridgeDist = opt("--bridge-dist");
const out = opt("--out") || path.resolve("capture-output", "live-capture.bundle.js");
const hook = path.resolve(path.dirname(new URL(import.meta.url).pathname), "live_capture_hook.js");

if (!bridgeDist) {
  process.stderr.write("Missing --bridge-dist /path/to/frida-il2cpp-bridge/dist/index.js\n");
  process.exit(1);
}

const bridge = fs.readFileSync(bridgeDist, "utf8");
const hookCode = fs.readFileSync(hook, "utf8");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${bridge}\n\n${hookCode}\n`, "utf8");
process.stdout.write(`Wrote ${out}\n`);
