/**
 * Deterministic scoring and ranking for backlog orchestrator.
 *
 * Converts classifications into a sortable score and
 * resolves founder-fast-track and production-red overrides.
 */

/**
 * Score an issue classification deterministically.
 * Returns a numeric score between 0-100 and a breakdown.
 */
export function scoreIssue(classification) {
  const { category, mrrCategory, effort, mrrConfidence, relatedIssues } =
    classification;

  // Base score from category
  let base = 0;

  // Priority categories
  if (
    category === 'duplicate' ||
    category === 'superseded' ||
    category === 'obsolete'
  ) {
    return {
      score: 0,
      breakdown: { reason: 'not actionable', base: 0, adjustments: 0 },
    };
  }

  // MRR value
  const MRR_BASES = {
    'revenue-protection': 95,
    reliability: 75,
    paid: 70,
    activation: 55,
    throughput: 50,
    retention: 45,
    expansion: 40,
    acquisition: 35,
    unknown: 15,
  };
  base = MRR_BASES[mrrCategory] || 15;

  // Confidence adjustment
  const confAdj =
    mrrConfidence === 'high' ? 10 : mrrConfidence === 'medium' ? 3 : -5;

  // Effort penalty (inverted — smaller effort = better for ranking)
  const EFFORT_ADJ = {
    trivial: 10,
    small: 5,
    medium: 0,
    large: -15,
    unknown: -5,
  };
  const effortAdj = EFFORT_ADJ[effort] || -5;

  // Workstream bonus — bundled issues are cheaper to ship
  const wsBonus = classification.workstreamId ? 5 : 0;

  // Penality for many relations (might be messy/duplicate)
  const relationPenalty = Math.min(relatedIssues.length * 2, 10);

  const score = Math.max(
    0,
    Math.min(100, base + confAdj + effortAdj + wsBonus - relationPenalty)
  );

  return {
    score,
    breakdown: {
      base,
      confAdj,
      effortAdj,
      wsBonus,
      relationPenalty,
    },
  };
}

/**
 * Determine if production-red blocks admission.
 * Simple check via the existing health endpoint.
 */
export async function isProductionRed() {
  try {
    const resp = await fetch('https://jov.ie/api/health', {
      signal: AbortSignal.timeout(5000),
    });
    const data = /** @type {any} */ (await resp.json());
    return data.status !== 'ok';
  } catch {
    // If we can't check, assume safe (fail open for local)
    return false;
  }
}

/**
 * Count active shipping leases from the authoritative Linear state snapshot.
 *
 * A production version endpoint proves reachability, not whether Symphony has
 * an active shipment. The orchestrator already fetches the active Linear issue
 * set, so use its In Progress issues as the lease source instead.
 */
export function currentShippingLoad(activeIssues = []) {
  const count = activeIssues.filter(
    issue => (issue.state?.name || issue.state) === 'In Progress'
  ).length;
  return { healthy: true, count };
}
