#!/usr/bin/env node

import childProcess from "node:child_process";
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

function requireFfmpeg() {
  try {
    childProcess.execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg is required but not available in PATH.");
  }
}

function listCameras() {
  requireFfmpeg();
  const result = childProcess.spawnSync(
    "ffmpeg",
    ["-f", "avfoundation", "-list_devices", "true", "-i", ""],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const cameras = [];
  let inVideoSection = false;
  for (const line of output.split("\n")) {
    if (line.includes("AVFoundation video devices:")) {
      inVideoSection = true;
      continue;
    }
    if (line.includes("AVFoundation audio devices:")) {
      inVideoSection = false;
      continue;
    }
    const match = line.match(/^\[AVFoundation indev @ .*?\] \[(\d+)\] (.+)$/);
    if (match && inVideoSection) {
      cameras.push({ id: Number(match[1]), name: match[2] });
    }
  }
  return cameras;
}

function readIntOption(name, fallback) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  if (idx + 1 >= process.argv.length) throw new Error(`Missing value for ${name}`);
  return Number.parseInt(process.argv[idx + 1], 10);
}

function readStringOption(name, fallback = null) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  if (idx + 1 >= process.argv.length) throw new Error(`Missing value for ${name}`);
  return process.argv[idx + 1];
}

function captureFrame(cameraId, outPath, width, height) {
  requireFfmpeg();
  const fps = 30;
  childProcess.execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "avfoundation",
      "-framerate",
      String(fps),
      "-video_size",
      `${width}x${height}`,
      "-i",
      `${cameraId}:none`,
      "-frames:v",
      "1",
      "-update",
      "1",
      outPath
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  return outPath;
}

function writePpm(filePath, frame, width, height) {
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, "ascii");
  fs.writeFileSync(filePath, Buffer.concat([header, frame]));
}

function watchMotion(cameraId, outDir, duration, fps, width, height, pixelThreshold, ratioThreshold) {
  requireFfmpeg();
  fs.mkdirSync(outDir, { recursive: true });
  const rawPath = path.join(outDir, "capture.rgb");
  const captureFps = 30;
  const frameCount = Math.max(2, Math.round(duration * captureFps));

  childProcess.execFileSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "avfoundation",
      "-framerate",
      String(captureFps),
      "-video_size",
      `${width}x${height}`,
      "-i",
      `${cameraId}:none`,
      "-frames:v",
      String(frameCount),
      "-pix_fmt",
      "rgb24",
      "-f",
      "rawvideo",
      rawPath
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  const raw = fs.readFileSync(rawPath);
  const frameSize = width * height * 3;
  const actualFrames = Math.floor(raw.length / frameSize);
  if (actualFrames < 2) throw new Error("Not enough frames captured to analyze motion.");

  const frames = [];
  for (let i = 0; i < actualFrames; i += 1) {
    frames.push(raw.subarray(i * frameSize, (i + 1) * frameSize));
  }

  writePpm(path.join(outDir, "first.ppm"), frames[0], width, height);
  writePpm(path.join(outDir, "last.ppm"), frames[frames.length - 1], width, height);

  const pairs = [];
  let maxChangedRatio = 0;
  let maxMeanDiff = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const a = frames[i - 1];
    const b = frames[i];
    let changedPixels = 0;
    let totalDiff = 0;
    for (let p = 0; p < a.length; p += 3) {
      const dr = Math.abs(a[p] - b[p]);
      const dg = Math.abs(a[p + 1] - b[p + 1]);
      const db = Math.abs(a[p + 2] - b[p + 2]);
      const pixelDiff = Math.max(dr, dg, db);
      totalDiff += dr + dg + db;
      if (pixelDiff >= pixelThreshold) changedPixels += 1;
    }
    const changedRatio = changedPixels / (width * height);
    const meanDiff = totalDiff / (width * height * 3 * 255);
    maxChangedRatio = Math.max(maxChangedRatio, changedRatio);
    maxMeanDiff = Math.max(maxMeanDiff, meanDiff);
    pairs.push({
      fromFrame: i - 1,
      toFrame: i,
      changedPixels,
      changedRatio,
      meanDiff
    });
  }

  const summary = {
    type: "motion-watch",
    cameraId,
    duration,
    fps: captureFps,
    width,
    height,
    frameCount: actualFrames,
    thresholds: {
      pixelThreshold,
      ratioThreshold
    },
    maxChangedRatio,
    maxMeanDiff,
    motionDetected: maxChangedRatio >= ratioThreshold,
    artifacts: {
      rawPath,
      firstFrame: path.join(outDir, "first.ppm"),
      lastFrame: path.join(outDir, "last.ppm")
    },
    pairs
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}

