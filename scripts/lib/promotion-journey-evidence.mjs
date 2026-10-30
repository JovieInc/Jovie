// Promotion gate for golden-path journey evidence (extends JOV-5937;
// release-integrity repair 2, founder decision 2026-10-21).
//
// A candidate whose range artifact (`jovie.release-range-risk/v1`) affects
// a golden-path surface, or is unknown, may be promoted only with successful, fresh,
// exact-candidate evidence for BOTH the auth and billing journeys, produced by
// a run that actually executed them. Never counted: dispatch success, skipped
// tests, mocked providers, expired quarantine exclusions, exit-0 placeholders,
// stale evidence, evidence for a different SHA.
//
// Evidence schema `jovie.journey-evidence/v1`:
//   { schema, journey: 'auth'|'billing', candidateSha, deploymentSha?,
//     source: 'playwright-run', runId, runUrl, conclusion: 'success',
//     completedAt (ISO), tests: { total, passed, failed, skipped },
//     providers: [{ name, mode }], quarantinedExclusions: [{ path, expiresAt }] }
//
// Pre-promotion gating lives here. Post-deploy smoke/recovery is separate
// (production-controller). The only bypass is a MANUAL recovery override
// receipt with a named human approver and reason; it is never automatic.

export const EVIDENCE_SCHEMA = 'jovie.journey-evidence/v1';
export const OVERRIDE_SCHEMA = 'jovie.promotion-recovery-override/v1';
export const GATE_SCHEMA = 'jovie.promotion-journey-gate/v1';
export const REQUIRED_JOURNEYS = ['auth', 'billing'];
/** Evidence older than this at decision time is stale. */
export const DEFAULT_FRESHNESS_MS = 6 * 60 * 60 * 1000;
export const MAX_FRESHNESS_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;
export const OVERRIDE_TTL_MS = 60 * 60 * 1000;
const EXECUTING_SOURCES = new Set(['playwright-run']);
const SHA = /^[0-9a-f]{40}$/;
const AUTOMATION_APPROVER =
  /bot|github-actions|automation|system|claude|agent|hermes/i;

export function journeysRequired(range) {
  if (!range || range.schema !== 'jovie.release-range-risk/v1') return true;
  if (
    !SHA.test(range.candidateSha ?? '') ||
    !SHA.test(range.baseDeployedSha ?? '') ||
    range.unknown !== false
  )
    return true;
  const a = range.affects;
  if (
    !a ||
    ['auth', 'billing', 'unknown'].some(key => typeof a[key] !== 'boolean')
  )
    return true;
  // Every golden-path surface is a promotion input: sign-in, billing, the
  // public profile and release pages, the proxy that routes them, and the
  // database that holds the claim. Docs-, tests- and tooling-only ranges stay
  // exempt because they grade as none of these.
  return (
    a.auth === true ||
    a.billing === true ||
    a.publicUi === true ||
    a.proxy === true ||
    a.database === true ||
    a.unknown === true
  );
}

function validateEvidence(ev, journey, range, nowMs, freshnessMs) {
  const r = [];
  if (!ev || typeof ev !== 'object') return ['evidence missing'];
  if (ev.schema !== EVIDENCE_SCHEMA) r.push('wrong evidence schema');
  if (ev.journey !== journey) r.push(`evidence is for journey ${ev.journey}`);
  if (
    !SHA.test(ev.candidateSha ?? '') ||
    ev.candidateSha !== range.candidateSha
  )
    r.push('evidence is not for the exact candidate SHA');
  if (ev.deploymentSha !== undefined && ev.deploymentSha !== range.candidateSha)
    r.push('evidence deployment is not the candidate SHA');
  if (!EXECUTING_SOURCES.has(ev.source))
    r.push(
      `source ${ev.source} did not execute the journey (dispatch/placeholder)`
    );
  if (ev.conclusion !== 'success') r.push('run conclusion is not success');
  if (!ev.runId || !ev.runUrl) r.push('missing run id/url');
  const t = ev.tests ?? {};
  if (!Number.isInteger(t.total) || t.total < 1) r.push('no tests executed');
  if (t.skipped !== 0) r.push('journey has skipped tests');
  if (t.failed !== 0) r.push('journey has failed tests');
  if (t.passed !== t.total) r.push('not every journey test passed');
  const providers = Array.isArray(ev.providers) ? ev.providers : [];
  if (providers.length === 0) r.push('no provider mode recorded');
  if (ev.mocked === true || providers.some(p => p.mode === 'mock'))
    r.push('journey used mocked providers');
  if (
    journey === 'billing' &&
    !providers.some(p => p.name === 'stripe' && p.mode === 'test')
  )
    r.push('billing journey did not run against real Stripe test mode');
  if (
    journey === 'auth' &&
    !providers.some(p => p.name === 'auth' && p.mode === 'real')
  )
    r.push('auth journey did not run against the real auth provider');
  const expired = (ev.quarantinedExclusions ?? []).filter(q => {
    const ms = Date.parse(q.expiresAt);
    return Number.isNaN(ms) || ms < nowMs;
  });
  if (expired.length)
    r.push('journey excluded tests via an expired quarantine');
  const done = Date.parse(ev.completedAt);
  if (Number.isNaN(done)) r.push('missing completion time');
  else if (done > nowMs + CLOCK_SKEW_MS)
    r.push('evidence completed in the future');
  else if (nowMs - done > freshnessMs) r.push('evidence is stale');
  return r;
}

