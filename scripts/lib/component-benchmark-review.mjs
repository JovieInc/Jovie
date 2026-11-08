/**
 * Review rule for component benchmark judgments (component-benchmarks.json).
 *
 * The certificate's `benchmark` criterion (lib/component-certificate.mjs)
 * passes a current, source-bound record whose adopt/adapt gaps are done and
 * whose skips carry a reason. On its own that lets `{ gaps: [] }` pass with no
 * evidence anyone looked. This rule closes that hole without growing the
 * capped certificate module: a current record must name what the component
 * was compared against (`reference`), or say in writing why no reference
 * pattern applies (`noPatternReason`), and every gap must name its item,
 * decision and reference. A record that fails the rule turns a passing
 * benchmark criterion into `fail`; stale or absent records stay `unknown`.
 */
const DECISIONS = new Set(['adopt', 'adapt', 'skip']);
const STATUSES = new Set(['open', 'done']);
const text = value => typeof value === 'string' && value.trim().length > 0;

/** @returns {string[]} why the record is not a reviewed judgment (empty = ok) */
export function benchmarkReviewErrors(record) {
  if (!record || typeof record !== 'object') return ['record missing'];
  const errors = [];
  if (!text(record.reference) && !text(record.noPatternReason))
    errors.push('name a reference pattern or give a noPatternReason');
  if (!Array.isArray(record.gaps)) errors.push('gaps must be an array');
  for (const [i, gap] of (record.gaps ?? []).entries()) {
    const at = `gap ${i + 1}`;
    if (!text(gap?.item)) errors.push(`${at}: item required`);
    if (!DECISIONS.has(gap?.decision))
      errors.push(`${at}: decision must be adopt, adapt or skip`);
    if (!text(gap?.reference)) errors.push(`${at}: reference required`);
    if (gap?.decision !== 'skip' && !STATUSES.has(gap?.status))
      errors.push(`${at}: status must be open or done`);
  }
  return errors;
}

/**
 * Apply the review rule to one certificate. Only a current judgment (the
 * benchmark criterion is pass or fail) is checked; the result is a new
 * certificate with `certified` and `passing` recomputed.
 */
export function applyBenchmarkReview(cert, record) {
  const at = cert.criteria.findIndex(c => c.id === 'benchmark');
  const current = cert.criteria[at];
  if (at < 0 || !['pass', 'fail'].includes(current.status)) return cert;
  const errors = benchmarkReviewErrors(record);
  if (!errors.length) return cert;
  const criteria = cert.criteria.slice();
  criteria[at] = { ...current, status: 'fail', review: errors };
  const missing = [
    ...cert.missing,
    {
      criterion: 'benchmark',
      reason: 'benchmark judgment has no recorded review',
      how: errors.join('; '),
    },
  ];
  return {
    ...cert,
    criteria,
    missing,
    certified: criteria.every(c => c.status === 'pass' || c.status === 'na'),
    passing: criteria.filter(c => c.status === 'pass').length,
  };
}
