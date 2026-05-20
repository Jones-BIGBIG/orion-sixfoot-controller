#!/usr/bin/env python3

from __future__ import annotations

import json
import subprocess
import time
from pathlib import Path


CAMERA_APP = Path("/Users/neal/codex260303/tmp/camera-eye/CameraEye.app")
CAMERA_REQUEST = Path("/Users/neal/codex260303/tmp/camera-eye/request.json")
BLE_APP = Path("/Users/neal/codex260303/tmp/ble_live/BLEScanner.app")
BLE_REQUEST = Path("/Users/neal/codex260303/tmp/ble_live/request.json")
OUT_DIR = Path("/Users/neal/codex260303/tmp/node-role-tests")
OUT_DIR.mkdir(parents=True, exist_ok=True)

CAMERA_NAME = "USB Camera VID:1133 PID:2085"
WATCH_DURATION = 6

NODES = [
    "E5D783D9-01D3-E4DA-7785-B53EFD0DD112",
    "6CC69D00-B0A8-C599-80EA-F22728BB92F5",
]

TESTS = [
    ("baseline", None),
    ("forward", "06 7A 00 63 00 00"),
    ("steer", "06 7A 00 00 00 63"),
]


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, check=True)


def run_allow_fail(cmd: list[str]) -> None:
    subprocess.run(cmd, check=False)


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def wait_for_file(path: Path, timeout: float = 20.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        time.sleep(0.25)
    raise TimeoutError(f"Timed out waiting for {path}")


def start_camera_watch(name: str) -> Path:
    output = OUT_DIR / f"{name}.camera.json"
    for suffix in ("", ".first.png", ".last.png"):
        Path(str(output) + suffix).unlink(missing_ok=True)
    write_json(
        CAMERA_REQUEST,
        {
            "mode": "watch-motion",
            "cameraName": CAMERA_NAME,
            "output": str(output),
            "duration": WATCH_DURATION,
            "pixelThreshold": 18,
            "ratioThreshold": 0.003,
        },
    )
    run(["open", str(CAMERA_APP)])
    return output


def start_ble_command(name: str, node: str, packet: str) -> Path:
    output = OUT_DIR / f"{name}.ble.json"
    output.unlink(missing_ok=True)
    Path(str(output) + ".log").unlink(missing_ok=True)
    run_allow_fail(["pkill", "-x", "BLEScanner"])
    write_json(
        BLE_REQUEST,
        {
            "mode": "handshake-aiqi",
            "target": node,
            "writeHex": packet,
            "output": str(output),
        },
    )
    run(["open", str(BLE_APP)])
    return output


def baseline(name: str) -> dict:
    camera_out = start_camera_watch(name)
    return {
        "camera": wait_for_file(camera_out, timeout=WATCH_DURATION + 10),
        "ble": None,
    }


def motion_case(name: str, node: str, packet: str) -> dict:
    camera_out = start_camera_watch(name)
    time.sleep(1.0)
    ble_out = start_ble_command(name, node, packet)
    camera = wait_for_file(camera_out, timeout=WATCH_DURATION + 10)
    ble = wait_for_file(ble_out, timeout=12)
    return {
        "camera": camera,
        "ble": ble,
    }


def summarize(results: dict) -> dict:
    baseline_ratio = results["baseline"]["camera"]["maxChangedRatio"]
    scored = {}
    for node in NODES:
        forward = results[f"{node}_forward"]["camera"]["maxChangedRatio"]
        steer = results[f"{node}_steer"]["camera"]["maxChangedRatio"]
        scored[node] = {
            "forwardRatio": forward,
            "steerRatio": steer,
            "forwardDelta": forward - baseline_ratio,
            "steerDelta": steer - baseline_ratio,
        }

    forward_node = max(scored, key=lambda n: scored[n]["forwardDelta"])
    steer_node = max(scored, key=lambda n: scored[n]["steerDelta"])

    return {
        "baselineRatio": baseline_ratio,
        "nodes": scored,
        "inference": {
            "forwardNode": forward_node,
            "steerNode": steer_node,
        }
    }


def main() -> int:
    results = {}
    results["baseline"] = baseline("baseline")
    for node in NODES:
        results[f"{node}_forward"] = motion_case(f"{node}_forward", node, "06 7A 00 63 00 00")
        results[f"{node}_steer"] = motion_case(f"{node}_steer", node, "06 7A 00 00 00 63")

    summary = summarize(results)
    summary_path = OUT_DIR / "summary.json"
    write_json(summary_path, summary)
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
