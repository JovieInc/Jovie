/**
 * Anti-copy guard for the design reference corpus (JOV-7081).
 *
 * References are inspiration: generated or hand-built Jovie work may move
 * toward a reference's principles but must never reproduce its pixels. Each
 * reference stores a 256-bit difference hash (dHash) of its captured fold;
 * a candidate is checked fold by fold and fails when any region sits within
 * `maxDistance` bits of a reference.
 */

import sharp from 'sharp';

import type { CorpusReferenceRecord } from './types';

const HASH_COLUMNS = 16;
const HASH_ROWS = 16;
/** References are captured at a 1440x900 desktop fold. */
export const REFERENCE_FOLD_ASPECT = 900 / 1440;
/**
 * Calibrated on the 2026-10-03 seed corpus (17 product-site folds): unrelated
 * pages sit 74-157 bits apart; two captures of one page with a moving hero
 * differ by 30-68. 40 catches re-encodes, recolours and light crops of a
 * reference while staying well clear of merely sharing a dark, centred look.
 */
export const DEFAULT_MAX_COPY_DISTANCE = 40;

export interface ImageRegion {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** 256-bit dHash as 64 hex chars: each bit is "left pixel brighter than right". */
export async function computeDHash(
  input: Buffer | string,
  region?: ImageRegion
): Promise<string> {
  let pipeline = sharp(input).rotate();
  if (region) pipeline = pipeline.extract(region);
  const pixels = await pipeline
    .greyscale()
    .resize(HASH_COLUMNS + 1, HASH_ROWS, { fit: 'fill' })
    .raw()
    .toBuffer();
  let hex = '';
  let nibble = 0;
  let bits = 0;
  for (let row = 0; row < HASH_ROWS; row += 1) {
    for (let column = 0; column < HASH_COLUMNS; column += 1) {
      const offset = row * (HASH_COLUMNS + 1) + column;
      nibble = (nibble << 1) | (pixels[offset] > pixels[offset + 1] ? 1 : 0);
      bits += 1;
      if (bits === 4) {
        hex += nibble.toString(16);
        nibble = 0;
        bits = 0;
      }
    }
  }
  return hex;
}

export function hammingDistance(left: string, right: string): number {
  if (left.length !== right.length) {
    throw new Error('Perceptual hashes must be the same length.');
  }
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    let xor =
      Number.parseInt(left[index], 16) ^ Number.parseInt(right[index], 16);
    while (xor) {
      distance += xor & 1;
      xor >>= 1;
    }
  }
  return distance;
}

/**
 * Fold-shaped regions down a full-page capture, overlapping by half a fold,
 * so a copied hero is caught wherever it sits on the page.
 */
export function foldRegions(width: number, height: number): ImageRegion[] {
  const foldHeight = Math.min(
    height,
    Math.round(width * REFERENCE_FOLD_ASPECT)
  );
  const step = Math.max(1, Math.round(foldHeight / 2));
  const regions: ImageRegion[] = [];
  for (let top = 0; top + foldHeight <= height; top += step) {
    regions.push({ left: 0, top, width, height: foldHeight });
  }
  const last = regions.at(-1);
  if (!last || last.top + foldHeight < height) {
    regions.push({
      left: 0,
      top: height - foldHeight,
      width,
      height: foldHeight,
    });
  }
  return regions;
}

export interface RefCopyMatch {
  readonly image: string;
  readonly referenceId: string;
  readonly region: ImageRegion;
  readonly distance: number;
}

/**
 * Every (image region, reference) pair closer than `maxDistance`. Rejected
 * and decertified references are still checked: copying a reference Tim
 * rejected is no better than copying one he approved.
 */
export async function findRefCopies(input: {
  readonly images: readonly string[];
  readonly references: readonly CorpusReferenceRecord[];
  readonly maxDistance?: number;
}): Promise<RefCopyMatch[]> {
  const maxDistance = input.maxDistance ?? DEFAULT_MAX_COPY_DISTANCE;
  const hashed = input.references.flatMap(record =>
    record.reference.media
      ? [{ id: record.reference.id, dhash: record.reference.media.dhash }]
      : []
  );
  if (hashed.length === 0) return [];
  const matches: RefCopyMatch[] = [];
  for (const image of input.images) {
    // computeDHash rotates before extracting, so regions use oriented dimensions.
    const { width, height } = (await sharp(image).metadata()).autoOrient;
    if (!width || !height) continue;
    for (const region of foldRegions(width, height)) {
      const hash = await computeDHash(image, region);
      for (const reference of hashed) {
        const distance = hammingDistance(hash, reference.dhash);
        if (distance <= maxDistance) {
          matches.push({ image, referenceId: reference.id, region, distance });
        }
      }
    }
  }
  return matches.sort((left, right) => left.distance - right.distance);
}
