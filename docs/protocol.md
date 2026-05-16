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

## Handshake / obfuscation

`BluetoothController` contains:

- `XOR(byte[] array)`
- `PeripheralState.cipher`
- `PeripheralState.isHandshaked`

So static analysis confirms a post-handshake packet transform exists on the AIQI path. The exact runtime value must still be captured during a real BLE session.