function encodeMotion(power, steer) {
  const p = clamp(power);
  const s = clamp(steer);
  return [0x06, 0x7a, ...int16ToBytes(p), ...int16ToBytes(s)];
}

function encodeSessionMotion(power, steer, cipher) {
  const c = Number(cipher);
  if (!Number.isInteger(c) || c < 0 || c > 255) {
    throw new Error(`Invalid cipher byte: ${cipher}`);
  }
  return [...encodeMotion(power, steer), c];
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
    "  orion-sixfoot list-cameras",
    "  orion-sixfoot capture-frame --camera-id <int> --out <path> [--width 1280 --height 720]",
    "  orion-sixfoot watch-motion --camera-id <int> --out-dir <path> [--duration 4 --fps 2 --width 640 --height 480]",
    "  orion-sixfoot encode-motion --power <int> --steer <int>",
    "  orion-sixfoot encode-session-motion --power <int> --steer <int> --cipher <0-255>",
    "  orion-sixfoot decode-motion --hex \"06 7A 00 63 00 00\""
  ].join("\n");
}

try {
  const cmd = process.argv[2];
  switch (cmd) {
    case "protocol":
      process.stdout.write(JSON.stringify(protocol, null, 2) + "\n");
      break;
    case "list-cameras":
      process.stdout.write(JSON.stringify({ type: "camera-list", cameras: listCameras() }, null, 2) + "\n");
      break;
    case "capture-frame": {
      const cameraId = readIntOption("--camera-id");
      const outPath = readStringOption("--out");
      const width = readIntOption("--width", 1280);
      const height = readIntOption("--height", 720);
      if (cameraId == null || !outPath) throw new Error("capture-frame requires --camera-id and --out");
      captureFrame(cameraId, outPath, width, height);
      process.stdout.write(
        JSON.stringify(
          {
            type: "capture-frame",
            cameraId,
            out: outPath,
            width,
            height
          },
          null,
          2
        ) + "\n"
      );
      break;
    }
    case "watch-motion": {
      const cameraId = readIntOption("--camera-id");
      const outDir = readStringOption("--out-dir");
      const duration = readIntOption("--duration", 4);
      const fps = readIntOption("--fps", 2);
      const width = readIntOption("--width", 640);
      const height = readIntOption("--height", 480);
      const pixelThreshold = readIntOption("--pixel-threshold", 24);
      const ratioThreshold = Number(readStringOption("--ratio-threshold", "0.005"));
      if (cameraId == null || !outDir) throw new Error("watch-motion requires --camera-id and --out-dir");
      process.stdout.write(
        JSON.stringify(
          watchMotion(cameraId, outDir, duration, fps, width, height, pixelThreshold, ratioThreshold),
          null,
          2
        ) + "\n"
      );
      break;
    }
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
    case "encode-session-motion": {
      const power = readOption("--power");
      const steer = readOption("--steer");
      const cipher = readOption("--cipher");
      const bytes = encodeSessionMotion(power, steer, cipher);
      process.stdout.write(
        JSON.stringify(
          {
            type: "session-motion",
            power: clamp(power),
            steer: clamp(steer),
            cipher: Number(cipher),
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
