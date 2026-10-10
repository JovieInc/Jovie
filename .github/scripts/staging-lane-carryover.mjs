import {
  collectProductionGitRange,
  planProductionLaneRange,
  resolveHistoricalLaneEvidence,
} from '../../scripts/lib/production-lane-range.mjs';

// A coalesced main push can select only Mac/operations although an earlier,
// merge-group-qualified Web change has never reached staging. Keep the sealed
// current CI routing honest; stage the cumulative Web delta at current main.
export function resolveStagingCarryover({
  repository,
  expectedSha,
  sourceCiRunId,
  currentReceipt,
  identity,
  collectRange = collectProductionGitRange,
  resolveEvidence = resolveHistoricalLaneEvidence,
}) {
  if (
    repository !== 'JovieInc/Jovie' ||
    !/^[a-f0-9]{40}$/.test(expectedSha) ||
    !/^[1-9][0-9]*$/.test(sourceCiRunId) ||
    currentReceipt?.provenance?.sha !== expectedSha ||
    currentReceipt?.releaseRouting?.sourceMainRunId !== sourceCiRunId ||
    currentReceipt?.aggregatePassed !== true ||
    !Array.isArray(currentReceipt?.selectedLanes) ||
    currentReceipt.selectedLanes.some(lane => typeof lane !== 'string') ||
    currentReceipt.selectedLanes.includes('web')
  )
    throw new Error(
      'staging carryover requires exact successful non-Web main CI evidence'
    );
  if (
    !/^[a-f0-9]{40}$/.test(identity?.commitSha) ||
    !/^dpl_[A-Za-z0-9]+$/.test(identity?.deploymentId) ||
    identity?.environment !== 'preview'
  )
    throw new Error('canonical staging identity is malformed');
  const base = {
    stagingSha: identity.commitSha,
    deploymentId: identity.deploymentId,
  };
  if (identity.commitSha === expectedSha)
    return { ...base, outcome: 'not_applicable' };
  const plan = planProductionLaneRange({
    deployedSha: identity.commitSha,
    currentSha: expectedSha,
    ...collectRange(identity.commitSha, expectedSha),
  });
  if (!plan.selectedLanes.includes('web'))
    return { ...base, outcome: 'not_applicable' };
  const webEvidence = resolveEvidence({
    repository,
    sha: plan.webEvidenceSha,
    lane: 'web',
  });
  return { ...base, outcome: 'proceed', webEvidence };
}
