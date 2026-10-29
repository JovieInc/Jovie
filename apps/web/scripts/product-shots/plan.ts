/**
 * Pure planning logic for the product-shot renderer (render.ts): argument
 * parsing, which shots to render, crop geometry and the byte budget. Kept free
 * of Playwright and sharp so it is unit tested
 * (scripts/product-shots/plan.test.ts).
 */
import type { ProductShotSpec } from '../../lib/screenshots/product-shots';
import { hashShotSources, hashShotSpec } from './source-hash.mjs';

/** Per-file ceiling. A shot above it is a crop that shows too much. */
export const PRODUCT_SHOT_MAX_BYTES = 120 * 1024;

export interface RenderArgs {
  readonly baseUrl: string;
  readonly only: ReadonlySet<string> | null;
  readonly stale: boolean;
}

export function parseRenderArgs(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = {}
): RenderArgs {
  let baseUrl = env.BASE_URL ?? 'http://localhost:3100';
  let only: Set<string> | null = null;
  let stale = false;
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--base-url') {
      const value = argv[++i];
      if (!value) throw new Error('--base-url needs a value');
      baseUrl = value;
    } else if (flag === '--only') {
      const ids = (argv[++i] ?? '').split(',').filter(Boolean);
      if (ids.length === 0) throw new Error('--only needs shot ids');
      only = new Set(ids);
    } else if (flag === '--stale') {
      stale = true;
    } else {
      throw new Error(`Unknown flag: ${flag}`);
    }
  }
  return { baseUrl, only, stale };
}

export interface ShotManifestEntry {
  readonly width: number;
  readonly height: number;
  readonly sourceHash: string;
  readonly specHash: string;
  readonly renderedAt: string;
  readonly sources: readonly string[];
  readonly bytes: { readonly avif: number; readonly webp: number };
}

export function isShotStale(
  repoRoot: string,
  spec: ProductShotSpec,
  entry: ShotManifestEntry | undefined
): boolean {
  if (!entry) return true;
  return (
    entry.sourceHash !== hashShotSources(repoRoot, spec.sources) ||
    entry.specHash !== hashShotSpec(spec)
  );
}

/** Shots to render for these args; unknown `--only` ids fail loudly. */
export function selectShots(
  repoRoot: string,
  shots: readonly ProductShotSpec[],
  manifest: Readonly<Record<string, ShotManifestEntry>>,
  args: RenderArgs
): ProductShotSpec[] {
  if (args.only) {
    const known = new Set(shots.map(shot => shot.id));
    const unknown = [...args.only].filter(id => !known.has(id));
    if (unknown.length > 0) {
      throw new Error(`Unknown product shot: ${unknown.join(', ')}`);
    }
  }
  return shots.filter(spec => {
    if (args.only && !args.only.has(spec.id)) return false;
    if (args.stale) return isShotStale(repoRoot, spec, manifest[spec.id]);
    return true;
  });
}

export interface PageBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * The screenshot clip: the union of the crop targets' page boxes plus
 * padding, clamped to the page and to `maxHeight`, in whole CSS pixels.
 */
export function unionClip(
  boxes: readonly PageBox[],
  page: { readonly width: number; readonly height: number },
  padding = 0,
  maxHeight?: number
) {
  if (boxes.length === 0) throw new Error('No crop targets');
  const x = Math.max(
    0,
    Math.floor(Math.min(...boxes.map(b => b.left)) - padding)
  );
  const y = Math.max(
    0,
    Math.floor(Math.min(...boxes.map(b => b.top)) - padding)
  );
  const right = Math.min(
    page.width,
    Math.ceil(Math.max(...boxes.map(b => b.right)) + padding)
  );
  const bottom = Math.min(
    page.height,
    Math.ceil(Math.max(...boxes.map(b => b.bottom)) + padding)
  );
  const height = maxHeight ? Math.min(bottom - y, maxHeight) : bottom - y;
  return { x, y, width: right - x, height };
}

/** Byte-budget failures for one rendered shot (empty when within budget). */
export function oversizedFormats(
  id: string,
  bytes: Readonly<Record<string, number>>,
  max = PRODUCT_SHOT_MAX_BYTES
): string[] {
  return Object.entries(bytes)
    .filter(([, size]) => size > max)
    .map(
      ([format, size]) =>
        `${id}.${format} is ${size} bytes (> ${max}); tighten the crop`
    );
}
