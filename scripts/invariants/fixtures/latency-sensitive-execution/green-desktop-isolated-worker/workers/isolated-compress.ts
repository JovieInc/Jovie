import { gzipSync } from 'node:zlib';

// Genuinely isolated workers stay out of the Electron main-thread gate.
export function compress(buffer: Buffer) {
  return gzipSync(buffer);
}
