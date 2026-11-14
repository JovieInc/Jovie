/**
 * Pure planning logic for the product-shot renderer (render.ts): argument
 * parsing, which shots to render, crop geometry and the byte budget. Kept free
 * of Playwright and sharp so it is unit tested
 * (scripts/product-shots/plan.test.ts).
 */
import {
  PRODUCT_SHOT_MOBILE_SUFFIX,
  type ProductShotSpec,
} from '../../lib/screenshots/product-shots';
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

/**
 * Every image a spec renders: the base shot, plus a `<id>--mobile` variant
 * captured at the mobile viewport when the spec declares one. Each variant
 * is a full spec so the renderer and the hashes treat it like any shot.
 */
export function expandVariants(spec: ProductShotSpec): ProductShotSpec[] {
  if (!spec.mobile) return [spec];
  const { mobile, ...base } = spec;
  return [
    spec,
    {
      ...base,
      id: `${spec.id}${PRODUCT_SHOT_MOBILE_SUFFIX}`,
      viewport: 'mobile',
      route: mobile.route ?? spec.route,
      crop: mobile.crop,
      padding: mobile.padding,
      displayWidth: mobile.displayWidth,
    },
  ];
}

/** A shot is stale when any of its rendered variants is. */
export function isShotStale(
  repoRoot: string,
  spec: ProductShotSpec,
  manifest: Readonly<Record<string, ShotManifestEntry | undefined>>
): boolean {
  return expandVariants(spec).some(variant => {
    const entry = manifest[variant.id];
    if (!entry) return true;
    return (
      entry.sourceHash !== hashShotSources(repoRoot, variant.sources) ||
      entry.specHash !== hashShotSpec(variant)
    );
  });
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
    if (args.stale) return isShotStale(repoRoot, spec, manifest);
    return true;
  });
}

export interface PageBox {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type ShotPadding =
  | number
  | {
      readonly top: number;
      readonly right: number;
      readonly bottom: number;
      readonly left: number;
    };

export function resolvePadding(padding: ShotPadding = 0) {
  return typeof padding === 'number'
    ? { top: padding, right: padding, bottom: padding, left: padding }
    : padding;
}

/**
 * The screenshot clip: the union of the crop targets' page boxes plus
 * padding, clamped to the page and to `maxHeight`, in whole CSS pixels.
 * A padded side rounds outward; an unpadded side rounds inward so a
 * subpixel edge never pulls in a line of whatever sits behind the element.
 */
export function unionClip(
  boxes: readonly PageBox[],
  page: { readonly width: number; readonly height: number },
  padding: ShotPadding = 0,
  maxHeight?: number
) {
  if (boxes.length === 0) throw new Error('No crop targets');
  const pad = resolvePadding(padding);
  const left = Math.min(...boxes.map(b => b.left)) - pad.left;
  const top = Math.min(...boxes.map(b => b.top)) - pad.top;
  const right = Math.max(...boxes.map(b => b.right)) + pad.right;
  const bottom = Math.max(...boxes.map(b => b.bottom)) + pad.bottom;
  const x = Math.max(0, pad.left > 0 ? Math.floor(left) : Math.ceil(left));
  const y = Math.max(0, pad.top > 0 ? Math.floor(top) : Math.ceil(top));
  const r = Math.min(
    page.width,
    pad.right > 0 ? Math.ceil(right) : Math.floor(right)
  );
  const b = Math.min(
    page.height,
    pad.bottom > 0 ? Math.ceil(bottom) : Math.floor(bottom)
  );
  const height = maxHeight ? Math.min(b - y, maxHeight) : b - y;
  return { x, y, width: r - x, height };
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
