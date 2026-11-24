import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const WORKFLOW = readFileSync(
  resolve(REPO_ROOT, '.github/workflows/ci.yml'),
  'utf8'
);

// Frozen from origin/main 342da40599: required identities and runner policy.
const BASELINE_RUNNER_GROUPS = [
  {
    labels: 'ubuntu-24.04',
    jobs: [
      'runner-image-offline-proof',
      'ci-path-changes',
      'ci-pen-diff',
      'ci-visual-snapshot-compare',
      'ci-visual-snapshot-homepage',
      'ci-visual-marketing-dom',
      'ci-visual-marketing-routes',
      'ci-fast-remaining',
      'ci-profile-admission-browser',
      'ci-fast-structural-web',
      'ci-fast-structural-lanes',
      'ci-build-layout',
      'ci-storybook-surfaces',
      'ci-layout-guard',
      'ci-mobile-overflow',
      'ci-lighthouse-pr',
      'ci-lighthouse-dashboard-pr',
      'ci-lighthouse-onboarding-pr',
      'ci-lighthouse-admin-pr',
      'ci-lighthouse-chat-pr',
      'ci-unit-tests',
      'ci-a11y',
      'ci-a11y-authed',
      'ci-e2e-smoke',
      'ci-golden-path',
      'ci-admin-smoke',
      'ci-e2e-tests',
      'ci-merge-suite-scope',
      'ci-slop-guard',
      'ci-smoke-required',
    ],
  },
  {
    labels: [
      'self-hosted',
      'Linux',
      'X64',
      "${{ 'jovie-runner-image-canary' }}",
    ],
    jobs: ['runner-image-canary'],
  },
  {
    labels: 'ubuntu-latest',
    jobs: [
      'ci-merge-group-workspace',
      'main-queue-provenance',
      'ci-unit-runner-route',
      'ci-lockfile-preflight',
      'ci-risk-classifier',
      'ci-env-example-guard',
      'ci-secret-scan',
      'ci-golden-path-lock',
      'ci-fast-typecheck',
      'ci-fast',
      'ci-promptfoo-evals',
      'ci-golden-eval-set',
      'ci-fast-structural-python',
      'ci-knip',
      'neon-db',
      'drizzle-migration-guard',
      'ci-drizzle-check',
      'ci-integration-ready',
      'ci-build-ovie',
      'ci-typecheck-ovie',
      'ci-cross-product-integration',
      'ci-product-lane-receipt',
      'ci-build-public',
      'ci-pr-neon-migrate',
      'ci-blog-content',
      'ci-exact-head-coverage-shard',
      'ci-exact-head-coverage',
      'ci-golden-path-report',
      'ci-e2e-migrate',
      'ci-test-performance',
      'ci-pr-vercel-preview',
      'ci-pr-ready',
      'ci-summary',
      'security-gate',
      'main-release-ready',
    ],
  },
  {
    labels:
      '${{ vars.MERGE_GATE_POOL == \'fixed\' && fromJSON(\'["self-hosted","Linux","X64","jovie-fixed"]\') || \'ubuntu-latest\' }}',
    jobs: [
      'ci-merge-group-admission',
      'ci-merge-group-supersede',
      'ci-merge-group-ready',
    ],
  },
];
const BASELINE_REQUIRED_NAMES = {
  'ci-fast': 'ci-fast',
  'ci-fast-structural-lanes': 'ci-fast (structural lanes)',
  'ci-fast-remaining': 'ci-fast (remaining)',
  'ci-fast-typecheck': 'ci-fast (typecheck)',
  'ci-storybook-surfaces': 'Storybook Surface Matrix (combined)',
  'ci-product-lane-receipt': 'Product Lane Receipt',
  'ci-pr-ready':
    "${{ github.event_name == 'pull_request' && 'PR Ready' || 'PR Ready (source inactive)' }}",
  'ci-merge-group-ready':
    "${{ github.event_name == 'merge_group' && 'PR Ready' || 'PR Ready (merge-group inactive)' }}",
  'ci-merge-suite-scope': 'Merge Suite Scope / full_web_units',
  'ci-path-changes': 'Path Changes',
  'ci-unit-tests': 'Unit Tests (${{ matrix.shard }})',
  'ci-exact-head-coverage': 'Exact-head Coverage',
};
const BASELINE_AGGREGATOR_NEEDS = {
  'ci-fast': [
    'ci-path-changes',
    'ci-merge-group-admission',
    'ci-fast-typecheck',
    'ci-fast-remaining',
    'ci-profile-admission-browser',
    'ci-fast-structural-python',
    'ci-fast-structural-web',
    'ci-fast-structural-lanes',
  ],
  'ci-pr-ready': [
    'ci-path-changes',
    'ci-risk-classifier',
    'ci-fast',
    'ci-blog-content',
    'ci-exact-head-coverage',
    'ci-secret-scan',
    'ci-golden-path-lock',
    'ci-visual-snapshot-compare',
    'ci-visual-snapshot-homepage',
    'ci-visual-marketing-dom',
    'ci-visual-marketing-routes',
    'ci-pen-diff',
    'ci-slop-guard',
  ],
  'ci-merge-group-ready': [
    'ci-path-changes',
    'ci-merge-group-admission',
    'ci-risk-classifier',
    'ci-fast',
    'ci-blog-content',
    'ci-unit-tests',
    'ci-exact-head-coverage',
    'ci-build-layout',
    'ci-build-ovie',
    'ci-typecheck-ovie',
    'ci-ios',
    'ci-macos',
    'ci-cross-product-integration',
    'ci-product-lane-receipt',
    'ci-promptfoo-evals',
    'ci-golden-eval-set',
    'ci-secret-scan',
    'ci-golden-path-lock',
    'ci-visual-snapshot-compare',
    'ci-visual-snapshot-homepage',
    'ci-visual-marketing-dom',
    'ci-visual-marketing-routes',
    'drizzle-migration-guard',
    'neon-db',
  ],
  'ci-product-lane-receipt': [
    'ci-path-changes',
    'ci-merge-group-admission',
    'ci-risk-classifier',
    'ci-fast',
    'ci-blog-content',
    'ci-unit-tests',
    'ci-build-layout',
    'ci-build-ovie',
    'ci-typecheck-ovie',
    'ci-ios',
    'ci-macos',
    'ci-cross-product-integration',
  ],
  'ci-merge-suite-scope': [
    'ci-path-changes',
    'ci-unit-tests',
    'ci-merge-group-ready',
  ],
};

