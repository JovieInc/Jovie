import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  evaluateIsolatedUiDocsDelta,
  validateFleetGateFreshness,
} from '../isolated-ui-docs-policy.mjs';

const BASE = '1'.repeat(40);
const HEAD = '2'.repeat(40);
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');

function fleetGate(overrides = {}) {
  return {
    schema: 'jovie-fleet-gate/v1',
    observedAt: '2026-08-11T03:00:00.000Z',
    state: 'AMBER',
    signals: {
      main: { status: 'green', sha: BASE },
      production: { status: 'red' },
      controller: { status: 'green' },
      integrity: { status: 'clear' },
      queue: { status: 'known', eligiblePrs: 0, target: 5 },
    },
    isolatedPromotionAdmission: {
      allowed: true,
      deploymentsAllowed: false,
    },
    ...overrides,
  };
}

function greenChecks() {
  return ['PR Ready', 'Migration Guard', 'Fork PR Gate', 'PR Size Guard'].map(
    name => ({ name, state: 'SUCCESS', bucket: 'pass' })
  );
}

function body() {
  return [
    '## Isolated UI/docs evidence',
    'Before: ![before](https://example.com/before.png)',
    'After: ![after](https://example.com/after.png)',
    'Checks: typecheck; Biome; focused test with Vitest.',
  ].join('\n');
}

function atomFiles() {
  return [
    {
      filename: 'packages/ui/atoms/Badge.tsx',
      status: 'modified',
      sha: 'a'.repeat(40),
      additions: 2,
      deletions: 1,
      changes: 3,
      patch:
        '@@ -1 +1,2 @@\n-export const x=1\n+export const x=2\n+export const y=3',
      content:
        "import type { ReactNode } from 'react';\nexport function Badge({ children }) { return <span>{children}</span>; }",
    },
    {
      filename: 'packages/ui/atoms/Badge.test.tsx',
      status: 'added',
      sha: 'b'.repeat(40),
      additions: 8,
      deletions: 0,
      changes: 8,
      patch: '@@ -0,0 +1,8 @@\n+test()',
      content:
        "import { Badge } from './Badge';\ntest('renders', () => Badge);",
    },
  ];
}

