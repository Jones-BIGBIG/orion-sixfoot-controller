// Hook payload only.
// Run it with a launcher that prepends frida-il2cpp-bridge's dist/index.js.

function bytesToJs(arr) {
  const out = [];
  for (let i = 0; i < arr.length; i++) out.push(arr.get(i));
  return out;
}

function toHex(bytes) {
  return bytes.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

Il2Cpp.perform(() => {
  const asm = Il2Cpp.domain.assembly("Assembly-CSharp").image;
  const bt = asm.class("BluetoothController");

  const aiqi = bt.method("TrySendAIQIPacket").overload("System.Byte[]");
  const mesh = bt.method("TrySendMeshPacket").overload("System.Int32", "System.Byte[]");
  const xor = bt.method("XOR").overload("System.Byte[]");
  const aiqiOriginal = new NativeFunction(aiqi.virtualAddress, "bool", ["pointer"]);
  const meshOriginal = new NativeFunction(mesh.virtualAddress, "bool", ["int", "pointer"]);
  const xorOriginal = new NativeFunction(xor.virtualAddress, "uchar", ["pointer"]);

  aiqi.implementation = function (packet) {
    const bytes = bytesToJs(packet);
    send({ channel: "aiqi", bytes, hex: toHex(bytes) });
    return !!aiqiOriginal(packet.handle);
  };

  mesh.implementation = function (address, packet) {
    const bytes = bytesToJs(packet);
    send({ channel: "mesh", address, bytes, hex: toHex(bytes) });
    return !!meshOriginal(address, packet.handle);
  };

  xor.implementation = function (packet) {
    const before = bytesToJs(packet);
    const result = xorOriginal(packet.handle);
    send({ channel: "xor", before, beforeHex: toHex(before), result });
    return result;
  };

  send({ status: "ready" });
});