describe('merge-queue critical-path compatibility', () => {
  const jobs = /** @type {{ jobs: Record<string, any> }} */ (loadYaml(WORKFLOW))
    .jobs;
  it('preserves every existing runner label and required check identity', () => {
    for (const { labels, jobs: ids } of BASELINE_RUNNER_GROUPS) {
      for (const id of ids) expect(jobs[id]['runs-on'], id).toEqual(labels);
    }
    const allowed = new Set(
      BASELINE_RUNNER_GROUPS.map(({ labels }) => JSON.stringify(labels))
    );
    for (const [id, job] of Object.entries(jobs)) {
      if (job['runs-on'] !== undefined)
        expect(allowed.has(JSON.stringify(job['runs-on'])), id).toBe(true);
    }
    for (const [id, name] of Object.entries(BASELINE_REQUIRED_NAMES)) {
      expect(jobs[id].name, id).toBe(name);
    }
    expect(jobs['ci-unit-tests'].strategy.matrix.shard).toEqual([
      ...Array.from({ length: 14 }, (_, index) => index + 1 + '/14'),
      'packages/ui',
    ]);
  });
  it('preserves the named checks read by every protected aggregate', () => {
    for (const [id, needs] of Object.entries(BASELINE_AGGREGATOR_NEEDS)) {
      expect(jobs[id].needs, id).toEqual(needs);
    }
  });
});
