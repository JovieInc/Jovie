import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type {
  VisualQaLockedRegionHashRecord,
  VisualQaViewportRegion,
} from '@/lib/visual-qa/types';

export interface VisualQaLockedRegionDefinition extends VisualQaViewportRegion {
  readonly id: string;
}

interface RawImage {
  readonly data: Buffer;
  readonly width: number;
  readonly height: number;
}

function resolveCrop(
  region: VisualQaViewportRegion,
  width: number,
  height: number
): {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
} {
  const left = Math.max(0, Math.min(width - 1, Math.round(region.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(region.y * height)));
  const right = Math.min(
    width,
    Math.max(left + 1, Math.round((region.x + region.width) * width))
  );
  const bottom = Math.min(
    height,
    Math.max(top + 1, Math.round((region.y + region.height) * height))
  );

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
}

async function loadRawImage(image: Buffer): Promise<RawImage> {
  const raw = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data: raw.data, width: raw.info.width, height: raw.info.height };
}

export function hashBufferSha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function hashVisualQaLockedRegions(
  image: Buffer,
  regions: readonly VisualQaLockedRegionDefinition[]
): Promise<readonly VisualQaLockedRegionHashRecord[]> {
  if (regions.length === 0) return [];

  const metadata = await sharp(image).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error('Cannot hash locked regions without image dimensions.');
  }

  const rawImage = await loadRawImage(image);
  const hashes: VisualQaLockedRegionHashRecord[] = [];

  for (const region of regions) {
    const crop = resolveCrop(region, rawImage.width, rawImage.height);
    const cropData = Buffer.alloc(crop.width * crop.height * 4);

    for (let y = 0; y < crop.height; y += 1) {
      const sourceStart = ((crop.top + y) * rawImage.width + crop.left) * 4;
      const targetStart = y * crop.width * 4;
      rawImage.data.copy(
        cropData,
        targetStart,
        sourceStart,
        sourceStart + crop.width * 4
      );
    }

    const canonicalPng = await sharp(cropData, {
      raw: { width: crop.width, height: crop.height, channels: 4 },
    })
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer();

    hashes.push({ id: region.id, sha256: hashBufferSha256(canonicalPng) });
  }

  return hashes;
}
