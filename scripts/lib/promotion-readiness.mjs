// Pure deterministic promotion core. Run only from protected policy code.
// Trusted collector contract and wiring requirements: docs/ci/promotion-bar.md.
// Never executes PR code, reads secrets, mutates GitHub, or emits a check failure.
// No invented probability weights: empirical first-pass rate is a separate field.
export const REQUIRED = Object.freeze([
  'sourceChecks',
  'mergeSuiteParity',
  'dryMerge',
  'sizePolicy',
  'guardrailSchema',
  'holdsClear',
  'outsideReviewRecorded',
  'retryBudget',
]);
const sha = s => typeof s === 'string' && /^[a-f0-9]{40}$/.test(s);
const id = t => JSON.stringify(t);
export function lowerBound(successes, n) {
  if (
    !Number.isInteger(n) ||
    !Number.isInteger(successes) ||
    n <= 0 ||
    successes < 0 ||
    successes > n
  )
    return null;
  // One-sided 95% Wilson bound, not a claim about any individual PR.
  const z = 1.6448536269514722,
    p = successes / n;
  return (
    (p +
      (z * z) / (2 * n) -
      z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) /
    (1 + (z * z) / n)
  );
}
export function evaluate(
  x,
  { now, maxAgeMs = 30 * 60 * 1000, calibrated = false } = {}
) {
  const failures = [],
    warnings = [];
  if (!Number.isFinite(now)) throw new TypeError('trusted clock required');
  const t = x?.tuple;
  if (
    !t ||
    !sha(t.head) ||
    !sha(t.base) ||
    !sha(t.tree) ||
    !sha(t.policy) ||
    !sha(t.metadata) ||
    !Number.isInteger(t.pr) ||
    t.pr < 1 ||
    typeof t.repo !== 'string'
  )
    return {
      ready: false,
      failures: ['identity'],
      warnings,
      probability: null,
    };
  const fresh = r =>
    r && Number.isFinite(r.at) && now >= r.at && now - r.at <= maxAgeMs;
  // A required context absent from the collector is FAIL, not vacuous green.
  for (const name of REQUIRED) {
    const r = x.evidence?.[name];
    if (!r || r.pass !== true || id(r.tuple) !== id(t) || !fresh(r))
      failures.push(name);
  }
  if (
    !fresh(x.snapshot) ||
    id(x.snapshot.tuple) !== id(t) ||
    x.snapshot.complete !== true
  )
    failures.push('incomplete/stale snapshot');
  if (x.main !== t.base) failures.push('main moved');
  if (
    x.queue?.complete !== true ||
    x.queue?.version !== x.snapshot?.queueVersion
  )
    failures.push('queue snapshot incomplete/moved');
  if (x.queue?.lease !== true) failures.push('no bounded admission lease');
  if (x.queue?.overlap === 'conflict' || x.queue?.overlap === 'unknown')
    failures.push('queue integration');
  if (x.queue?.overlap === 'files-only')
    warnings.push(
      'file overlap: shared path alone is not a conflict; tested combined tree required'
    );
  if (x.health?.complete !== true || x.health?.circuitOpen !== false)
    failures.push('queue health');
  // Quarantine never means skipping required tests. Repair/replacement must
  // preserve required coverage; a red required test still fails sourceChecks.
  if (x.health?.suspectedFlakes?.length)
    warnings.push(
      'suspected flakes: diagnose same tuple/env; no blind retries or quarantine bypass'
    );
  const c = x.calibration;
  const bound =
    c &&
    c.policy === t.policy &&
    c.complete === true &&
    c.definition === 'first-pass-v1' &&
    Number.isFinite(c.at) &&
    now >= c.at &&
    now - c.at <= 7 * 86400000
      ? lowerBound(c.clean, c.resolved)
      : null;
  if (calibrated && (bound === null || bound < 0.9))
    failures.push('90% cohort reliability unproven');
  return {
    ready: failures.length === 0,
    failures,
    warnings,
    probability: null,
    cohortLowerBound: bound,
    reliability:
      bound !== null && bound >= 0.9
        ? 'validated cohort'
        : '90% target, unvalidated',
    tuple: t,
  };
}
