// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  analyzePixels,
  classifyPlate,
} from '../../../../scripts/invariants/art-direction/images.mjs';
import { IMAGERY_STAGES } from '../../lib/imagery/stages';
import {
  gradePlate,
  hexToRgb,
  PLATE_BASE,
  quietAt,
  seedFromHash,
  wedgeAt,
} from './grade';

const W = 192;
const H = 108;
const noise = (() => {
  const luma = new Float32Array(W * H);
  for (let i = 0; i < luma.length; i += 1) luma[i] = ((i * 7919) % 255) / 255;
  return luma;
})();

function grade(stage = IMAGERY_STAGES[0], seed = 1) {
  return gradePlate({
    luma: noise,
    width: W,
    height: H,
    light: stage.light,
    safeArea: stage.safeArea,
    accentRgb: hexToRgb('#3FAFF3'),
    seed,
  });
}

function meanAt(
  rgb: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number
) {
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(y0 * H); y < Math.ceil(y1 * H); y += 1) {
    for (let x = Math.floor(x0 * W); x < Math.ceil(x1 * W); x += 1) {
      const o = (y * W + x) * 3;
      sum += (rgb[o] + rgb[o + 1] + rgb[o + 2]) / 3;
      n += 1;
    }
  }
  return sum / n;
}

describe('plate grade', () => {
  it('is deterministic for a seed and differs by seed', () => {
    expect(grade(IMAGERY_STAGES[0], 5)).toEqual(grade(IMAGERY_STAGES[0], 5));
    expect(grade(IMAGERY_STAGES[0], 5)).not.toEqual(
      grade(IMAGERY_STAGES[0], 6)
    );
  });

  it('lights one wedge from the origin and falls to near black opposite it', () => {
    const rgb = grade();
    // profile-depth lights from the top right.
    const lit = meanAt(rgb, 0.7, 0.02, 0.98, 0.3);
    const far = meanAt(rgb, 0.02, 0.7, 0.3, 0.98);
    expect(lit).toBeGreaterThan(far + 12);
    expect(far).toBeLessThan(lit / 3);
  });

  it('keeps the quiet zone dark', () => {
    const stage = IMAGERY_STAGES[0];
    const rgb = grade();
    const { x, y, w, h } = stage.safeArea;
    expect(meanAt(rgb, x, y, x + w, y + h)).toBeLessThan(PLATE_BASE[0] + 4);
  });

  it('passes the art-direction plate scan: one hue, smooth, no orange', () => {
    for (const stage of IMAGERY_STAGES) {
      const rgb = grade(stage);
      const stats = analyzePixels(rgb, W, H);
      const found = classifyPlate('plate.webp', stats, {
        missing: false,
        json: { accent: stage.plate.accent, subject: 'abstract' },
      });
      expect(found).toEqual({ ids: [], hard: [] });
    }
  });

  it('wedge geometry: strongest at the origin, zero behind it', () => {
    const light = IMAGERY_STAGES[0].light;
    expect(wedgeAt(light, 16 / 9, 1, 0)).toBeGreaterThan(0.5);
    expect(wedgeAt(light, 16 / 9, 0, 1)).toBeLessThan(0.08);
    const zone = { x: 0.2, y: 0.2, w: 0.2, h: 0.2 };
    expect(quietAt(zone, 0.3, 0.3)).toBe(0);
    expect(quietAt(zone, 0.9, 0.9)).toBe(1);
  });

  it('parses colours and seeds', () => {
    expect(hexToRgb('#3FAFF3')).toEqual([63, 175, 243]);
    expect(() => hexToRgb('blue')).toThrow(/Bad hex/);
    expect(seedFromHash('ffffffff00')).toBe(4294967295);
  });
});
