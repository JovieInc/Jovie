/**
 * Closed-loop health contract (fleet/closed-loop-gaps.md "common fix").
 *
 * A loop is signal -> threshold -> owned agent-ready Linear issue -> fix ->
 * re-measure -> guard. This module is the pure half:
 *
 * - evaluateRules: metrics against declared thresholds. A rule is `ok`,
 *   `breach`, `insufficient` (sample too small to judge) or `unknown` (metric
 *   unreadable). Only `breach` opens or updates an issue and only a fully `ok`
 *   evaluation closes one: silence, thin samples and unreadable metrics hold
 *   the current state, so an issue never closes on missing evidence.
 * - planLoopIntake: the single upsert / resolve / hold decision.
 * - buildReceipt: the jovie-loop-health/v1 receipt with entry and exit
 *   timestamps, so detection-to-issue and issue-to-recovery are measurable.
 * - buildIssue: the agent-ready issue (signal, why it matters, acceptance
 *   criteria that name the re-measure command).
 *
 * Definitions live in scripts/loops/<loop>.mjs; the registry ratchet in
 * scripts/loop-health.registry.test.mjs fails any definition that lacks a
 * clock, workflow, registry row with a dwell SLO, or a threshold.
 */

export const LOOP_RECEIPT_SCHEMA = 'jovie-loop-health/v1';
export const LOOP_KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const RULE_STATES = Object.freeze([
  'ok',
  'breach',
  'insufficient',
  'unknown',
]);

export function loopFingerprint(loop) {
  return `loop-health-${loop}`;
}

const finite = value => typeof value === 'number' && Number.isFinite(value);

/**
 * rule: { id, metric, op: 'max' | 'min', threshold, unit?, description?,
 *         sample?: { metric, min } }
 * metrics: { [name]: number | null }
 */
export function evaluateRule(rule, metrics) {
  const value = metrics?.[rule.metric];
  const base = {
    id: rule.id,
    metric: rule.metric,
    op: rule.op,
    threshold: rule.threshold,
    unit: rule.unit ?? '',
    description: rule.description ?? '',
    value: finite(value) ? value : null,
  };
  if (!finite(value)) return { ...base, state: 'unknown' };
  if (rule.sample) {
    const sample = metrics?.[rule.sample.metric];
    if (!finite(sample)) return { ...base, state: 'unknown' };
    if (sample < rule.sample.min) {
      return {
        ...base,
        state: 'insufficient',
        sample,
        sampleMin: rule.sample.min,
      };
    }
  }
  const breached =
    rule.op === 'min' ? value < rule.threshold : value > rule.threshold;
  return { ...base, state: breached ? 'breach' : 'ok' };
}

export function evaluateRules(rules, metrics) {
  const results = rules.map(rule => evaluateRule(rule, metrics));
  const status = results.some(r => r.state === 'breach')
    ? 'breach'
    : results.every(r => r.state === 'ok')
      ? 'ok'
      : 'hold';
  return { status, results };
}

export function buildReceipt({
  loop,
  startedAt,
  finishedAt,
  metrics,
  evaluation,
  detail = {},
  collectError = null,
}) {
  return {
    schema: LOOP_RECEIPT_SCHEMA,
    loop,
    fingerprint: loopFingerprint(loop),
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    status: collectError ? 'error' : evaluation.status,
    collectError,
    metrics,
    rules: evaluation?.results ?? [],
    detail,
  };
}

/** upsert on breach, resolve only on a fully ok evaluation, else hold. */
export function planLoopIntake(receipt) {
  const key = loopFingerprint(receipt.loop);
  if (receipt.status === 'breach') return { action: 'upsert', key };
  if (receipt.status === 'ok') return { action: 'resolve', key };
  return { action: 'hold', key, reason: receipt.status };
}

function fmt(result) {
  const cmp = result.op === 'min' ? '>=' : '<=';
  const value = result.value === null ? 'n/a' : `${result.value}${result.unit}`;
  return `${result.id}: ${value} (limit ${cmp} ${result.threshold}${result.unit})`;
}

export function buildIssue(def, receipt, runUrl = '') {
  const key = loopFingerprint(def.key);
  const breached = receipt.rules.filter(r => r.state === 'breach');
  const held = receipt.rules.filter(
    r => r.state !== 'breach' && r.state !== 'ok'
  );
  const lines = breached.map(
    r => `- ${fmt(r)}${r.description ? `: ${r.description}` : ''}`
  );
  const detailLines = (receipt.detail?.findings ?? []).map(f => `- ${f}`);
  const title = `${def.severity ?? 'High'}: ${def.title} (${key})`;
  const limits = def.rules
    .map(
      r =>
        `${r.id} ${r.op === 'min' ? '>=' : '<='} ${r.threshold}${r.unit ?? ''}`
    )
    .join('; ');
  const description = `## Signal
- Severity: ${(def.severity ?? 'High').toLowerCase()}
- Route: bug
- Environment: production
- Loop: ${def.key} (owner: ${def.owner})
- Measured at: ${receipt.finishedAt}

## Source
- Current issue: ${def.sourceIssue ?? 'none'}
- Source branch/session: ${def.source}
- Receipt: ${runUrl || 'local run'}

## Follow-up
${def.summary}

Breached thresholds:
${lines.join('\n') || '- (none recorded)'}
${detailLines.length ? `\nFindings:\n${detailLines.join('\n')}\n` : ''}${held.length ? `\nNot judged this run (insufficient sample or unreadable): ${held.map(r => r.id).join(', ')}\n` : ''}
## Why it matters
${def.whyItMatters}

## Classification
Required

## Acceptance criteria or triage question
Fix the cause, then re-measure. This issue closes automatically only when the loop's next run reports every rule within threshold (${limits}). Do not close it by hand and do not loosen a threshold to turn it green: the ratchet test rejects threshold loosening.
Re-measure: \`${def.remeasure}\`
Dwell SLO: filed within ${def.dwellSloMinutes} minutes of the metric breaching.

## Dependency
None

Fingerprint: \`${key}\``;
  return { fingerprint: key, title, description };
}

export function resolveComment(def, receipt) {
  return `Re-measured ${receipt.finishedAt}: every ${def.key} rule is within threshold (${receipt.rules.map(fmt).join('; ')}).`;
}
