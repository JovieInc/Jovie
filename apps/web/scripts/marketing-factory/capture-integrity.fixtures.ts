import { crc32, deflateSync } from 'node:zlib';

export function capturePng(
  width: number,
  height: number,
  value = 100,
  level = 6
): Buffer {
  const chunk = (kind: string, data: Buffer) => {
    const type = Buffer.from(kind);
    const output = Buffer.alloc(data.length + 12);
    output.writeUInt32BE(data.length, 0);
    type.copy(output, 4);
    data.copy(output, 8);
    output.writeUInt32BE(crc32(Buffer.concat([type, data])), output.length - 4);
    return output;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const stride = width * 4 + 1;
  const pixels = Buffer.alloc(stride * height, value);
  for (let row = 0; row < height; row++) {
    pixels[row * stride] = 0;
    for (let column = 0; column < width; column++)
      pixels[row * stride + column * 4 + 4] = 255;
  }
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels, { level })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
