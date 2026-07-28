/**
 * Admission control for backlog orchestrator.
 *
 * Determines how many items to admit and the handoff mechanism to Gem shippers.
 */

import { isProductionRed, scoreIssue } from './scorer.mjs';

export const MAX_CONCURRENT_SHIPPING = 1; // v0: one item at a time

const FOUNDER_FAST_TRACK_LABEL = 'founder-fast-track';

/**
 * Determine the next item(s) to admit into To Do.
 *
 * @param {object} classifications
 * @param {object} workstreams
 * @param {object} state - current shipping state
 * @returns {Promise<{ admit: Array, reason: string }>}
 */
export async function selectNextToAdmit(
  classifications,
  workstreams,
  state = {}
) {
  const prodRed = await isProductionRed();

  // Check for founder fast-track
  const fastTracked = classifications.filter(
    c =>
      c.labels?.includes?.(FOUNDER_FAST_TRACK_LABEL) &&
      c.category !== 'duplicate'
  );

  if (fastTracked.length > 0 && !prodRed) {
    // Score and pick highest
    const scored = fastTracked.map(c => ({ c, ...scoreIssue(c) }));
    scored.sort((a, b) => b.score - a.score);
    return {
      admit: [scored[0].c],
      reason: `founder-fast-track: ${scored[0].c.identifier}`,
    };
  }

  // If production is red, only admit production/reliability items
  if (prodRed) {
    const remediation = classifications.filter(
      c =>
        c.mrrCategory === 'reliability' ||
        c.mrrCategory === 'revenue-protection'
    );
    if (remediation.length > 0) {
      const scored = remediation.map(c => ({ c, ...scoreIssue(c) }));
      scored.sort((a, b) => b.score - a.score);
      return {
        admit: [scored[0].c],
        reason: `prod-red remediation priority: ${scored[0].c.identifier}`,
      };
    }
    return {
      admit: [],
      reason: 'production is red — blocking all non-remediation work',
    };
  }

  // Check current load
  const capacity = MAX_CONCURRENT_SHIPPING - (state.currentlyShipping || 0);
  if (capacity <= 0) {
    return {
      admit: [],
      reason: `at capacity (${state.currentlyShipping}/${MAX_CONCURRENT_SHIPPING})`,
    };
  }

  // Score all triageable workstreams and issues
  const candidates = [];

  for (const ws of workstreams) {
    // Use the max score of member issues
    const memberScores = ws.issueIds
      .map(id => classifications.find(c => c.identifier === id))
      .filter(Boolean)
      .map(c => scoreIssue(c).score);
    candidates.push({
      id: ws.id,
      name: ws.name,
      score: Math.max(...memberScores, 0),
      type: 'workstream',
      items: ws.issueIds,
    });
  }

  // Add individual issues not in workstreams
  const inWorkstreams = new Set(workstreams.flatMap(ws => ws.issueIds));
  for (const c of classifications) {
    if (!inWorkstreams.has(c.identifier) && c.category === 'triageable') {
      candidates.push({
        id: c.identifier,
        name: c.title,
        score: scoreIssue(c).score,
        type: 'issue',
        items: [c.identifier],
      });
    }
  }

  if (candidates.length === 0) {
    return { admit: [], reason: 'no eligible candidates' };
  }

  candidates.sort((a, b) => b.score - a.score);

  return {
    admit: [candidates[0]],
    reason: `admitted: ${candidates[0].name} (score ${candidates[0].score})`,
  };
}
