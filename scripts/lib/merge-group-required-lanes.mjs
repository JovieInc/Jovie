import { MERGE_GROUP_FAILURE_CONCLUSIONS } from './merge-queue-guard.mjs';

export const CI_WORKFLOW_ID = 178737329;

// ci-merge-group-ready.needs is authoritative. The fail-fast contract pins both
// these IDs and their REST job names to ci.yml, including matrix job names.
// Keep this free of package dependencies for the trusted sparse checkout.
export const MERGE_GROUP_REQUIRED_LANES = Object.freeze({
  'ci-path-changes': 'Path Changes',
  'ci-merge-group-admission': 'Merge Group Admission',
  'ci-risk-classifier': 'CI Risk Classifier',
  'ci-fast': 'ci-fast',
  'ci-blog-content': 'Blog Content Qualification',
  'ci-unit-tests': 'Unit Tests (${{ matrix.shard }})',
  'ci-exact-head-coverage': 'Exact-head Coverage',
  'ci-build-layout': 'Build + Layout (combined)',
  'ci-build-ovie': 'Ovie Build (combined)',
  'ci-typecheck-ovie': 'Ovie Typecheck (combined)',
  'ci-storybook-surfaces': 'Storybook Surface Matrix (combined)',
  'ci-ios': 'iOS Fast Unit + Coverage (combined)',
  'ci-macos': 'Mac Build + Test (combined)',
  'ci-cross-product-integration': 'Cross-Product Integration (combined)',
  'ci-product-lane-receipt': 'Product Lane Receipt',
  'ci-promptfoo-evals': 'Promptfoo Evals (deterministic)',
  'ci-golden-eval-set': 'Golden Eval Set (deterministic)',
  'ci-secret-scan': 'Secret Scan (gitleaks + trufflehog)',
  'ci-golden-path-lock': 'Golden Path Lock',
  'ci-visual-snapshot-compare': 'Visual Snapshot Compare',
  'ci-visual-snapshot-homepage': 'Visual Snapshot Compare (homepage)',
  'ci-visual-marketing-dom': 'Visual Snapshot Compare (marketing DOM)',
  'ci-visual-marketing-routes': 'Visual Snapshot Compare (marketing routes)',
  'drizzle-migration-guard': 'Migration Guard',
  'neon-db': 'Database Certification (isolated Neon)',
  'ci-lighthouse-dashboard-pr': 'Lighthouse (dashboard gate)',
  'ci-lighthouse-onboarding-pr': 'Lighthouse (onboarding gate)',
});

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
// Exact names, matrix templates, and an optional " (shard)" suffix so a later
// PR can shard the same job id (JOV-13072 storybook legs) without a miss.
const requiredJobNames = Object.values(MERGE_GROUP_REQUIRED_LANES).map(name => {
  const body = name
    .split(/\$\{\{[^}]+\}\}/u)
    .map(escapeRegExp)
    .join('.+');
  const suffix = name.includes('${{ matrix.shard }}') ? '' : '(?: \\(.+\\))?';
  return new RegExp('^' + body + suffix + '$', 'u');
});

export function failedRequiredMergeGroupJobs(jobs = []) {
  return jobs.filter(
    job =>
      job?.status === 'completed' &&
      job.conclusion === 'failure' &&
      requiredJobNames.some(name => name.test(job.name ?? ''))
  );
}

// Supersession alone proves nothing about the source. Keep cancellation out
// of the generic failure set and require a completed required CI failure.
export function shouldHoldMergeGroupRun(run, jobs = []) {
  return (
    MERGE_GROUP_FAILURE_CONCLUSIONS.has(run?.conclusion) ||
    (run?.conclusion === 'cancelled' &&
      run.workflow_id === CI_WORKFLOW_ID &&
      failedRequiredMergeGroupJobs(jobs).length > 0)
  );
}

function failedStepsFromJobs(jobs) {
  return jobs.flatMap(job =>
    (job.steps ?? [])
      .filter(step => step?.conclusion === 'failure')
      .map(step => step.name)
  );
}

export function failedStepsForHold(run, jobs = []) {
  const evidenceJobs =
    run?.conclusion === 'cancelled' ? failedRequiredMergeGroupJobs(jobs) : jobs;
  return failedStepsFromJobs(evidenceJobs);
}

export function holdJobsUrl(repository, run) {
  return run.conclusion === 'cancelled'
    ? `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`
    : `repos/${repository}/actions/runs/${run.id}/jobs?filter=latest`;
}

export function holdClassification(conclusion) {
  return conclusion === 'cancelled' ? 'failure' : conclusion;
}

export function cancelledWithoutRequiredLaneFailure(run) {
  return {
    skipped: true,
    reason: 'cancelled-without-required-lane-failure',
    workflowRunId: run.id,
  };
}

export function isMergeGroupHoldConclusion(conclusion) {
  return (
    MERGE_GROUP_FAILURE_CONCLUSIONS.has(conclusion) ||
    conclusion === 'cancelled'
  );
}

export function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function admitHoldFailure(run, jobs = [], failedSteps) {
  if (!shouldHoldMergeGroupRun(run, jobs)) {
    return { skip: cancelledWithoutRequiredLaneFailure(run) };
  }
  return {
    failedSteps:
      run?.conclusion === 'cancelled' || failedSteps === undefined
        ? failedStepsForHold(run, jobs)
        : failedSteps,
    conclusion: holdClassification(run.conclusion),
  };
}
