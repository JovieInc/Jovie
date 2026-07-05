/**
 * Pure weighted-arm selection for per-workflow model A/B bake-offs
 * (GH #11462). No I/O — the serving layer lives in service.server.ts.
 */

import type { ModelExperimentCandidate } from '@/lib/db/schema/model-experiments';

/**
 * FNV-1a hash with a murmur3-style avalanche finalizer. Plain djb2/FNV low
 * bits cluster badly for short sequential seeds (verified: an 80/20 split
 * came out 20/80 for `seed-N` style inputs); the finalizer spreads every
 * input bit across the output so the [0,1) mapping is uniform. Same seed
 * always lands on the same arm, so a user's experience is stable within an
 * experiment generation.
 */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // fmix32 avalanche (murmur3 finalizer)
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Deterministically pick a candidate model by weight.
 *
 * @param candidates Ordered arms (index 0 = control). Weights are relative
 *                   (80/20, 1/1, ...). Non-positive-weight arms get no traffic.
 * @param seed       Stable per-subject string (userId, requestId). The same
 *                   seed always maps to the same arm for a given candidate
 *                   list.
 */
export function selectExperimentModel(
  candidates: readonly ModelExperimentCandidate[],
  seed: string
): string {
  if (candidates.length === 0) {
    throw new RangeError('selectExperimentModel: candidates must be non-empty');
  }

  const eligible = candidates.filter(
    c => Number.isFinite(c.weight) && c.weight > 0
  );
  if (eligible.length === 0) {
    // All arms zero-weighted — serve control rather than throwing.
    return candidates[0]!.model;
  }
  if (eligible.length === 1) return eligible[0]!.model;

  const totalWeight = eligible.reduce((sum, c) => sum + c.weight, 0);
  // Map the hash onto [0, 1) and walk the cumulative weight distribution.
  const point = hashSeed(seed) / 0x100000000;
  let cumulative = 0;
  for (const candidate of eligible) {
    cumulative += candidate.weight / totalWeight;
    if (point < cumulative) return candidate.model;
  }
  // Floating-point tail: last eligible arm.
  return eligible[eligible.length - 1]!.model;
}

/**
 * Validate a candidate list for experiment creation. Returns an error
 * message or null when valid.
 */
export function validateCandidates(
  candidates: readonly ModelExperimentCandidate[]
): string | null {
  if (candidates.length < 2) {
    return 'An experiment needs at least 2 candidate models';
  }
  const models = new Set(candidates.map(c => c.model));
  if (models.size !== candidates.length) {
    return 'Candidate models must be unique';
  }
  for (const c of candidates) {
    if (!c.model || typeof c.model !== 'string') {
      return 'Every candidate needs a model id';
    }
    if (!Number.isFinite(c.weight) || c.weight < 0) {
      return 'Candidate weights must be non-negative numbers';
    }
  }
  if (!candidates.some(c => c.weight > 0)) {
    return 'At least one candidate must have positive weight';
  }
  return null;
}
