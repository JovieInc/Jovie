import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { buildPrintSvgMock, renderMockupMock, sharpMock } = vi.hoisted(() => ({
  buildPrintSvgMock: vi.fn(({ designName }: { readonly designName: string }) =>
    Buffer.from(`svg:${designName}`)
  ),
  renderMockupMock: vi.fn(async (printFile: Buffer, productType: string) =>
    Buffer.from(`mockup:${productType}:${printFile.toString()}`)
  ),
  sharpMock: vi.fn((input: Buffer) => {
    const pipeline = {
      png: vi.fn(() => pipeline),
      resize: vi.fn(() => pipeline),
      webp: vi.fn(() => pipeline),
      toBuffer: vi.fn(async () => Buffer.from(`rendered:${input.toString()}`)),
    };
    return pipeline;
  }),
}));

vi.mock('sharp', () => ({ default: sharpMock }));
vi.mock('@/lib/merch/artwork', () => ({
  buildPrintSvg: buildPrintSvgMock,
  renderMockup: renderMockupMock,
}));

import { generateInstantMerchProofs } from './generate-instant-merch-proof';

const temporaryRoots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  buildPrintSvgMock.mockClear();
  renderMockupMock.mockClear();
  sharpMock.mockClear();
  await Promise.all(
    temporaryRoots.splice(0).map(root => rm(root, { recursive: true }))
  );
});

describe('generateInstantMerchProofs', () => {
  it('writes print and garment mockup proofs for every canonical concept', async () => {
    const root = await mkdtemp(join(tmpdir(), 'jovie-instant-merch-proof-'));
    temporaryRoots.push(root);
    const outDir = join(root, 'nested', 'merch');
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const outputPaths = await generateInstantMerchProofs(outDir);

    expect(buildPrintSvgMock.mock.calls.map(([params]) => params)).toEqual([
      {
        artistName: 'Tim White',
        designName: 'Never Say A Word',
        lane: 'band_tour_uniform',
        concept: 'Single lyric line over the release artwork palette.',
      },
      {
        artistName: 'Tim White',
        designName: 'The Deep End',
        lane: 'artist_world_artifact',
        concept: 'Cover-art world on a heavyweight hoodie.',
      },
      {
        artistName: 'Tim White',
        designName: 'Take Me Over',
        lane: 'fashion_graphic_item',
        concept: 'Minimal wordmark treatment on a limited cap.',
      },
    ]);
    expect(
      renderMockupMock.mock.calls.map(([, productType]) => productType)
    ).toEqual(['premium tee', 'premium hoodie', 'structured cap']);

    const expectedFiles = [
      'never-say-a-word-tee-mockup.webp',
      'never-say-a-word-tee-print.webp',
      'take-me-over-cap-mockup.webp',
      'take-me-over-cap-print.webp',
      'the-deep-end-hoodie-mockup.webp',
      'the-deep-end-hoodie-print.webp',
    ];
    await expect(readdir(outDir)).resolves.toEqual(expectedFiles);
    expect(
      outputPaths.map(path => path.slice(outDir.length + 1)).sort()
    ).toEqual(expectedFiles);
    await expect(
      readFile(join(outDir, 'never-say-a-word-tee-mockup.webp'), 'utf8')
    ).resolves.toContain('mockup:premium tee');
    expect(sharpMock).toHaveBeenCalledTimes(9);
    expect(log).toHaveBeenCalledTimes(6);
  });
});
