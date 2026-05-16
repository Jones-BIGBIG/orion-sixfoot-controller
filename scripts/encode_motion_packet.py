#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from typing import List


def clamp(value: int) -> int:
    return max(-99, min(99, int(value)))


def int16_be(value: int) -> List[int]:
    value &= 0xFFFF
    return [(value >> 8) & 0xFF, value & 0xFF]


def encode_motion(power: int, steer: int) -> List[int]:
    power = clamp(power)
    steer = clamp(steer)
    return [0x06, 0x7A, *int16_be(power), *int16_be(steer)]


def main() -> int:
    parser = argparse.ArgumentParser(description="Encode Orion SixFoot Titan motion packets.")
    parser.add_argument("--power", required=True, type=int)
    parser.add_argument("--steer", required=True, type=int)
    args = parser.parse_args()

    power = clamp(args.power)
    steer = clamp(args.steer)
    packet = encode_motion(power, steer)

    print(
        json.dumps(
            {
                "type": "motion",
                "power": power,
                "steer": steer,
                "bytes": packet,
                "hex": " ".join(f"{b:02X}" for b in packet),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
