/**
 * Strict decoder for screenshots retained by the safe Playwright artifact
 * transport. A PNG signature alone is not evidence of a render: every chunk,
 * CRC, stream boundary, pixel buffer, and row filter is verified.
 */
import { crc32, inflateSync } from 'node:zlib';

/**
 * Decoded pixel-buffer ceiling. 2x desktop (2880-wide) full-page marketing
 * captures exceed 100MB around 5_786 CSS px. The current longest certified
 * route is /changelog at 58_814 device pixels high and 677_596_094 decoded
 * RGBA bytes. This bound covers 2x×1440 full-page pages up to ~32.5k CSS px:
 * `(1 + 2880 * 4) * 65_098 ≈ 750_000_000`.
 *
 * Ship now: 750MB so Generate Screenshots can upload the exact /changelog
 * capture with measured headroom. Re-evaluate when a 2x desktop full-page
 * route exceeds ~32.5k CSS px.
 * Then: raise this bound or paginate/clip the capture — do not skip CRC or
 * pixel verification.
 */
export const MAX_PLAYWRIGHT_PNG_PIXEL_BYTES = 750_000_000;
// Independent geometry ceilings reject pathological one-pixel-wide/tall PNGs
// before inflation and keep validation work bounded to real browser captures.
export const MAX_PLAYWRIGHT_PNG_WIDTH = 8_192;
export const MAX_PLAYWRIGHT_PNG_HEIGHT = 100_000;
export const MAX_PLAYWRIGHT_PNG_PIXELS = 200_000_000;

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
      width > MAX_PLAYWRIGHT_PNG_WIDTH ||
      height > MAX_PLAYWRIGHT_PNG_HEIGHT ||
      width * height > MAX_PLAYWRIGHT_PNG_PIXELS ||
      !Number.isSafeInteger(expected) ||
      expected > MAX_PLAYWRIGHT_PNG_PIXEL_BYTES
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
    if (
      engine.bytesWritten !== compressedBytes.length ||
      pixels.length !== expected
    )
      return false;
    for (let row = 0; row < height; row += 1) {
      if (pixels[row * rowLength] > 4) return false;
    }
    return true;
  } catch {
    return false;
  }
}
