import sharp from 'sharp';
import type { VisualQaWeightedRegion } from '@/lib/agent-os/visual-qa/thresholds';

export const DEFAULT_PIXEL_DIFF_THRESHOLD = 34;

const DIFF_OVERLAY_RGBA = {
  red: 255,
  green: 143,
  blue: 61,
  alpha: 224,
} as const;

export interface PixelDiffRegionScore {
  readonly id: string;
  readonly diffRatio: number;
  readonly weight: number;
}

export interface PixelDiffResult {
  readonly diffPixelCount: number;
  readonly totalPixelCount: number;
  readonly rawDiffRatio: number;
  readonly weightedDriftScore: number;
  readonly regionScores: readonly PixelDiffRegionScore[];
  readonly overlay: Buffer;
}

export interface ComputePixelDiffOptions {
  readonly pixelThreshold?: number;
  readonly regions?: readonly VisualQaWeightedRegion[];
}

interface RawImageData {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

function normalizeRegion(
  region: VisualQaWeightedRegion,
  width: number,
  height: number
): {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly weight: number;
  readonly id: string;
} {
  const left = Math.max(0, Math.round(region.x * width));
  const top = Math.max(0, Math.round(region.y * height));
  const right = Math.min(
    width,
    Math.max(left + 1, Math.round((region.x + region.width) * width))
  );
  const bottom = Math.min(
    height,
    Math.max(top + 1, Math.round((region.y + region.height) * height))
  );

  return {
    id: region.id,
    left,
    top,
    right,
    bottom,
    weight: Math.max(1, region.weight),
  };
}

function resolvePixelWeight(
  x: number,
  y: number,
  regions: readonly ReturnType<typeof normalizeRegion>[]
): number {
  let weight = 1;

  for (const region of regions) {
    if (
      x >= region.left &&
      x < region.right &&
      y >= region.top &&
      y < region.bottom
    ) {
      weight = Math.max(weight, region.weight);
    }
  }

  return weight;
}

function computeChannelDelta(
  baseline: Buffer,
  after: Buffer,
  index: number
): number {
  const redDiff = Math.abs(baseline[index] - after[index]);
  const greenDiff = Math.abs(baseline[index + 1] - after[index + 1]);
  const blueDiff = Math.abs(baseline[index + 2] - after[index + 2]);
  const alphaDiff = Math.abs(baseline[index + 3] - after[index + 3]);
  return Math.max(redDiff, greenDiff, blueDiff, alphaDiff);
}

async function loadRawImage(image: Buffer): Promise<RawImageData> {
  const raw = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    data: raw.data,
    width: raw.info.width,
    height: raw.info.height,
  };
}

export async function computePixelDiff(
  baselineImage: Buffer,
  afterImage: Buffer,
  options: ComputePixelDiffOptions = {}
): Promise<PixelDiffResult> {
  const [baseline, after] = await Promise.all([
    loadRawImage(baselineImage),
    loadRawImage(afterImage),
  ]);

  if (baseline.width !== after.width || baseline.height !== after.height) {
    const resizedAfter = await sharp(afterImage)
      .resize({
        width: baseline.width,
        height: baseline.height,
        fit: 'fill',
      })
      .png()
      .toBuffer();

    return computePixelDiff(baselineImage, resizedAfter, options);
  }

  const pixelThreshold = options.pixelThreshold ?? DEFAULT_PIXEL_DIFF_THRESHOLD;
  const normalizedRegions = (options.regions ?? []).map(region =>
    normalizeRegion(region, baseline.width, baseline.height)
  );
  const overlay = Buffer.alloc(baseline.data.length, 0);
  const regionDiffPixels = new Map<string, number>(
    normalizedRegions.map(region => [region.id, 0])
  );
  const regionPixelCounts = new Map<string, number>(
    normalizedRegions.map(region => [region.id, 0])
  );

  let diffPixelCount = 0;
  let weightedDiffTotal = 0;
  let weightedPixelTotal = 0;

  for (let y = 0; y < baseline.height; y += 1) {
    for (let x = 0; x < baseline.width; x += 1) {
      const index = (y * baseline.width + x) * 4;
      const weight = resolvePixelWeight(x, y, normalizedRegions);
      const delta = computeChannelDelta(baseline.data, after.data, index);
      const isDifferent = delta >= pixelThreshold;

      weightedPixelTotal += weight;

      if (isDifferent) {
        diffPixelCount += 1;
        weightedDiffTotal += weight;
        overlay[index] = DIFF_OVERLAY_RGBA.red;
        overlay[index + 1] = DIFF_OVERLAY_RGBA.green;
        overlay[index + 2] = DIFF_OVERLAY_RGBA.blue;
        overlay[index + 3] = DIFF_OVERLAY_RGBA.alpha;
      }

      for (const region of normalizedRegions) {
        if (
          x >= region.left &&
          x < region.right &&
          y >= region.top &&
          y < region.bottom
        ) {
          regionPixelCounts.set(
            region.id,
            (regionPixelCounts.get(region.id) ?? 0) + 1
          );

          if (isDifferent) {
            regionDiffPixels.set(
              region.id,
              (regionDiffPixels.get(region.id) ?? 0) + 1
            );
          }
        }
      }
    }
  }

  const totalPixelCount = baseline.width * baseline.height;
  const rawDiffRatio = diffPixelCount / totalPixelCount;
  const weightedDriftScore =
    weightedPixelTotal === 0 ? 0 : weightedDiffTotal / weightedPixelTotal;

  const regionScores = normalizedRegions.map(region => {
    const regionPixels = regionPixelCounts.get(region.id) ?? 0;
    const regionDiffs = regionDiffPixels.get(region.id) ?? 0;

    return {
      id: region.id,
      diffRatio: regionPixels === 0 ? 0 : regionDiffs / regionPixels,
      weight: region.weight,
    };
  });

  const heatmap = await sharp(baselineImage)
    .ensureAlpha()
    .composite([
      {
        input: await sharp(overlay, {
          raw: {
            width: baseline.width,
            height: baseline.height,
            channels: 4,
          },
        })
          .png()
          .toBuffer(),
      },
    ])
    .png()
    .toBuffer();

  return {
    diffPixelCount,
    totalPixelCount,
    rawDiffRatio,
    weightedDriftScore,
    regionScores,
    overlay: heatmap,
  };
}
