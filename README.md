# Orion SixFoot Controller

Codex plugin and standalone toolkit for the `木星黎明` (`com.aiqi.robotwar`) Android app's `猎户座六足泰坦 / SixFoot` control path.

It packages the reverse-engineered protocol details extracted from the app into a form that is directly reusable for:

- BLE UUID lookup
- motion packet generation
- offline protocol inspection
- live Frida capture of outgoing packets during a real device session

## Current state

What is fully extracted:

- AIQI motion-control GATT UUIDs
- Mesh Proxy UUIDs
- OTA UUIDs
- SixFoot three-peripheral topology
- exact 6-byte motion packet layout
- high-level AI move to motor-frame mapping
- live-confirmed handshake sequence
- live-confirmed post-handshake motion frame shape
- confirmed movement on both motor nodes

What is still dynamic and must be captured from a real robot session:

- the fixed template prefix bytes used by the two light-control packet variants
- runtime peripheral addresses and mesh keys returned by the robot

## Directory layout

- [assets/protocol/orion-sixfoot.protocol.json](./assets/protocol/orion-sixfoot.protocol.json): structured protocol output
- [docs/protocol.md](./docs/protocol.md): detailed reverse-engineering notes
- [docs/live-capture.md](./docs/live-capture.md): next-step capture workflow
- [scripts/orion-sixfoot-cli.mjs](./scripts/orion-sixfoot-cli.mjs): Node CLI
- [scripts/encode_motion_packet.py](./scripts/encode_motion_packet.py): Python encoder
- [scripts/live_capture_hook.js](./scripts/live_capture_hook.js): Frida hook payload
- [scripts/build_capture_bundle.mjs](./scripts/build_capture_bundle.mjs): combines bridge runtime + hook payload
- [skills/orion-sixfoot-controller/SKILL.md](./skills/orion-sixfoot-controller/SKILL.md): Codex skill entry

## Motion packet

The confirmed motor control frame is:

```text
06 7A <power_hi> <power_lo> <steer_hi> <steer_lo>
```

`power` and `steer` are signed `int16` big-endian values, clamped by the app to `[-99, 99]`.

Examples:

```text
forward 99   -> 06 7A 00 63 00 00
backward 99  -> 06 7A FF 9D 00 00
left turn 99 -> 06 7A 00 00 00 63
right turn 99-> 06 7A 00 00 FF 9D
```

Live debugging has now confirmed:

```text
00 52 -> 01 53 <cipher>
00 56 -> 07 4E <7 serial bytes>
01 46 <xor(sn)> <cipher> -> 01 47 01
final motion = 06 7A <power_hi> <power_lo> <steer_hi> <steer_lo> <cipher>
```

## CLI usage

```bash
node ./scripts/orion-sixfoot-cli.mjs protocol
node ./scripts/orion-sixfoot-cli.mjs encode-motion --power 99 --steer 0
node ./scripts/orion-sixfoot-cli.mjs encode-session-motion --power 99 --steer 0 --cipher 15
node ./scripts/orion-sixfoot-cli.mjs decode-motion --hex "06 7A 00 63 00 00"
python3 ./scripts/encode_motion_packet.py --power 99 --steer 0
python3 ./scripts/encode_motion_packet.py --power 99 --steer 0 --cipher 15
```

## Publish / install

This repo is designed to be:

- a standalone GitHub repository
- a local Codex plugin under `./plugins/orion-sixfoot-controller`

The plugin manifest is at [plugin.json](./.codex-plugin/plugin.json).

## Build a Frida capture bundle

```bash
node ./scripts/build_capture_bundle.mjs \
  --bridge-dist /path/to/frida-il2cpp-bridge/dist/index.js \
  --out ./capture-output/live-capture.bundle.js
```

Then run:

```bash
frida -U -f com.aiqi.robotwar -l ./capture-output/live-capture.bundle.js
```

## Limits

This plugin does not pretend to directly control a live robot from static files alone. It packages everything already proven from static reverse engineering and leaves the live handshake step explicit instead of hiding it behind guesses.
