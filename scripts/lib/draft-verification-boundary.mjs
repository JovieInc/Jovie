export const PUBLICATION_GATES = Object.freeze([
  'committedDiffIntegrity',
  'worktreeIntegrity',
  'changedFileSecrets',
  'branchOwnershipMetadata',
  'hookPolicyConfig',
]);

export const REMOTE_DRAFT_GATES = Object.freeze([
  'typecheck',
  'lint',
  'affectedTests',
  'coverage',
  'security',
  'policy',
]);

const allGreen = (names, evidence) =>
  names.every(name => evidence?.[name] === 'success');

/**
 * Publication is a feedback start. Promotion still requires every broad remote
 * gate on the live exact head.
 *
 * @param {object} input
 * @param {Record<string, string>} [input.localEvidence]
 * @param {Record<string, string>} [input.remoteEvidence]
 * @param {string} [input.publishedHead]
 * @param {string} [input.liveHead]
 */
export function evaluateVerificationBoundary({
  localEvidence,
  remoteEvidence,
  publishedHead,
  liveHead,
} = {}) {
  const publicationGreen = allGreen(PUBLICATION_GATES, localEvidence);
  const remoteGreen = allGreen(REMOTE_DRAFT_GATES, remoteEvidence);
  return {
    publicationGreen,
    draftCiGreen: remoteGreen,
    promotionGreen:
      publicationGreen && remoteGreen && publishedHead === liveHead,
  };
}

/**
 * Sourcing decision reference for affected work (JOV-6212 / JOV-INV-035).
 *
 * A changed capability classified as a commodity mechanism carries a sourcing
 * decision reference binding the receipt to the exact head it was decided on.
 * Research-ready work (a bounded research task to obtain missing sourcing
 * evidence) is distinct from implementation-ready work (the sourcing decision
 * is present and head-current). Missing evidence produces the bounded
 * research task — it never deadlocks implementation of independent work.
 */
export const SOURCING_READY_STATES = Object.freeze([
  'implementation-ready',
  'research-ready',
]);

/**
 * Classify sourcing readiness for one changed capability and revalidate the
 * decision against the exact head (JOV-6212). The receipt binds repository
 * and head; a decision made on a different head is stale and must be renewed,
 * not carried forward.
 *
 * @param {object} input
 * @param {string | null | undefined} [input.sourcingDecisionReference]
 * @param {string} [input.repository]
 * @param {string} [input.headSha]
 * @param {string} [input.liveHead]
 * @param {boolean} [input.commodityCapability]
 */
export function evaluateSourcingReadiness({
  sourcingDecisionReference,
  repository,
  headSha,
  liveHead,
  commodityCapability = true,
} = {}) {
  if (!commodityCapability) {
    return {
      state: 'implementation-ready',
      commodityCapability: false,
      sourcingDecisionReference: null,
      revalidatedHead: null,
      requiresResearchTask: false,
      reason: 'not-a-commodity-capability',
    };
  }
  const reference = parseSourcingReference(sourcingDecisionReference);
  if (!reference) {
    return {
      state: 'research-ready',
      commodityCapability: true,
      sourcingDecisionReference: null,
      revalidatedHead: null,
      requiresResearchTask: true,
      reason: 'sourcing-decision-missing',
    };
  }
  if (!/^[0-9a-f]{40}$/i.test(headSha ?? '')) {
    return {
      state: 'research-ready',
      commodityCapability: true,
      sourcingDecisionReference: reference,
      revalidatedHead: null,
      requiresResearchTask: true,
      reason: 'sourcing-decision-head-unbound',
    };
  }
  if (
    repository &&
    reference.repository &&
    reference.repository !== repository
  ) {
    return {
      state: 'research-ready',
      commodityCapability: true,
      sourcingDecisionReference: reference,
      revalidatedHead: null,
      requiresResearchTask: true,
      reason: 'sourcing-decision-repository-mismatch',
    };
  }
  const liveHeadToCheck = liveHead ?? headSha;
  if (headSha !== liveHeadToCheck) {
    return {
      state: 'research-ready',
      commodityCapability: true,
      sourcingDecisionReference: reference,
      revalidatedHead: liveHeadToCheck,
      requiresResearchTask: true,
      reason: 'sourcing-decision-stale-head',
    };
  }
  return {
    state: 'implementation-ready',
    commodityCapability: true,
    sourcingDecisionReference: reference,
    revalidatedHead: headSha,
    requiresResearchTask: false,
    reason: 'sourcing-decision-current',
  };
}

function parseSourcingReference(reference) {
  if (!reference || typeof reference !== 'object') return null;
  if (typeof reference.headSha !== 'string') return null;
  return {
    repository:
      typeof reference.repository === 'string' ? reference.repository : null,
    headSha: reference.headSha,
  };
}
