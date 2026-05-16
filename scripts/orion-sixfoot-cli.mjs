#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const protocolPath = path.join(root, "assets", "protocol", "orion-sixfoot.protocol.json");
const protocol = JSON.parse(fs.readFileSync(protocolPath, "utf8"));

function clamp(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid number: ${v}`);
  return Math.max(-99, Math.min(99, Math.trunc(n)));
}

function int16ToBytes(value) {
  const buf = Buffer.alloc(2);
  buf.writeInt16BE(value, 0);
  return [buf[0], buf[1]];
}

function hexify(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function parseHex(input) {
  const normalized = input.replace(/0x/gi, "").replace(/[^0-9a-fA-F]/g, "");
  if (normalized.length % 2 !== 0) throw new Error("Hex input must contain an even number of digits.");
  const bytes = [];
  for (let i = 0; i < normalized.length; i += 2) {
    bytes.push(Number.parseInt(normalized.slice(i, i + 2), 16));
  }
  return bytes;
}

function encodeMotion(power, steer) {
  const p = clamp(power);
  const s = clamp(steer);
  return [0x06, 0x7a, ...int16ToBytes(p), ...int16ToBytes(s)];
}

function decodeMotion(bytes) {
  if (bytes.length !== 6) throw new Error("Motion frame must be exactly 6 bytes.");
  if (bytes[0] !== 0x06 || bytes[1] !== 0x7a) throw new Error("Not a known SixFoot motion frame.");
  const buf = Buffer.from(bytes);
  return {
    power: buf.readInt16BE(2),
    steer: buf.readInt16BE(4)
  };
}

function readOption(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    throw new Error(`Missing option ${name}`);
  }
  return process.argv[idx + 1];
}

function usage() {
  return [
    "Usage:",
    "  orion-sixfoot protocol",
    "  orion-sixfoot encode-motion --power <int> --steer <int>",
    "  orion-sixfoot decode-motion --hex \"06 7A 00 63 00 00\""
  ].join("\n");
}

try {
  const cmd = process.argv[2];
  switch (cmd) {
    case "protocol":
      process.stdout.write(JSON.stringify(protocol, null, 2) + "\n");
      break;
    case "encode-motion": {
      const power = readOption("--power");
      const steer = readOption("--steer");
      const bytes = encodeMotion(power, steer);
      process.stdout.write(
        JSON.stringify(
          {
            type: "motion",
            power: clamp(power),
            steer: clamp(steer),
            bytes,
            hex: hexify(bytes)
          },
          null,
          2
        ) + "\n"
      );
      break;
    }
    case "decode-motion": {
      const hex = readOption("--hex");
      const bytes = parseHex(hex);
      process.stdout.write(
        JSON.stringify(
          {
            type: "motion",
            bytes,
            hex: hexify(bytes),
            ...decodeMotion(bytes)
          },
          null,
          2
        ) + "\n"
      );
      break;
    }
    default:
      process.stderr.write(usage() + "\n");
      process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
