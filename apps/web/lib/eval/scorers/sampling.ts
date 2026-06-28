/**
 * Stratified prod-trace sampling for online scorers (cost control).
 */

import { createHash } from 'node:crypto';

import type { ProdTraceSampleInput } from './types';

export const DEFAULT_SAMPLE_RATE = 0.05;
export const DEFAULT_HIGH_COST_DURATION_MS = 15_000;
export const DEFAULT_HIGH_COST_TOKEN_COUNT = 4_000;

function readSampleRate(): number {
  const raw = process.env.JOVIE_ONLINE_SCORER_SAMPLE_RATE;
  if (!raw) return DEFAULT_SAMPLE_RATE;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1) {
    return DEFAULT_SAMPLE_RATE;
  }
  return parsed;
}

function stableUnitInterval(traceId: string, salt: string): number {
  const digest = createHash('sha256')
    .update(`${salt}:${traceId}`)
    .digest('hex');
  const slice = digest.slice(0, 8);
  const int = Number.parseInt(slice, 16);
  return int / 0xffffffff;
}

export function isHighCostTrace(input: ProdTraceSampleInput): boolean {
  const durationMs = input.durationMs ?? 0;
  const tokenCount = input.tokenCount ?? 0;
  return (
    durationMs >= DEFAULT_HIGH_COST_DURATION_MS ||
    tokenCount >= DEFAULT_HIGH_COST_TOKEN_COUNT
  );
}

/**
 * Deterministic hash-based sampling so the same traceId always gets the same
 * decision within a deployment (stable for soft-failure reruns).
 */
export function shouldSampleProdTrace(
  input: ProdTraceSampleInput,
  options: {
    readonly sampleRate?: number;
    readonly alwaysSampleHighCost?: boolean;
  } = {}
): boolean {
  const sampleRate = options.sampleRate ?? readSampleRate();
  const alwaysSampleHighCost = options.alwaysSampleHighCost ?? true;

  if (alwaysSampleHighCost && isHighCostTrace(input)) {
    return true;
  }

  const bucket = stableUnitInterval(input.traceId, 'jovie-online-scorer-v1');
  return bucket < sampleRate;
}
