/**
 * The matte grade: turns the model's soft texture into a canon-compliant plate.
 *
 * Canon (MKT-D19): one accent per image, a lit wedge, the rest to neutral
 * black. The model's luma only modulates texture; the hue, the wedge and the
 * quiet zone come from the stage spec, so the result cannot carry a second
 * hue, a second light or light in the headline zone. Pure and seeded, so the
 * same input always yields the same pixels.
 */
import type { StageLight, StageRect } from '../../lib/imagery/stages';

export type Rgb = readonly [number, number, number];

export interface GradeInput {
  /** Source luma 0..1, row-major, width x height. */
  readonly luma: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly light: StageLight;
  readonly safeArea: StageRect;
  readonly accentRgb: Rgb;
  /** Post-process seed (grain). Derived from the prompt hash. */
  readonly seed: number;
}

/** Neutral black every tone falls to. */
export const PLATE_BASE: Rgb = [7, 7, 9];
/** Peak accent mix: matte, never a glow. */
export const PLATE_PEAK = 0.5;
/** Grain amplitude in 8-bit levels, applied equally to all channels. */
export const PLATE_GRAIN = 1.4;

function hashNoise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/**
 * Quiet-zone attenuation 0..1: 0 at the centre of the zone, 1 well outside,
 * a soft ellipse so no rectangular edge shows in the plate.
 */
export function quietAt(rect: StageRect, px: number, py: number): number {
  const r = Math.hypot(
    (px - (rect.x + rect.w / 2)) / (rect.w / 2),
    (py - (rect.y + rect.h / 2)) / (rect.h / 2)
  );
  const t = Math.min(Math.max((r - 0.5) / 1.4, 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * Wedge intensity 0..1 at a normalised point: strongest at the origin, opening
 * toward the plate centre, falling off with distance and angle.
 */
export function wedgeAt(
  light: StageLight,
  aspect: number,
  nx: number,
  ny: number
): number {
  const ox = light.origin.x * aspect;
  const oy = light.origin.y;
  const dirX = 0.5 * aspect - ox;
  const dirY = 0.5 - oy;
  const dirLen = Math.hypot(dirX, dirY) || 1;
  const vx = nx * aspect - ox;
  const vy = ny - oy;
  const dist = Math.hypot(vx, vy);
  if (dist === 0) return 1;
  const cos = (vx * dirX + vy * dirY) / (dist * dirLen);
  const diagonal = Math.hypot(aspect, 1);
  const radial = Math.exp(-((dist / (light.spread * diagonal)) ** 2.2));
  const angular = Math.exp(-(1 - Math.max(cos, -1)) / 0.14);
  return radial * angular;
}

export function gradePlate(input: GradeInput): Uint8Array {
  const { luma, width, height, light, safeArea, accentRgb, seed } = input;
  const aspect = width / height;
  let min = Infinity;
  let max = -Infinity;
  for (const value of luma) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const range = max - min || 1;
  const out = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x + 0.5) / width;
      const ny = (y + 0.5) / height;
      const texture = 0.75 + 0.25 * ((luma[y * width + x] - min) / range);
      const quiet = quietAt(safeArea, nx, ny);
      const intensity =
        PLATE_PEAK * wedgeAt(light, aspect, nx, ny) * texture * quiet;
      const grain = hashNoise(x, y, seed) * PLATE_GRAIN;
      const o = (y * width + x) * 3;
      for (let c = 0; c < 3; c += 1) {
        const value = PLATE_BASE[c] + accentRgb[c] * intensity + grain;
        out[o + c] = Math.max(0, Math.min(255, Math.round(value)));
      }
    }
  }
  return out;
}

export function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Bad hex colour: ${hex}`);
  const n = Number.parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** First 8 hex chars of the prompt hash as a positive int seed. */
export function seedFromHash(hash: string): number {
  return Number.parseInt(hash.slice(0, 8), 16) >>> 0;
}
