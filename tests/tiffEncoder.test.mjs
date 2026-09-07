import test from "node:test";
import assert from "node:assert/strict";
import { encodeRgbaToTiff } from "../js/tiffEncoder.js";

function entriesByTag(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ifdOffset = view.getUint32(4, true);
    const count = view.getUint16(ifdOffset, true);
    const entries = new Map();
    for (let index = 0; index < count; index += 1) {
        const offset = ifdOffset + 2 + index * 12;
        entries.set(view.getUint16(offset, true), {
            type: view.getUint16(offset + 2, true),
            count: view.getUint32(offset + 4, true),
            value: view.getUint32(offset + 8, true),
            shortValue: view.getUint16(offset + 8, true),
        });
    }
    return { view, entries };
}

test("TIFF encoder writes RGB pixels and 600 dpi metadata", () => {
    const rgba = new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 128, 255, 255,
    ]);
    const bytes = encodeRgbaToTiff(2, 1, rgba, 600);
    assert.equal(String.fromCharCode(bytes[0], bytes[1]), "II");
    const { view, entries } = entriesByTag(bytes);
    assert.equal(entries.get(256).value, 2);
    assert.equal(entries.get(257).value, 1);
    assert.equal(entries.get(259).shortValue, 1);
    assert.equal(entries.get(262).shortValue, 2);
    assert.equal(entries.get(277).shortValue, 3);
    assert.equal(entries.get(296).shortValue, 2);
    const xResolutionOffset = entries.get(282).value;
    assert.equal(view.getUint32(xResolutionOffset, true), 600);
    assert.equal(view.getUint32(xResolutionOffset + 4, true), 1);
    const pixelOffset = entries.get(273).value;
    assert.deepEqual([...bytes.slice(pixelOffset)], [255, 0, 0, 0, 128, 255]);
});

test("TIFF encoder rejects mismatched RGBA input", () => {
    assert.throws(() => encodeRgbaToTiff(2, 2, new Uint8Array(3)), /Expected 16 RGBA bytes/);
});
