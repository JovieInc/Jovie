import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const DEFAULT_OG_PATH = resolve(process.cwd(), 'public/og/default.png');

function readPngSize(png: Buffer): { width: number; height: number } {
  expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
  };
}

describe('default Open Graph image (JOV-1651)', () => {
  it('ships a real 1200x630 PNG instead of the 62-byte placeholder comment', () => {
    const png = readFileSync(DEFAULT_OG_PATH);
    const { width, height } = readPngSize(png);

    expect(png.byteLength).toBeGreaterThan(10_000);
    expect(png.includes('This would be a binary PNG file')).toBe(false);
    expect(width).toBe(1200);
    expect(height).toBe(630);
  });
});
