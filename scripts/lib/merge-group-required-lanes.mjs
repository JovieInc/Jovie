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
const requiredJobNames = Object.values(MERGE_GROUP_REQUIRED_LANES).map(
  name =>
    new RegExp(
      '^' +
        name
          .split(/\$\{\{[^}]+\}\}/u)
          .map(escapeRegExp)
          .join('.+') +
        '$',
      'u'
    )
);

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
