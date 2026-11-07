// Pure helpers for the test-quality loop: per-surface aggregation, floors that
// only ratchet up, survivors-killed deltas and the model-change fingerprint.
import { createHash } from 'node:crypto';
import { tierFor } from './test-quality-rank.mjs';

/** Aggregate sweep state (modules map) by surface tier. */
export function aggregateByTier(state, surfaces) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const [file, m] of Object.entries(state.modules ?? {})) {
    if (m.status !== 'scored' || !(m.valid > 0)) continue;
    const t = tierFor(file, surfaces).name;
    const a = (out[t] ??= {
      modules: 0,
      valid: 0,
      killed: 0,
      survived: 0,
      minutes: 0,
    });
    a.modules += 1;
    a.valid += m.valid;
    a.killed += m.killed ?? m.valid - m.survived;
    a.survived += m.survived;
    a.minutes += (m.durationMs ?? 0) / 60000;
  }
  for (const a of Object.values(out)) {
    a.score = Math.round((a.killed / a.valid) * 1000) / 10;
    a.minutes = Math.round(a.minutes * 10) / 10;
  }
  return out;
}

/** Survivors killed since the previous report (never negative per module). */
export function survivorsKilled(prevByModule, state) {
  let killed = 0;
  for (const [file, m] of Object.entries(state.modules ?? {})) {
    if (m.status !== 'scored') continue;
    const before = prevByModule?.[file];
    if (typeof before === 'number' && m.survived < before)
      killed += before - m.survived;
  }
  return killed;
}

export const survivorMap = state =>
  Object.fromEntries(
    Object.entries(state.modules ?? {})
      .filter(([, m]) => m.status === 'scored')
      .map(([f, m]) => [f, m.survived])
  );

/** Floors only move up: returns {floors, violations}. null floor = unset. */
export function evaluateFloors(byTier, floors) {
  const violations = [];
  const next = { ...floors };
  for (const [tier, agg] of Object.entries(byTier)) {
    const floor = floors?.[tier];
    if (typeof floor === 'number' && agg.score < floor)
      violations.push({ tier, score: agg.score, floor });
    const proposed = Math.floor(agg.score - 1);
    if (agg.valid >= 100 && (typeof floor !== 'number' || proposed > floor))
      next[tier] = proposed;
  }
  return { violations, next };
}

/** Latest model id per family from capacity.json modelFamilies. */
export function modelIds(capacity) {
  const ids = {};
  for (const [name, fam] of Object.entries(
    capacity?.modelFamilies?.families ?? {}
  ))
    if (fam?.latest) ids[name] = fam.latest;
  return ids;
}
export const modelFingerprint = ids =>
  createHash('sha1')
    .update(JSON.stringify(Object.entries(ids).sort()))
    .digest('hex')
    .slice(0, 16);

/** Mark the top-touch scored modules stale so the sweep re-scores them first. */
export function rearmTop(state, ranked, n) {
  let armed = 0;
  for (const r of ranked) {
    if (armed >= n) break;
    const m = state.modules?.[r.file];
    if (m?.status === 'scored') {
      m.at = new Date(0).toISOString();
      armed += 1;
    }
  }
  return armed;
}
