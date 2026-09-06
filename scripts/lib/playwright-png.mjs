/**
 * Strict decoder for screenshots retained by the safe Playwright artifact
 * transport. A PNG signature alone is not evidence of a render: every chunk,
 * CRC, stream boundary, pixel buffer, and row filter is verified.
 */
import { crc32, inflateSync } from 'node:zlib';

const pngResult = (valid, reason, width = null, height = null) => ({
  valid,
  reason,
  width,
  height,
});

/**
 * Decode only the safe PNG subset accepted for Playwright artifacts.
 * The result exposes structural diagnostics only: no chunk payload or image
 * bytes are retained.
 * @param {Buffer} bytes
 */
export function inspectPlaywrightPng(bytes) {
  let width = null;
  let height = null;
  try {
    if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
      return pngResult(false, 'invalid-signature');
    let offset = 8;
    let state = 0;
    let channels = 0;
    const compressed = [];
    while (offset < bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const end = offset + length + 12;
      if (end > bytes.length)
        return pngResult(false, 'truncated-chunk', width, height);
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (
        crc32(bytes.subarray(offset + 4, offset + length + 8)) !==
        bytes.readUInt32BE(offset + length + 8)
      )
        return pngResult(false, 'invalid-crc', width, height);
      const data = bytes.subarray(offset + 8, offset + length + 8);
      if (type === 'IHDR') {
        if (state || length !== 13)
          return pngResult(false, 'invalid-ihdr', width, height);
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        const colorType = data[9];
        if (
          !width ||
          !height ||
          data[8] !== 8 ||
          (colorType !== 2 && colorType !== 6) ||
          !data.subarray(10).equals(Buffer.from([0, 0, 0]))
        )
          return pngResult(false, 'invalid-ihdr', width, height);
        channels = colorType === 2 ? 3 : 4;
        state = 1;
      } else if (type === 'IDAT') {
        if (state < 1 || state > 2)
          return pngResult(false, 'invalid-chunk-order', width, height);
        compressed.push(data);
        state = 2;
      } else if (type === 'IEND') {
        if (state !== 2 || length || end !== bytes.length)
          return pngResult(false, 'invalid-iend', width, height);
        state = 3;
      } else return pngResult(false, 'unexpected-chunk', width, height);
      offset = end;
    }
    const rowLength = 1 + width * channels;
    const expected = rowLength * height;
    if (
      state !== 3 ||
      !Number.isSafeInteger(expected) ||
      expected > 100_000_000
    )
      return pngResult(
        false,
        expected > 100_000_000 ? 'decoded-size-limit' : 'invalid-decoded-size',
        width,
        height
      );
    const compressedBytes = Buffer.concat(compressed);
    const { buffer: pixels, engine } =
      /** @type {{ buffer: Buffer, engine: { bytesWritten: number } }} */ (
        /** @type {unknown} */ (
          inflateSync(compressedBytes, {
            info: true,
            maxOutputLength: expected,
          })
        )
      );
    if (engine.bytesWritten !== compressedBytes.length)
      return pngResult(false, 'trailing-compressed-data', width, height);
    if (pixels.length !== expected)
      return pngResult(false, 'invalid-decoded-size', width, height);
    if (
      !Array.from(
        { length: height },
        (_, row) => pixels[row * rowLength]
      ).every(filter => filter <= 4)
    )
      return pngResult(false, 'invalid-row-filter', width, height);
    return pngResult(true, 'valid', width, height);
  } catch {
    return pngResult(false, 'decode-error', width, height);
  }
}

/** @param {Buffer} bytes */
export function validPlaywrightPng(bytes) {
  return inspectPlaywrightPng(bytes).valid;
}