export function validateOverride(override, candidateSha, nowMs) {
  const r = [];
  if (!override || override.schema !== OVERRIDE_SCHEMA)
    return ['not an override receipt'];
  if (override.candidateSha !== candidateSha)
    r.push('override is for a different SHA');
  const approver = String(override.approver ?? '').trim();
  if (!approver || AUTOMATION_APPROVER.test(approver))
    r.push('override needs a named human approver');
  if (String(override.reason ?? '').trim().length < 20)
    r.push('override needs a reason (20+ chars)');
  if (override.automatic === true || override.mode !== 'manual')
    r.push('override must be manual');
  const exp = Date.parse(override.expiresAt);
  if (Number.isNaN(exp) || exp < nowMs) r.push('override expired');
  return r;
}

/**
 * Build the audited receipt for a manual recovery override.
 * @param {{candidateSha: string, approver: string, reason: string,
 *   issueRef?: string, now?: Date}} options
 */
export function createRecoveryOverride({
  candidateSha,
  approver,
  reason,
  issueRef,
  now = new Date(),
}) {
  const receipt = {
    schema: OVERRIDE_SCHEMA,
    mode: 'manual',
    automatic: false,
    candidateSha,
    approver,
    reason,
    issueRef: issueRef ?? null,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + OVERRIDE_TTL_MS).toISOString(),
  };
  const problems = validateOverride(receipt, candidateSha, now.getTime());
  if (problems.length)
    throw new Error(`invalid recovery override: ${problems.join('; ')}`);
  return receipt;
}

/**
 * @returns {{schema, decision: 'pass'|'blocked'|'override', required: boolean,
 *   reasons: string[], perJourney: Record<string,string[]>, candidateSha, override?}}
 */
export function evaluatePromotion({
  range,
  evidence = [],
  now = new Date(),
  freshnessMs = DEFAULT_FRESHNESS_MS,
  override = null,
}) {
  const nowMs = now.getTime();
  const window = Math.min(Math.max(freshnessMs, 1), MAX_FRESHNESS_MS);
  const candidateSha = range?.candidateSha ?? null;
  const base = {
    schema: GATE_SCHEMA,
    candidateSha,
    evaluatedAt: now.toISOString(),
  };
  if (!journeysRequired(range)) {
    return {
      ...base,
      decision: 'pass',
      required: false,
      reasons: [],
      perJourney: {},
    };
  }
  /** @type {Record<string, string[]>} */
  const perJourney = {};
  for (const journey of REQUIRED_JOURNEYS) {
    const candidates = evidence.filter(e => e?.journey === journey);
    if (candidates.length === 0) {
      perJourney[journey] = ['no evidence'];
      continue;
    }
    // Only executed, exact-candidate observations can supersede an execution.
    // Artifact download order is not chronology. A failed rerun must invalidate
    // an earlier green; a later successful recovery can certify it again.
    const executions = candidates.filter(
      e => e.candidateSha === candidateSha && EXECUTING_SOURCES.has(e.source)
    );
    if (executions.some(e => !Number.isFinite(Date.parse(e.completedAt)))) {
      perJourney[journey] = ['executed evidence has unknown completion time'];
      continue;
    }
    const latest = Math.max(...executions.map(e => Date.parse(e.completedAt)));
    const current = executions.length
      ? executions.filter(e => Date.parse(e.completedAt) === latest)
      : candidates;
    const results = current.map(e =>
      validateEvidence(e, journey, range ?? {}, nowMs, window)
    );
    // Equal timestamps have no trustworthy ordering: every tied execution
    // must agree. A green record cannot erase a contradictory failure.
    perJourney[journey] = [...new Set(results.flat())];
  }
  const reasons = Object.entries(perJourney).flatMap(([j, rs]) =>
    rs.map(x => `${j}: ${x}`)
  );
  if (reasons.length === 0)
    return { ...base, decision: 'pass', required: true, reasons, perJourney };
  if (override) {
    const problems = validateOverride(override, candidateSha, nowMs);
    if (problems.length === 0) {
      return {
        ...base,
        decision: 'override',
        required: true,
        reasons,
        perJourney,
        override,
      };
    }
    return {
      ...base,
      decision: 'blocked',
      required: true,
      reasons: [...reasons, ...problems.map(p => `override: ${p}`)],
      perJourney,
    };
  }
  return { ...base, decision: 'blocked', required: true, reasons, perJourney };
}
