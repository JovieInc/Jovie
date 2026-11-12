import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProductShotSpec } from '../../lib/screenshots/product-shots';
import {
  expandVariants,
  isShotStale,
  oversizedFormats,
  PRODUCT_SHOT_MAX_BYTES,
  parseRenderArgs,
  type ShotManifestEntry,
  selectShots,
  unionClip,
} from './plan';
import { hashShotSources, hashShotSpec } from './source-hash.mjs';

const SOURCE = 'apps/web/components/Step.tsx';

function spec(id: string, overrides: Partial<ProductShotSpec> = {}) {
  return {
    id,
    title: id,
    alt: id,
    route: `/demo/${id}`,
    viewport: 'desktop',
    theme: 'dark',
    waitFor: 'main',
    crop: ['main'],
    frame: 'bare',
    displayWidth: 400,
    sources: [SOURCE],
    placements: ['/artist-profiles'],
    ...overrides,
  } satisfies ProductShotSpec;
}

function repoWith(content: string) {
  const root = mkdtempSync(join(tmpdir(), 'shot-plan-'));
  mkdirSync(dirname(join(root, SOURCE)), { recursive: true });
  writeFileSync(join(root, SOURCE), content);
  return root;
}

function entryFor(root: string, shot: ProductShotSpec): ShotManifestEntry {
  return {
    width: 800,
    height: 400,
    sourceHash: hashShotSources(root, shot.sources),
    specHash: hashShotSpec(shot),
    renderedAt: '2026-10-29T00:00:00.000Z',
    sources: shot.sources,
    bytes: { avif: 1, webp: 1 },
  };
}

describe('parseRenderArgs', () => {
  it('defaults the base URL from the environment', () => {
    expect(parseRenderArgs([], { BASE_URL: 'http://ci:3000' })).toEqual({
      baseUrl: 'http://ci:3000',
      only: null,
      stale: false,
    });
    expect(parseRenderArgs([]).baseUrl).toBe('http://localhost:3100');
  });

  it('reads --base-url, --only and --stale', () => {
    const args = parseRenderArgs([
      '--base-url',
      'http://gem:3917',
      '--only',
      'a,b',
      '--stale',
    ]);
    expect(args.baseUrl).toBe('http://gem:3917');
    expect([...(args.only ?? [])]).toEqual(['a', 'b']);
    expect(args.stale).toBe(true);
  });

  it('rejects unknown flags and missing values', () => {
    expect(() => parseRenderArgs(['--all'])).toThrow('Unknown flag: --all');
    expect(() => parseRenderArgs(['--base-url'])).toThrow('needs a value');
    expect(() => parseRenderArgs(['--only', ''])).toThrow('needs shot ids');
  });
});

describe('selectShots', () => {
  it('renders only stale shots with --stale', () => {
    const root = repoWith('export const v = 1;\n');
    const fresh = spec('fresh');
    const moved = spec('moved');
    const manifest = {
      fresh: entryFor(root, fresh),
      moved: entryFor(root, { ...moved, crop: ['header'] }),
    };
    const picked = selectShots(root, [fresh, moved, spec('new')], manifest, {
      baseUrl: '',
      only: null,
      stale: true,
    });
    expect(picked.map(shot => shot.id)).toEqual(['moved', 'new']);
  });

  it('treats a changed source file as stale', () => {
    const root = repoWith('export const v = 1;\n');
    const shot = spec('a');
    const manifest = { a: entryFor(root, shot) };
    expect(isShotStale(root, shot, manifest)).toBe(false);
    writeFileSync(join(root, SOURCE), 'export const v = 2;\n');
    expect(isShotStale(root, shot, manifest)).toBe(true);
    expect(isShotStale(root, shot, {})).toBe(true);
  });

  it('filters by --only and fails on an unknown id', () => {
    const root = repoWith('x');
    const shots = [spec('a'), spec('b')];
    const args = { baseUrl: '', stale: false };
    expect(
      selectShots(root, shots, {}, { ...args, only: new Set(['b']) }).map(
        shot => shot.id
      )
    ).toEqual(['b']);
    expect(() =>
      selectShots(root, shots, {}, { ...args, only: new Set(['typo']) })
    ).toThrow('Unknown product shot: typo');
  });
});

describe('expandVariants', () => {
  const mobile = { crop: ['h1', 'form'], padding: 20, displayWidth: 358 };

  it('adds a mobile-viewport variant with its own crop', () => {
    const [base, variant] = expandVariants(spec('claim', { mobile }));
    expect(base.id).toBe('claim');
    expect(variant).toMatchObject({
      id: 'claim--mobile',
      viewport: 'mobile',
      route: '/demo/claim',
      crop: ['h1', 'form'],
      padding: 20,
      displayWidth: 358,
    });
    expect(variant).not.toHaveProperty('mobile');
    expect(expandVariants(spec('plain'))).toHaveLength(1);
  });

  it('is stale until the mobile variant is rendered too', () => {
    const root = repoWith('x');
    const shot = spec('claim', { mobile });
    const [base, variant] = expandVariants(shot);
    expect(isShotStale(root, shot, { claim: entryFor(root, base) })).toBe(true);
    expect(
      isShotStale(root, shot, {
        claim: entryFor(root, base),
        'claim--mobile': entryFor(root, variant),
      })
    ).toBe(false);
  });
});

describe('unionClip', () => {
  const page = { width: 1440, height: 900 };

  it('frames the union of targets plus padding in whole pixels', () => {
    expect(
      unionClip(
        [
          { left: 384.4, top: 65.2, right: 1056, bottom: 117 },
          { left: 384, top: 177, right: 1056.6, bottom: 267.3 },
        ],
        page,
        32
      )
    ).toEqual({ x: 352, y: 33, width: 737, height: 267 });
  });

  it('clamps to the page and to maxHeight', () => {
    expect(
      unionClip(
        [{ left: 10, top: 10, right: 1430, bottom: 890 }],
        page,
        40,
        300
      )
    ).toEqual({ x: 0, y: 0, width: 1440, height: 300 });
  });

  it('rounds unpadded edges inward so nothing behind the element shows', () => {
    expect(
      unionClip([{ left: 529.4, top: 567.6, right: 911.5, bottom: 1039.2 }], {
        width: 1440,
        height: 1200,
      })
    ).toEqual({ x: 530, y: 568, width: 381, height: 471 });
  });

  it('takes per-side padding to compensate for line-box leading', () => {
    expect(
      unionClip([{ left: 100, top: 100, right: 300, bottom: 200 }], page, {
        top: 22,
        right: 32,
        bottom: 32,
        left: 32,
      })
    ).toEqual({ x: 68, y: 78, width: 264, height: 154 });
  });

  it('fails without crop targets', () => {
    expect(() => unionClip([], page)).toThrow('No crop targets');
  });
});

describe('oversizedFormats', () => {
  it('names each format over the byte ceiling', () => {
    expect(oversizedFormats('a', { avif: 10, webp: 20 })).toEqual([]);
    expect(
      oversizedFormats('a', { avif: PRODUCT_SHOT_MAX_BYTES + 1, webp: 1 })
    ).toEqual([
      `a.avif is ${PRODUCT_SHOT_MAX_BYTES + 1} bytes (> ${PRODUCT_SHOT_MAX_BYTES}); tighten the crop`,
    ]);
  });
});