describe('isolated UI/docs promotion policy', () => {
  it('allows an exact-head atom delta only with additive tests, evidence, and required checks', () => {
    const result = evaluateIsolatedUiDocsDelta({
      prNumber: 15810,
      baseSha: BASE,
      headSha: HEAD,
      body: body(),
      files: atomFiles(),
      checks: greenChecks(),
      fleetGate: fleetGate(),
    });

    expect(result.allowed).toBe(true);
    expect(result.authority.labelsUsed).toBe(false);
    expect(result.authority.deploymentAllowed).toBe(false);
    expect(result.pinned).toMatchObject({
      baseSha: BASE,
      headSha: HEAD,
      diffSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('allows rendered docs without pretending visual component tests ran', () => {
    const result = evaluateIsolatedUiDocsDelta({
      prNumber: 15811,
      baseSha: BASE,
      headSha: HEAD,
      body: '## Isolated UI/docs evidence\nDocs proof: https://example.com/rendered-docs',
      files: [
        {
          filename: 'docs/design-system/buttons.md',
          status: 'modified',
          sha: 'c'.repeat(40),
          additions: 4,
          deletions: 1,
          changes: 5,
          patch: '@@ -1 +1 @@',
        },
      ],
      checks: greenChecks(),
      fleetGate: fleetGate(),
    });

    expect(result.allowed).toBe(true);
    expect(result.evidence.mode).toBe('docs');
  });

  it.each([
    [
      'main red',
      fleetGate({
        signals: { ...fleetGate().signals, main: { status: 'red', sha: BASE } },
      }),
      'main is not explicitly green',
    ],
    [
      'production unknown',
      fleetGate({
        signals: { ...fleetGate().signals, production: { status: 'unknown' } },
      }),
      'production is not explicitly red',
    ],
    [
      'integrity unknown',
      fleetGate({
        signals: { ...fleetGate().signals, integrity: { status: 'unknown' } },
      }),
      'integrity is not explicitly clear',
    ],
    [
      'global authority absent',
      fleetGate({ isolatedPromotionAdmission: { allowed: false } }),
      'fleet gate does not authorize isolated promotion',
    ],
  ])('fails closed when %s', (_name, gate, blocker) => {
    const result = evaluateIsolatedUiDocsDelta({
      prNumber: 15812,
      baseSha: BASE,
      headSha: HEAD,
      body: body(),
      files: atomFiles(),
      checks: greenChecks(),
      fleetGate: gate,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain(blocker);
  });

  it('rejects path-only UI claims and semantic business/runtime access', () => {
    const result = evaluateIsolatedUiDocsDelta({
      prNumber: 15813,
      baseSha: BASE,
      headSha: HEAD,
      body: body(),
      files: [
        {
          filename: 'apps/web/components/atoms/AccountBadge.tsx',
          status: 'modified',
          sha: 'd'.repeat(40),
          additions: 3,
          deletions: 1,
          changes: 4,
          patch: '@@ -1 +1 @@',
          content:
            "import { useQuery } from '@/lib/data/account';\nexport const AccountBadge = () => useQuery();",
        },
        atomFiles()[1],
      ],
      checks: greenChecks(),
      fleetGate: fleetGate(),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers.join('\n')).toMatch(
      /data, database|data mutation\/query hook/
    );
  });

  it('uses a positive presentation import boundary, not an incomplete deny list', () => {
    const files = atomFiles();
    files[0] = {
      ...files[0],
      content:
        "import { flag } from '@/lib/feature-flags';\nexport const Badge = () => <span>{flag}</span>;",
    };
    const result = evaluateIsolatedUiDocsDelta({
      prNumber: 15816,
      baseSha: BASE,
      headSha: HEAD,
      body: body(),
      files,
      checks: greenChecks(),
      fleetGate: fleetGate(),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain(
      'packages/ui/atoms/Badge.tsx: import @/lib/feature-flags is not presentation-only'
    );
  });

  it('rejects relative imports that escape the pinned presentation delta', () => {
    const files = atomFiles();
    files[0] = {
      ...files[0],
      content:
        "import { closeLinearIssue } from './../../lib/close-linear-issue';\nexport const Badge = () => <span>{closeLinearIssue}</span>;",
    };
    const result = evaluateIsolatedUiDocsDelta({
      prNumber: 15816,
      baseSha: BASE,
      headSha: HEAD,
      body: body(),
      files,
      checks: greenChecks(),
      fleetGate: fleetGate(),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain(
      'packages/ui/atoms/Badge.tsx: import ./../../lib/close-linear-issue is not presentation-only'
    );
  });

  it('rejects comment-separated imports that escape the pinned delta', () => {
    const files = atomFiles();
    files[0] = {
      ...files[0],
      content:
        "import /* pinned-closure-bypass */ '../../../apps/web/app/actions/spotify.ts';\nexport const Badge = () => <span />;",
    };
    const result = evaluateIsolatedUiDocsDelta({
      prNumber: 15817,
      baseSha: BASE,
      headSha: HEAD,
      body: body(),
      files,
      checks: greenChecks(),
      fleetGate: fleetGate(),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain(
      'packages/ui/atoms/Badge.tsx: import ../../../apps/web/app/actions/spotify.ts is not presentation-only'
    );
  });

  it('rejects alias imports that traverse outside the pinned atom closure', () => {
    const files = atomFiles();
    files[0] = {
      ...files[0],
      filename: 'apps/web/components/atoms/AccountBadge.tsx',
      content:
        "import { closeLinearIssue } from '@/components/atoms/../../lib/hud/linear-actions';\nexport const AccountBadge = () => <span>{closeLinearIssue}</span>;",
    };
    const result = evaluateIsolatedUiDocsDelta({
      prNumber: 15818,
      baseSha: BASE,
      headSha: HEAD,
      body: body(),
      files,
      checks: greenChecks(),
      fleetGate: fleetGate(),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain(
      'apps/web/components/atoms/AccountBadge.tsx: import @/components/atoms/../../lib/hud/linear-actions is not presentation-only'
    );
  });

  it('rejects executable docs/assets and remote or executable CSS', () => {
    const result = evaluateIsolatedUiDocsDelta({
      prNumber: 15817,
      baseSha: BASE,
      headSha: HEAD,
      body: body(),
      files: [
        {
          filename: 'docs/policy.mdx',
          status: 'modified',
          sha: 'd'.repeat(40),
          additions: 1,
          deletions: 1,
          changes: 2,
          patch: '@@ -1 +1 @@',
        },
        {
          filename: 'apps/web/public/runtime.svg',
          status: 'added',
          sha: 'e'.repeat(40),
          additions: 1,
          deletions: 0,
          changes: 1,
          patch: '@@ -0,0 +1 @@',
        },
        {
          filename: 'packages/ui/atoms/badge.css',
          status: 'modified',
          sha: 'f'.repeat(40),
          additions: 1,
          deletions: 0,
          changes: 1,
          patch: '@@ -0,0 +1 @@',
          content: '@import url("https://example.com/theme.css");',
        },
        {
          filename: 'packages/ui/atoms/badge-protocol-relative.css',
          status: 'modified',
          sha: '0'.repeat(40),
          additions: 1,
          deletions: 0,
          changes: 1,
          patch: '@@ -0,0 +1 @@',
          content: 'background-image: url("//cdn.example.com/badge.png");',
        },
        atomFiles()[1],
      ],
      checks: greenChecks(),
      fleetGate: fleetGate(),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'docs/policy.mdx: not in the isolated UI/docs allowlist',
        'apps/web/public/runtime.svg: not in the isolated UI/docs allowlist',
        'packages/ui/atoms/badge.css: contains remote or executable CSS import',
        'packages/ui/atoms/badge-protocol-relative.css: contains remote or executable CSS import',
      ])
    );
  });

  it('rejects modified tests that remove or rewrite existing assertions', () => {
    const files = atomFiles();
    files[1] = {
      ...files[1],
      status: 'modified',
      patch: '@@ -1 +1 @@\n-expect(old)\n+expect(new)',
    };
    const result = evaluateIsolatedUiDocsDelta({
      prNumber: 15814,
      baseSha: BASE,
      headSha: HEAD,
      body: body(),
      files,
      checks: greenChecks(),
      fleetGate: fleetGate(),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain(
      'packages/ui/atoms/Badge.test.tsx: test changes must be additive with no removed lines'
    );
  });

  it('rejects missing or non-successful exact-head required checks', () => {
    const checks = greenChecks().filter(
      check => check.name !== 'Migration Guard'
    );
    checks.find(check => check.name === 'PR Ready').state = 'FAILURE';
    checks.find(check => check.name === 'PR Ready').bucket = 'fail';
    const result = evaluateIsolatedUiDocsDelta({
      prNumber: 15815,
      baseSha: BASE,
      headSha: HEAD,
      body: body(),
      files: atomFiles(),
      checks,
      fleetGate: fleetGate(),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        'Migration Guard (missing)',
        'PR Ready (not successful)',
      ])
    );
  });

  it('rejects a terminal duplicate even when an older required check succeeded', () => {
    const checks = greenChecks();
    checks.push({ name: 'PR Ready', state: 'FAILURE', bucket: 'fail' });
    const result = evaluateIsolatedUiDocsDelta({
      prNumber: 15818,
      baseSha: BASE,
      headSha: HEAD,
      body: body(),
      files: atomFiles(),
      checks,
      fleetGate: fleetGate(),
    });

    expect(result.allowed).toBe(false);
    expect(result.blockers).toContain('PR Ready (not successful)');
  });

  it('requires a fresh fleet receipt', () => {
    expect(
      validateFleetGateFreshness(fleetGate(), {
        now: '2026-08-11T03:09:59.000Z',
      })
    ).toBe(true);
    expect(
      validateFleetGateFreshness(fleetGate(), {
        now: '2026-08-11T03:10:01.000Z',
      })
    ).toBe(false);
  });

  it('keeps one native controller, freezes deploy, and never treats labels as authority', () => {
    const queueWorkflow = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/merge-queue-autoenroll.yml'),
      'utf8'
    );
    const productionWorkflow = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/production-controller.yml'),
      'utf8'
    );
    const drain = readFileSync(
      resolve(REPO_ROOT, 'scripts/drain-pr-queue.sh'),
      'utf8'
    );
    const policy = readFileSync(
      resolve(REPO_ROOT, 'scripts/lib/isolated-ui-docs-policy.mjs'),
      'utf8'
    );

    expect(queueWorkflow).toContain('fleet-policy:');
    expect(queueWorkflow).toContain(
      "workflows: ['CI', 'Production Controller']"
    );
    expect(queueWorkflow).toContain('DRAIN_PROMOTION_MODE:');
    expect(queueWorkflow).toContain('DRAIN_RECOVER_FLEET_HOLDS:');
    expect(queueWorkflow).toContain('merge-queue-drain-mutex');
    expect(queueWorkflow).toContain('isolated-only');
    expect(queueWorkflow).toContain('hold-intake');
    expect(queueWorkflow).toContain('.promotionMode');
    expect(productionWorkflow).toContain('fleet-promotion:');
    expect(productionWorkflow).toContain(
      "needs.fleet-promotion.outputs.deployment_allowed == 'true'"
    );
    expect(drain).toContain('MAX_QUEUE_DEPTH=1');
    expect(drain).toContain(
      'scripts/lib/isolated-ui-docs-policy.mjs evaluate-live'
    );
    expect(drain).toContain(
      'timeout "${DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS}s"'
    );
    const isolatedClassification = drain.slice(
      drain.indexOf('if [[ "$DRAIN_PROMOTION_MODE" == "isolated-only" ]]'),
      drain.indexOf('ENRICHED="[]"')
    );
    expect(isolatedClassification).toContain(
      'stop_if_budget_exhausted && break'
    );
    expect(policy.indexOf('changed file count exceeds')).toBeLessThan(
      policy.indexOf('pulls/${prNumber}/files?per_page=100')
    );
    expect(drain).toContain('.authority.labelsUsed == false');
    expect(drain).toContain('.authority.deploymentAllowed == false');
    expect(drain).toContain('jovie-fleet-queue-hold/v1');
    expect(drain).toContain('Fleet holds may recover only under normal GREEN');
  });
});
