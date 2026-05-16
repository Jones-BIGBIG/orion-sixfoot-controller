---
name: orion-sixfoot-controller
description: "Use this plugin when the task is about the Orion SixFoot Titan robot, the 木星黎明 Android app, BLE control packet generation, protocol inspection, or live packet capture preparation."
license: MIT
---

# Orion SixFoot Controller

## Use this skill when

- the user wants to inspect or reuse the extracted SixFoot Titan protocol
- the user wants motion packet bytes
- the user wants Python or Node scripts for packet generation
- the user wants to continue live capture of handshake or light packets

## Files to use first

- `assets/protocol/orion-sixfoot.protocol.json`
- `docs/protocol.md`
- `docs/live-capture.md`
- `scripts/orion-sixfoot-cli.mjs`
- `scripts/encode_motion_packet.py`

## Workflow

1. Read `assets/protocol/orion-sixfoot.protocol.json` for structured facts.
2. If the user needs a motion frame, use:
   - `node ./scripts/orion-sixfoot-cli.mjs encode-motion --power <n> --steer <n>`
   - or `python3 ./scripts/encode_motion_packet.py --power <n> --steer <n>`
3. If the user needs a decoded frame, use:
   - `node ./scripts/orion-sixfoot-cli.mjs decode-motion --hex "<bytes>"`
4. If the user wants live extraction, follow `docs/live-capture.md`.

## Constraints

- Do not claim that static files alone are enough for guaranteed live robot control.
- Be explicit that handshake `cipher` and final light prefixes still require one real device session.
- Treat gait, phase, and balance control as firmware-side unless new evidence disproves it.
