/**
 * N=5 range reporting for real-model eval lanes.
 */

import type { RealEvalRangeReport } from './types';

export function selectDeterministicSample<T>(
  items: readonly T[],
  sampleSize: number
): readonly T[] {
  if (sampleSize <= 0) return [];
  return items.slice(0, Math.min(sampleSize, items.length));
}

export function parseSampleSize(raw: string | undefined, fallback = 5): number {
  const parsed = Number.parseInt(raw ?? String(fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseMinPassCount(
  sampleSize: number,
  raw: string | undefined
): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return Math.min(parsed, sampleSize);
  }
  return Math.max(1, sampleSize - 2);
}

export function buildRangeReport(
  lane: RealEvalRangeReport['lane'],
  results: readonly boolean[],
  sampleSize: number,
  minPass: number
): RealEvalRangeReport {
  const passed = results.filter(Boolean).length;
  const boundedMin = Math.min(minPass, sampleSize);

  return {
    lane,
    sampleSize,
    passed,
    failed: sampleSize - passed,
    passRange: { min: boundedMin, max: sampleSize },
    withinRange: passed >= boundedMin && passed <= sampleSize,
  };
}

export function formatRangeReport(report: RealEvalRangeReport): string {
  return [
    'REAL_EVAL_RANGE_REPORT',
    `lane=${report.lane}`,
    `n=${report.sampleSize}`,
    `passed=${report.passed}/${report.sampleSize}`,
    `range=[${report.passRange.min},${report.passRange.max}]`,
    `within=${report.withinRange}`,
  ].join(' ');
}
