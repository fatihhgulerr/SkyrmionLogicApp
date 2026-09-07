function integer(value, label) {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric <= 0) throw new Error(`${label} must be a positive integer.`);
    return numeric;
}

function writeEntry(view, offset, tag, type, count, value) {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    if (type === 3 && count === 1) {
        view.setUint16(offset + 8, value, true);
        view.setUint16(offset + 10, 0, true);
    } else {
        view.setUint32(offset + 8, value, true);
    }
}

export function encodeRgbaToTiff(widthValue, heightValue, rgba, dpiValue = 600) {
    const width = integer(widthValue, "TIFF width");
    const height = integer(heightValue, "TIFF height");
    const dpi = integer(dpiValue, "TIFF resolution");
    const expectedBytes = width * height * 4;
    if (!rgba || rgba.length !== expectedBytes) {
        throw new Error(`Expected ${expectedBytes} RGBA bytes for a ${width} x ${height} image.`);
    }

    const entryCount = 14;
    const ifdOffset = 8;
    const ifdBytes = 2 + entryCount * 12 + 4;
    const bitsOffset = ifdOffset + ifdBytes;
    const xResolutionOffset = bitsOffset + 6;
    const yResolutionOffset = xResolutionOffset + 8;
    const pixelOffset = yResolutionOffset + 8;
    const rgbBytes = width * height * 3;
    const output = new Uint8Array(pixelOffset + rgbBytes);
    const view = new DataView(output.buffer);

    output[0] = 0x49;
    output[1] = 0x49;
    view.setUint16(2, 42, true);
    view.setUint32(4, ifdOffset, true);
    view.setUint16(ifdOffset, entryCount, true);

    const entries = [
        [256, 4, 1, width],
        [257, 4, 1, height],
        [258, 3, 3, bitsOffset],
        [259, 3, 1, 1],
        [262, 3, 1, 2],
        [273, 4, 1, pixelOffset],
        [274, 3, 1, 1],
        [277, 3, 1, 3],
        [278, 4, 1, height],
        [279, 4, 1, rgbBytes],
        [282, 5, 1, xResolutionOffset],
        [283, 5, 1, yResolutionOffset],
        [284, 3, 1, 1],
        [296, 3, 1, 2],
    ];
    entries.forEach((entry, index) => writeEntry(view, ifdOffset + 2 + index * 12, ...entry));
    view.setUint32(ifdOffset + 2 + entryCount * 12, 0, true);

    view.setUint16(bitsOffset, 8, true);
    view.setUint16(bitsOffset + 2, 8, true);
    view.setUint16(bitsOffset + 4, 8, true);
    view.setUint32(xResolutionOffset, dpi, true);
    view.setUint32(xResolutionOffset + 4, 1, true);
    view.setUint32(yResolutionOffset, dpi, true);
    view.setUint32(yResolutionOffset + 4, 1, true);

    let destination = pixelOffset;
    for (let source = 0; source < rgba.length; source += 4) {
        output[destination] = rgba[source];
        output[destination + 1] = rgba[source + 1];
        output[destination + 2] = rgba[source + 2];
        destination += 3;
    }
    return output;
}
