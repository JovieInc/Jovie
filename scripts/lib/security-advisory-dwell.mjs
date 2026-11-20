// Pure + Linear-backed dwell proof for security-advisory stages
// (docs/metrics/stage-manifest.json entity security-advisory).
// Phases: detect-owned (intake loop cadence via caller), finding-pr,
// pr-production (open Summer secadv Linear issues as waiting work).

const SECADV_TITLE = /\[secadv-/i;

/**
 * Pick the oldest waiting Linear issue for a security dwell phase.
 * @param {{ identifier?: string, title?: string, createdAt?: string, updatedAt?: string, state?: { type?: string, name?: string }, description?: string }[]} issues
 * @param {'finding-pr' | 'pr-production'} phase
 */
export function selectSecurityDwellWaiting(issues, phase) {
  const open = (issues ?? []).filter(issue => {
    const type = String(issue?.state?.type ?? '').toLowerCase();
    if (type === 'completed' || type === 'canceled') return false;
    const title = String(issue?.title ?? '');
    if (!SECADV_TITLE.test(title)) return false;
    const body = String(issue?.description ?? '');
    const hasPr = /github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/i.test(body);
    if (phase === 'finding-pr') return !hasPr;
    if (phase === 'pr-production') return hasPr;
    return false;
  });
  const timed = open
    .map(issue => ({
      id: issue.identifier ?? issue.title,
      at: Date.parse(issue.createdAt ?? issue.updatedAt ?? ''),
    }))
    .filter(row => Number.isFinite(row.at))
    .sort((a, b) => a.at - b.at);
  return timed;
}

/**
 * @param {{
 *   phase: 'finding-pr' | 'pr-production',
 *   issues: any[],
 *   nowMs: number,
 *   dwellSloMinutes: number,
 * }} input
 */
export function evaluateSecurityLinearDwell(input) {
  const waiting = selectSecurityDwellWaiting(input.issues, input.phase);
  if (!waiting.length) {
    return {
      ok: true,
      lastProofAt: new Date(input.nowMs).toISOString(),
      reason: `${input.phase}:empty`,
    };
  }
  const over = waiting.filter(
    row => input.nowMs - row.at > input.dwellSloMinutes * 60_000
  ).length;
  return {
    ok: true,
    lastProofAt: new Date(waiting[0].at).toISOString(),
    detailOnStale: true,
    reason: `${input.phase}:waiting=${waiting.length};over-slo=${over};oldest=${waiting[0].id}`,
  };
}

/**
 * Observe open Summer secadv Linear issues for finding→pr or pr→production.
 * @param {{ phase: string, teams?: string[], dwellSloMinutes?: number }} receipt
 * @param {{ linear: { graphql: Function } | null, nowMs: number }} ctx
 */
export async function observeSecurityAdvisoryDwell(receipt, { linear, nowMs }) {
  const phase = receipt.phase;
  if (phase !== 'finding-pr' && phase !== 'pr-production')
    return { ok: false, reason: 'security-dwell-phase-invalid' };
  if (!linear) return { ok: false, reason: 'linear-client-missing' };
  const teams = receipt.teams ?? ['JOV'];
  const dwellSloMinutes = receipt.dwellSloMinutes ?? 2880;
  let issues;
  try {
    const data = await linear.graphql(
      `query($teams:[String!]){issues(first:100,filter:{team:{key:{in:$teams}},title:{containsIgnoreCase:"[secadv-"}}){nodes{identifier title createdAt updatedAt description state{type name}}}}`,
      { teams }
    );
    issues = data?.issues?.nodes;
  } catch {
    return { ok: false, reason: 'security-dwell-linear-unreadable' };
  }
  if (!Array.isArray(issues))
    return { ok: false, reason: 'security-dwell-linear-unreadable' };
  return evaluateSecurityLinearDwell({
    phase,
    issues,
    nowMs,
    dwellSloMinutes,
  });
}
