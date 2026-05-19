# Camera Eye

This plugin can use a local camera as a minimal physical-world sensor without adding a separate external plugin first.

Current approach:

1. Enumerate cameras with `ffmpeg`
2. Capture one frame from the selected camera
3. Capture a short burst of frames
4. Compute frame-to-frame differences and decide whether motion happened

## Why this is enough

For robot debugging, the first useful question is:

- did the robot move?
- how much did the scene change?
- did a control command produce any visible physical response?

That can be answered with frame differencing before adding a heavier vision model.

## Commands

List cameras:

```bash
node ./scripts/orion-sixfoot-cli.mjs list-cameras
```

Capture one frame:

```bash
node ./scripts/orion-sixfoot-cli.mjs capture-frame \
  --camera-id 1 \
  --out ./captures/frame.png \
  --width 1280 \
  --height 720
```

Watch motion:

```bash
node ./scripts/orion-sixfoot-cli.mjs watch-motion \
  --camera-id 1 \
  --out-dir ./captures/watch-01 \
  --duration 4 \
  --fps 2 \
  --width 640 \
  --height 480
```

Artifacts written to `--out-dir`:

- `capture.rgb`
- `first.ppm`
- `last.ppm`
- `summary.json`

## Interpreting output

Key fields from `summary.json`:

- `motionDetected`
- `maxChangedRatio`
- `maxMeanDiff`
- `pairs[]`

If `motionDetected` is false while a motion command was sent, the most likely causes are:

- no physical movement happened
- camera framing missed the robot
- thresholds are too high

## Fara

Fara is useful as a higher-level visual backend after the camera bridge exists.

Use Fara when you want:

- semantic interpretation of the robot pose
- natural-language judgment over captured frames
- richer scene understanding

Do not use Fara as the camera driver. The camera bridge should stay separate.

## What is still missing

- automatic robot localization in frame
- command-to-visual-feedback closed loop
- multi-frame trajectory tracking
- direct Fara integration over captured frames
