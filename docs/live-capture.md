# Live Capture Plan

Static reverse engineering got the protocol close to usable, but not fully live-ready. The remaining unknowns must be captured from a real robot session.

## What is still needed

- handshake-derived `cipher`
- whether AIQI outgoing packets are XOR-obfuscated with that byte
- the fixed light packet template prefixes
- runtime peripheral addresses and mesh key returned by the robot

## Best capture points

Hook these methods while controlling the robot from the original app:

- `BluetoothController.TrySendAIQIPacket(byte[] packet)`
- `BluetoothController.TrySendMeshPacket(int address, byte[] packet)`
- `BluetoothController.OnCharacteristicChanged(CharacteristicUpdateMessage message)`
- `BluetoothController.Handshake()`

## Recommended environments

Best:

- Android phone + HCI snoop log
- Android phone + Frida
- external BLE sniffer

Acceptable:

- rooted Android emulator with a real BLE bridge

Not enough on its own:

- plain Android Emulator without a live robot link

## Frida workflow

1. Install `frida` and `frida-server` matching versions.
2. Start `frida-server` on the Android device.
3. Launch the app with Frida attached.
4. Hook the packet send methods.
5. Drive the robot in the official app and save emitted hex frames.

## Minimal success condition

One real control session with:

- connect
- handshake
- one forward command
- one backward command
- one left turn
- one right turn
- one RGB light change
- one mode light change

That is enough to finalize the live script layer.
