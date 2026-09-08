/**
 * Strict decoder for screenshots retained by the safe Playwright artifact
 * transport. A PNG signature alone is not evidence of a render: every chunk,
 * CRC, stream boundary, pixel buffer, and row filter is verified.
 */
import { crc32, inflateSync } from 'node:zlib';

/** @param {Buffer} bytes */
export function validPlaywrightPng(bytes) {
  try {
    if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
      return false;
    let offset = 8;
    let state = 0;
    let width = 0;
    let height = 0;
    let channels = 0;
    const compressed = [];
    while (offset < bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const end = offset + length + 12;
      if (end > bytes.length) return false;
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (
        crc32(bytes.subarray(offset + 4, offset + length + 8)) !==
        bytes.readUInt32BE(offset + length + 8)
      )
        return false;
      const data = bytes.subarray(offset + 8, offset + length + 8);
      if (type === 'IHDR') {
        if (state || length !== 13) return false;
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
          return false;
        channels = colorType === 2 ? 3 : 4;
        state = 1;
      } else if (type === 'IDAT') {
        if (state < 1 || state > 2) return false;
        compressed.push(data);
        state = 2;
      } else if (type === 'IEND') {
        if (state !== 2 || length || end !== bytes.length) return false;
        state = 3;
      } else return false;
      offset = end;
    }
    const rowLength = 1 + width * channels;
    const expected = rowLength * height;
    if (
      state !== 3 ||
      !Number.isSafeInteger(expected) ||
      expected > 100_000_000
    )
      return false;
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
    return (
      engine.bytesWritten === compressedBytes.length &&
      pixels.length === expected &&
      Array.from({ length: height }, (_, row) => pixels[row * rowLength]).every(
        filter => filter <= 4
      )
    );
  } catch {
    return false;
  }
}
