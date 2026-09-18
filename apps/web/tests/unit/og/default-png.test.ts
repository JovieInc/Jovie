import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MIN_BYTES = 8_000;

describe('public/og/default.png (JOV-1651)', () => {
  it('is a real 1200x630 PNG large enough for social crawlers', () => {
    const buf = readFileSync(join(process.cwd(), 'public/og/default.png'));

    expect(buf.byteLength).toBeGreaterThan(MIN_BYTES);
    expect(buf.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
    expect(buf.toString('latin1', 0, 62)).not.toContain('<!--');
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
  });
});
