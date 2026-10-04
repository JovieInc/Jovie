import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  computeDHash,
  DEFAULT_MAX_COPY_DISTANCE,
  findRefCopies,
  foldRegions,
  hammingDistance,
} from '@/lib/agent-os/design-reference-corpus/perceptual-hash';
import type { CorpusReferenceRecord } from '@/lib/agent-os/design-reference-corpus/types';

const dir = mkdtempSync(join(tmpdir(), 'design-refs-hash-'));

/** A dark fold with one lit shape: the kind of hero the corpus holds. */
function hero(shape: string, fill = '#e33'): Buffer {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900"><rect width="1440" height="900" fill="#07080a"/>${shape.replace('FILL', fill)}<rect x="420" y="560" width="600" height="56" rx="28" fill="#fff"/></svg>`
  );
}

const STREAK = '<polygon points="300,900 900,0 1100,0 500,900" fill="FILL"/>';
const ORB = '<circle cx="1100" cy="300" r="220" fill="FILL"/>';

let refJpeg: Buffer;
let refHash: string;

function record(id: string, dhash: string): CorpusReferenceRecord {
  return {
    reference: {
      id,
      source: {
        kind: 'live-page',
        title: id,
        url: null,
        author: null,
        publishedAt: null,
        capturedAt: '2026-10-03T00:00:00.000Z',
      },
      pageType: 'homepage',
      sections: [
        {
          id: `${id}-hero`,
          designVariable: 'hero',
          pageType: 'homepage',
          summary: id,
          excerpt: null,
          mediaRef: null,
        },
      ],
      notes: null,
      ingestedAt: '2026-10-03T00:00:00.000Z',
      media: {
        file: `${id}.jpg`,
        sha256: `sha256:${'0'.repeat(64)}`,
        dhash,
        width: 1440,
        height: 900,
        capturedVia: 'file',
      },
    },
    status: 'rejected',
    founderDecision: null,
    certifiedAt: null,
  };
}

beforeAll(async () => {
  refJpeg = await sharp(hero(STREAK)).jpeg({ quality: 80 }).toBuffer();
  refHash = await computeDHash(refJpeg);
});

describe('computeDHash', () => {
  it('is a stable 256-bit hex digest', async () => {
    expect(refHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(await computeDHash(refJpeg)).toBe(refHash);
  });

  it('keeps a re-encoded, recoloured, downscaled copy inside the copy threshold', async () => {
    const copy = await sharp(hero(STREAK, '#36f'))
      .resize(1024)
      .modulate({ brightness: 1.1 })
      .webp({ quality: 50 })
      .toBuffer();
    expect(
      hammingDistance(await computeDHash(copy), refHash)
    ).toBeLessThanOrEqual(DEFAULT_MAX_COPY_DISTANCE);
  });

  it('puts a different composition outside the threshold even on the same dark field', async () => {
    const other = await sharp(hero(ORB)).png().toBuffer();
    expect(hammingDistance(await computeDHash(other), refHash)).toBeGreaterThan(
      DEFAULT_MAX_COPY_DISTANCE
    );
  });
});

describe('hammingDistance', () => {
  it('counts differing bits and rejects mismatched lengths', () => {
    expect(hammingDistance('f0', '0f')).toBe(8);
    expect(hammingDistance('a', 'a')).toBe(0);
    expect(() => hammingDistance('ab', 'a')).toThrow();
  });
});

describe('foldRegions', () => {
  it('covers a tall page with half-overlapping folds that reach the bottom', () => {
    const regions = foldRegions(1440, 2000);
    expect(regions[0]).toEqual({ left: 0, top: 0, width: 1440, height: 900 });
    expect(regions.at(-1)?.top).toBe(1100);
    expect(regions.every(region => region.height === 900)).toBe(true);
  });

  it('uses the whole image when it is shorter than a fold', () => {
    expect(foldRegions(1440, 400)).toEqual([
      { left: 0, top: 0, width: 1440, height: 400 },
    ]);
  });
});

describe('findRefCopies', () => {
  it('finds a reference pasted below the fold of a full-page capture, rejected refs included', async () => {
    const page = join(dir, 'page.png');
    const fold = await sharp(hero(STREAK)).png().toBuffer();
    writeFileSync(
      page,
      await sharp({
        create: {
          width: 1440,
          height: 2250,
          channels: 3,
          background: '#f4f4f4',
        },
      })
        .composite([{ input: fold, top: 1350, left: 0 }])
        .png()
        .toBuffer()
    );
    const matches = await findRefCopies({
      images: [page],
      references: [record('streak-ref', refHash)],
    });
    expect(matches[0]).toMatchObject({
      referenceId: 'streak-ref',
      region: { top: 1350 },
    });
  });

  it('passes original work and skips references without media', async () => {
    const page = join(dir, 'original.png');
    writeFileSync(page, await sharp(hero(ORB)).png().toBuffer());
    const bare = record('no-media', refHash);
    const { media: _media, ...withoutMedia } = bare.reference;
    expect(
      await findRefCopies({
        images: [page],
        references: [
          record('streak-ref', refHash),
          { ...bare, reference: withoutMedia },
        ],
      })
    ).toEqual([]);
  });
});
