import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { JOVIE_BRAND_GEOMETRY } from './geometry.gen';
import { jovieOParts, masterForSize } from './jovie-o-geometry';

describe('masterForSize', () => {
  it('uses the pixel masters at and just above 16, 24 and 32 px', () => {
    expect(masterForSize(16)).toBe('16');
    expect(masterForSize(20)).toBe('16');
    expect(masterForSize(24)).toBe('24');
    expect(masterForSize(32)).toBe('32');
    expect(masterForSize(47)).toBe('32');
    expect(masterForSize(48)).toBe('display');
  });
});

describe('jovieOParts', () => {
  for (const master of ['16', '24', '32', 'display', 'text'] as const) {
    it(`${master}: the seed sits on the ring midline at 12`, () => {
      const p = jovieOParts(master);
      const m = JOVIE_BRAND_GEOMETRY.o[master];
      expect(p.counterRx).toBeCloseTo(p.r - m.ts, 3);
      expect(p.counterRy).toBeCloseTo(p.r - m.th, 3);
      // ball diameter = top stroke, centred in it
      expect(p.seed.r * 2).toBeCloseTo(m.th, 2);
      expect(p.seed.cy).toBeCloseTo(m.th / 2, 2);
    });

    it(`${master}: the tail stroke covers the whole ring, thick sides included`, () => {
      const p = jovieOParts(master);
      const mid = p.cy - p.seed.cy;
      const half = p.tailWidth / 2;
      // at 3 and 9 o'clock the ring runs from r - ts to r
      expect(mid + half).toBeGreaterThanOrEqual(p.r);
      expect(mid - half).toBeLessThanOrEqual(p.counterRx);
      // at 12 and 6 o'clock from r - th to r
      expect(mid - half).toBeLessThanOrEqual(p.counterRy);
    });
  }
});

describe('generated geometry', () => {
  it('matches packages/brand/dist/geometry.json (re-run construction.py)', () => {
    const json = JSON.parse(
      readFileSync(join(__dirname, '../../brand/dist/geometry.json'), 'utf8')
    );
    const { grid, o, ov, wordmark } = json;
    expect(JOVIE_BRAND_GEOMETRY).toEqual({ grid, o, ov, wordmark });
  });
});
