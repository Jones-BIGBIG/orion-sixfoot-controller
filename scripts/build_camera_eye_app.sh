#!/bin/zsh
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT_DIR="${1:-$HOME/tmp/CameraEye.app}"
APP_DIR="$OUT_DIR/Contents/MacOS"

mkdir -p "$APP_DIR"
cp "$ROOT/scripts/CameraEyeInfo.plist" "$OUT_DIR/Contents/Info.plist"

swiftc -O \
  -framework AVFoundation \
  -framework AppKit \
  -framework CoreImage \
  -framework ImageIO \
  -framework UniformTypeIdentifiers \
  "$ROOT/scripts/CameraEyeApp.swift" \
  -o "$APP_DIR/CameraEye"

codesign --force --deep --sign - "$OUT_DIR"
echo "$OUT_DIR"
