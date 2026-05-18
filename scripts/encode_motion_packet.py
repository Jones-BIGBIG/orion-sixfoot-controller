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


def encode_session_motion(power: int, steer: int, cipher: int) -> List[int]:
    cipher = int(cipher)
    if cipher < 0 or cipher > 255:
        raise ValueError("cipher must be in range 0..255")
    return [*encode_motion(power, steer), cipher]


def main() -> int:
    parser = argparse.ArgumentParser(description="Encode Orion SixFoot Titan motion packets.")
    parser.add_argument("--power", required=True, type=int)
    parser.add_argument("--steer", required=True, type=int)
    parser.add_argument("--cipher", type=int)
    args = parser.parse_args()

    power = clamp(args.power)
    steer = clamp(args.steer)
    packet = encode_session_motion(power, steer, args.cipher) if args.cipher is not None else encode_motion(power, steer)

    print(
        json.dumps(
            {
                "type": "session-motion" if args.cipher is not None else "motion",
                "power": power,
                "steer": steer,
                **({"cipher": args.cipher} if args.cipher is not None else {}),
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
