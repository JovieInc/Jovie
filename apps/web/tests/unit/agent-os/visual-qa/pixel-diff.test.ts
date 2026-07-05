import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { computePixelDiff } from '@/lib/agent-os/visual-qa/pixel-diff';

async function createSolidPng(color: {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}): Promise<Buffer> {
  return sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

describe('computePixelDiff', () => {
  it('returns zero drift for identical images', async () => {
    const baseline = await createSolidPng({ r: 20, g: 40, b: 60 });
    const result = await computePixelDiff(baseline, baseline);

    expect(result.rawDiffRatio).toBe(0);
    expect(result.weightedDriftScore).toBe(0);
    expect(result.diffPixelCount).toBe(0);
  });

  it('detects drift and weights a focused region more heavily', async () => {
    const baseline = await createSolidPng({ r: 0, g: 0, b: 0 });
    const after = await createSolidPng({ r: 255, g: 255, b: 255 });

    const unweighted = await computePixelDiff(baseline, after);
    const weighted = await computePixelDiff(baseline, after, {
      regions: [
        {
          id: 'full-frame',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          weight: 2,
        },
      ],
    });

    expect(unweighted.rawDiffRatio).toBe(1);
    expect(weighted.weightedDriftScore).toBe(1);
    expect(weighted.regionScores[0]).toMatchObject({
      id: 'full-frame',
      diffRatio: 1,
      weight: 2,
    });
    expect(weighted.overlay.byteLength).toBeGreaterThan(0);
  });
});
