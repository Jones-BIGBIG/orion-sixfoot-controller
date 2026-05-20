# Protocol Notes

This document packages the reverse-engineered results extracted from the Android app.

## Source of truth

Primary extracted files:

- `/tmp/robotwar_rev/il2cpp_dump/com.aiqi.robotwar/2.1.8/Assembly-CSharp.cs`
- `/tmp/robotwar_rev/jadx_out/sources/com/aiqi/bluetooth/CentralManager.java`
- `/tmp/robotwar_rev/jadx_out/sources/com/aiqi/airoha/MeshManager.java`
- `/tmp/robotwar_rev/jadx_out/resources/assets/Bluetooth/BluetoothData.json`

## Confirmed architecture

- Product code in app: `SixFoot`
- Product display name: `猎户座六足泰坦`
- Peripheral topology:
  - `powerMotor`
  - `steerMotor`
  - `stateLight`

## Confirmed UUIDs

### AIQI control channel

```text
SERVICE = 6E400001-B5A3-F393-E0A9-E50E24DCCA9E
TX      = 6E400002-B5A3-F393-E0A9-E50E24DCCA9E
RX      = 6E400003-B5A3-F393-E0A9-E50E24DCCA9E
```

### Mesh Proxy

```text
SERVICE = 00001828-0000-1000-8000-00805F9B34FB
TX      = 00002ADD-0000-1000-8000-00805F9B34FB
RX      = 00002ADE-0000-1000-8000-00805F9B34FB
```

### OTA

```text
AB1611 SERVICE = 4169726F-6861-4446-5553-657276696365
AB1611 TX      = 4169726F-6861-4446-5543-6F6D6D616E64
AB1611 RX      = 4169726F-6861-4446-5543-6D6452657370

TE8253 SERVICE = 00010203-0405-0607-0809-0A0B0C0D1912
TE8253 TX      = 00010203-0405-0607-0809-0A0B0C0D2B12
```

## Confirmed motion packet

`SixfootModel.ControlMotor(int power, int steer)` compiles to a fixed 6-byte packet generator.

```text
06 7A <power_hi> <power_lo> <steer_hi> <steer_lo>
```

- `power` is signed big-endian `int16`
- `steer` is signed big-endian `int16`
- app clamps both values to `[-99, 99]`

Examples:

```text
forward 99    = 06 7A 00 63 00 00
backward 99   = 06 7A FF 9D 00 00
left turn 99  = 06 7A 00 00 00 63
right turn 99 = 06 7A 00 00 FF 9D
```

## Confirmed AI mapping

`SixFootAI` does not emit per-leg servo commands. It maps behavior to the same high-level motor packet:

- `MoveForward(num)` -> `ControlMotor(+abs(num), 0)`
- `MoveBackward(num)` -> `ControlMotor(-abs(num), 0)`
- `TrunLeft(num)` -> `ControlMotor(0, +abs(num))`
- `TrunRigth(num)` -> `ControlMotor(0, -abs(num))`

This means gait phase and balance control are firmware-side, not app-side.

## Light packets

Two light-control overloads exist:

### RGB variant

Length 11. Confirmed dynamic bytes:

- `[4]` `stateLight.mesh.address low`
- `[5]` `stateLight.mesh.address high`
- `[8]` `red`
- `[9]` `green`
- `[10]` `blue`

### Mode variant

Length 10. Confirmed dynamic bytes:

- `[4]` `stateLight.mesh.address low`
- `[5]` `stateLight.mesh.address high`
- `[8]` `frequency + (flicker << 4)`
- `[9]` `color`

The fixed prefix bytes are not yet fully recovered from a live session.

## Handshake / session layer

`BluetoothController` contains:

- `XOR(byte[] array)`
- `PeripheralState.cipher`
- `PeripheralState.isHandshaked`

Static plus live evidence now supports this model:

### Step 1, get cipher

Request:

```text
00 52
```

Observed live response shape:

```text
01 53 <cipher>
```

Interpretation:

- response opcode `0x53`
- cipher byte is `buffer[2]`

### Step 2, get serial bytes

Request:

```text
00 56
```

Observed live response shape:

```text
07 4E <7 serial bytes>
```

Interpretation:

- response opcode `0x4E`
- serial bytes are the 7 trailing bytes `buffer[2..8]`

Computed:

```text
XOR(serial_bytes) = serial_xor
```

### Step 3, handshake completion packet

Derived from the app's `Handshake` state machine:

```text
01 46 <xor(sn)> <cipher>
```

Meaning:

- byte 2 is `XOR(sn)`
- byte 3 is `cipher`

Expected success response from static analysis:

```text
?? 47 01
```

### Outgoing motion after handshake

`TrySendAIQIPacket` does not XOR the movement frame. Once `isHandshaked` is true, it appends the current `cipher` byte to the outgoing packet.

So the final post-handshake motion frame shape is:

```text
06 7A <power_hi> <power_lo> <steer_hi> <steer_lo> <cipher>
```

## Live-confirmed node examples

Node `E5D783D9-01D3-E4DA-7785-B53EFD0DD112`

```text
00 52 -> 01 53 0F
00 56 -> 07 4E 19 0C 14 00 52 62 09
XOR(sn) = 38
01 46 38 0F -> 01 47 01
forward = 06 7A 00 63 00 00 0F
```

Node `6CC69D00-B0A8-C599-80EA-F22728BB92F5`

```text
00 52 -> 01 53 00
00 56 -> 07 4E 19 0C 14 00 4C 19 04
XOR(sn) = 50
01 46 50 00 -> 01 47 01
forward = 06 7A 00 63 00 00 00
```

## Current conclusion

The session layer is now confirmed:

- query cipher
- query serial
- compute `XOR(sn)`
- send second handshake packet
- append cipher byte to the 6-byte motion frame

This sequence now produces real robot movement on both motor nodes.

## Current role inference

Based on the camera-observed A/B tests:

- `E5D783D9-01D3-E4DA-7785-B53EFD0DD112` is the current best candidate for the **drive / forward-backward** motor node.
- `6CC69D00-B0A8-C599-80EA-F22728BB92F5` is the current best candidate for the **steering** motor node.

Why this is the current conclusion:

- power-only motion on `E5D7...` produced the strongest camera motion delta
- steer-only motion on either node did not produce large whole-body translation
- when `E5D7...` was driven forward and `6CC...` was given a steer command, the camera still observed physical movement, which is consistent with a drive + steering split

This is good enough to operate with, but it is still marked **medium confidence** until a tighter, robot-centered camera angle confirms steering articulation directly.
