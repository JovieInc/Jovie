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

export function evaluateVerificationBoundary({
  localEvidence,
  remoteEvidence,
  publishedHead,
  liveHead,
}) {
  const publicationGreen = allGreen(PUBLICATION_GATES, localEvidence);
  const remoteGreen = allGreen(REMOTE_DRAFT_GATES, remoteEvidence);
  return {
    publicationGreen,
    draftCiGreen: remoteGreen,
    promotionGreen:
      publicationGreen && remoteGreen && publishedHead === liveHead,
  };
}
