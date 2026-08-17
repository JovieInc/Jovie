import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { hashVisualQaLockedRegions } from '@/lib/agent-os/visual-qa/locked-regions';

async function createPng(color: {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}) {
  return sharp({
    create: {
      width: 8,
      height: 8,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

describe('hashVisualQaLockedRegions', () => {
  const region = {
    id: 'top-lock',
    x: 0,
    y: 0,
    width: 1,
    height: 0.25,
  };

  it('is deterministic for identical image bytes and normalized regions', async () => {
    const image = await createPng({ r: 20, g: 40, b: 60 });
    const first = await hashVisualQaLockedRegions(image, [region]);
    const second = await hashVisualQaLockedRegions(image, [region]);

    expect(first).toEqual(second);
    expect(first[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes when the locked pixels change', async () => {
    const baseline = await createPng({ r: 20, g: 40, b: 60 });
    const after = await createPng({ r: 200, g: 40, b: 60 });

    const [baselineHash, afterHash] = await Promise.all([
      hashVisualQaLockedRegions(baseline, [region]),
      hashVisualQaLockedRegions(after, [region]),
    ]);

    expect(baselineHash[0]?.sha256).not.toBe(afterHash[0]?.sha256);
  });
});
