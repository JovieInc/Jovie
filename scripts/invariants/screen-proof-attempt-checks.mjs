/**
 * Named trust checks for one screen-proof producer attempt. The resolver
 * accepts an attempt only when every check passes; when it rejects one, the
 * failed names go into the finding so a red certification says which
 * condition failed instead of a generic "not trusted" line.
 *
 * @param {object} input
 * @returns {{ identityTrusted: boolean, failed: string[] }}
 */
export function producerAttemptChecks({
  artifact,
  workflowRun,
  runId,
  attempt,
  artifactId,
  headSha,
  trustedName,
  digestReady,
  completedRun,
  downstreamCertificationRun,
  sameRun,
  job,
  producer,
  validId,
}) {
  const identity = {
    'run id': validId(runId),
    'run attempt': validId(attempt),
    'artifact id': artifact.id === artifactId,
    'artifact name': Boolean(trustedName),
    'artifact unexpired': !artifact.expired,
    repository: workflowRun.repository?.full_name === producer.repository,
    'branch main': workflowRun.head_branch === 'main',
    'head sha': workflowRun.head_sha?.toLowerCase() === headSha.toLowerCase(),
    'workflow path': workflowRun.path === producer.workflow,
    'trigger event': ['push', 'workflow_dispatch'].includes(workflowRun.event),
  };
  const runState = `run state (${String(workflowRun.status)} ${String(
    workflowRun.conclusion ?? 'unfinished'
  )}, same run ${sameRun})`;
  const checks = {
    ...identity,
    'artifact digest': digestReady,
    [runState]: completedRun || downstreamCertificationRun,
    'one producer job': job.length === 1,
    'producer job id': job.length === 1 && validId(job[0].id),
    'producer job success': job.length === 1 && job[0].conclusion === 'success',
  };
  return {
    identityTrusted: Object.values(identity).every(Boolean),
    failed: Object.keys(checks).filter(name => !checks[name]),
  };
}
