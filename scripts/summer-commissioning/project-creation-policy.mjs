import {
  digestCanonicalJson,
  isRecord,
  requireIsoTimestamp,
  requireString,
} from './receipt-trust.mjs';

const PROPOSAL_SCHEMA = 'jovie.project-creation-proposal/v1';
const REVIEW_SCHEMA = 'jovie.project-creation-review/v1';
const MAX_REVIEW_AGE_MS = 15 * 60 * 1000;
const PROPOSAL_FIELDS = [
  'schema',
  'revision',
  'workId',
  'teamId',
  'projectName',
  'repository',
  'requesterId',
  'executorId',
  'ownerId',
  'contributors',
  'environment',
  'purpose',
  'existingProjectInsufficient',
  'previewInsufficient',
  'dependencies',
  'deploymentBoundary',
  'ownerAcceptanceRef',
  'controlsRef',
];
const CONTROL_FIELDS = [
  'ownerAccepted',
  'platformAllowed',
  'spendingAllowed',
  'dataAllowed',
  'permissionAllowed',
  'current',
];

function exactObject(value, fields, label) {
  if (
    !isRecord(value) ||
    Object.keys(value).some(key => !fields.includes(key)) ||
    fields.some(key => !Object.hasOwn(value, key))
  ) {
    throw new Error(`${label}: missing or unexpected fields`);
  }
}
function identifiers(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field}: array required`);
  value.forEach(item => requireString(item, field));
  if (new Set(value).size !== value.length)
    throw new Error(`${field}: duplicate identity`);
}
function validateProposal(proposal) {
  exactObject(proposal, PROPOSAL_FIELDS, 'proposal');
  if (proposal.schema !== PROPOSAL_SCHEMA)
    throw new Error('proposal schema mismatch');
  if (!Number.isSafeInteger(proposal.revision) || proposal.revision < 1)
    throw new Error('positive proposal revision required');
  for (const field of PROPOSAL_FIELDS.filter(
    field => !['revision', 'contributors', 'dependencies'].includes(field)
  )) {
    requireString(proposal[field], field);
  }
  if (
    !/^(JOV|LYB)-[1-9][0-9]*$/u.test(proposal.workId) ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(proposal.repository) ||
    !['production', 'staging', 'preview', 'shadow'].includes(
      proposal.environment
    )
  )
    throw new Error('invalid proposal scope');
  identifiers(proposal.contributors, 'contributors');
  identifiers(proposal.dependencies, 'dependencies');
}

/**
 * Pure source policy, never a project creator or a credential/permission grant.
 * Resolvers MUST be existing server-owned authenticated producer/authority paths,
 * not functions or "verified" flags supplied through a request. Canonical agent
 * identities (including aliases) must be resolved before this boundary. No live
 * resolver/creation adapter is installed by this module.
 */
export function evaluateProjectCreation(proposal, reviewRef, context) {
  validateProposal(proposal);
  requireString(reviewRef, 'review reference');
  if (!Number.isFinite(context?.nowMs))
    throw new Error('finite policy clock required');
  if (
    typeof context.resolveTrustedReview !== 'function' ||
    typeof context.evaluateExistingAuthority !== 'function'
  )
    throw new Error('existing trusted resolvers required');
  const snapshot = structuredClone(proposal);
  Object.freeze(snapshot.contributors);
  Object.freeze(snapshot.dependencies);
  Object.freeze(snapshot);
  const digest = digestCanonicalJson(snapshot);
  // Reuse the commissioning governor's immutable producer-attested receipt boundary.
  const entry = context.resolveTrustedReview(reviewRef);
  if (
    !isRecord(entry) ||
    entry.principalType !== 'agent' ||
    entry.immutable !== true ||
    entry.producerAttestation !== 'verified' ||
    !isRecord(entry.receipt) ||
    entry.digest !== digestCanonicalJson(entry.receipt)
  )
    throw new Error(
      'independent review must resolve from its trusted review producer'
    );
  const review = entry.receipt;
  exactObject(
    review,
    [
      'schema',
      'proposalDigest',
      'reviewerId',
      'verdict',
      'mode',
      'rationale',
      'reviewedAt',
      'expiresAt',
    ],
    'review'
  );
  if (review.schema !== REVIEW_SCHEMA)
    throw new Error('review schema mismatch');
  if (review.proposalDigest !== digest)
    throw new Error('review proposal digest mismatch');
  requireString(entry.principalId, 'trusted reviewer principal');
  if (review.reviewerId !== entry.principalId)
    throw new Error('review principal mismatch');
  if (
    [
      snapshot.requesterId,
      snapshot.executorId,
      snapshot.ownerId,
      ...snapshot.contributors,
    ].includes(entry.principalId)
  )
    throw new Error('review must be by a second independent agent');
  if (review.verdict !== 'approved' || review.mode !== 'adversarial')
    throw new Error('affirmative adversarial review required');
  requireString(review.rationale, 'review rationale');
  const reviewedAt = Date.parse(
    requireIsoTimestamp(review.reviewedAt, 'reviewedAt')
  );
  const expiresAt = Date.parse(
    requireIsoTimestamp(review.expiresAt, 'expiresAt')
  );
  if (
    reviewedAt > context.nowMs ||
    expiresAt <= context.nowMs ||
    expiresAt <= reviewedAt ||
    context.nowMs - reviewedAt > MAX_REVIEW_AGE_MS ||
    expiresAt - reviewedAt > MAX_REVIEW_AGE_MS
  )
    throw new Error('review outside bounded freshness window');
  // Review cannot waive platform, spending, data, permission or owner acceptance.
  const controls = context.evaluateExistingAuthority(snapshot);
  if (
    !isRecord(controls) ||
    controls.proposalDigest !== digest ||
    controls.ownerAcceptanceRef !== snapshot.ownerAcceptanceRef ||
    controls.controlsRef !== snapshot.controlsRef ||
    ['requesterId', 'executorId', 'ownerId'].some(
      field => controls[field] !== snapshot[field]
    ) ||
    digestCanonicalJson(controls.contributors) !==
      digestCanonicalJson(snapshot.contributors) ||
    CONTROL_FIELDS.some(field => controls[field] !== true)
  )
    throw new Error('current existing authority and accepted owner required');
  if (digestCanonicalJson(proposal) !== digest)
    throw new Error('proposal changed during evaluation');
  return {
    decision: 'approved-within-existing-authority',
    proposalDigest: digest,
    reviewRef,
    additionalFounderApprovalRequired: false,
    executed: false,
  };
}
