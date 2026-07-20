import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { remediateBlockedPrs } from '../../drain-pr-remediate.mjs';
import {
  classifyGitHubRebaseFailure,
  execFileTerminating,
  gitIntegrationProof,
  tryGitHubRebase,
} from '../github-update-branch.mjs';
import {
  bisectBatchFailure,
  ciWorkflowHasMergeGroupTrigger,
  compareRatchetCounts,
  detectChangedFileOverlap,
  detectIssueOverlap,
  extractWorkflowJobBlock,
  fastTrackPolicy,
  isAutonomousBranch,
  MERGE_QUEUE_ENROLL_HOT_PATH_FORBIDDEN,
  MERGE_QUEUE_REPO_PATHS,
  NATIVE_BRANCH_PROTECTION_POLICY,
  NATIVE_QUEUE_POLICY,
  normalizeBranchProtectionSource,
  parseMergeQueueTimeline,
  parseRequiredStatusChecksFromYaml,
  preQueueFreshnessDecision,
  requiredStatusDecision,
  uiFastTrackPolicy,
  validateAggregateRequiredChecks,
  validateLiveMergeQueueRuleset,
  validateMergeQueueEnrollHotPath,
  validateMergeQueueRepoConfig,
} from '../merge-queue-guard.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const LIVE_NATIVE_RULESET_FIXTURE = JSON.parse(
  readFileSync(
    resolve(import.meta.dirname, 'fixtures/main-ruleset-10512119.json'),
    'utf8'
  )
);

const greenStatuses = [
  { name: 'PR Ready', conclusion: 'SUCCESS' },
  { name: 'Migration Guard', conclusion: 'SUCCESS' },
  { name: 'Fork PR Gate', state: 'SUCCESS' },
  { name: 'PR Size Guard', state: 'SUCCESS' },
];

function buildUiFastTrackBody({
  checks = null,
  heading = true,
  screenshots = true,
  why = true,
} = {}) {
  return [
    heading ? '## Fast-track UI eligibility' : null,
    why ? 'Why eligible: UI-only visual token/layout fix.' : null,
    screenshots
      ? 'Before: ![before](https://github.com/user-attachments/assets/before.png)'
      : null,
    screenshots
      ? 'After: ![after](https://github.com/user-attachments/assets/after.png)'
      : null,
    checks ??
      'Checks run: pnpm --filter @jovie/web run typecheck -- --pretty false; pnpm biome check --write apps/web/components/features/profile/ProfileHeader.tsx; vitest ProfileHeader.test.tsx',
  ]
    .filter(Boolean)
    .join('\n');
}

describe('merge queue pre-queue freshness', () => {
  it('waits for CI after a stale head is rebased and pushed', () => {
    const decision = preQueueFreshnessDecision({
      behindBy: 4,
      rebaseAttempted: true,
      rebaseOk: true,
      pushedRebasedHead: true,
      requiredStatuses: greenStatuses,
    });

    expect(decision.action).toBe('wait_for_ci');
    expect(decision.reason).toContain('required checks must rerun');
  });

  it('blocks known conflicts before the merge label can be applied', () => {
    const decision = preQueueFreshnessDecision({
      behindBy: 2,
      rebaseAttempted: true,
      rebaseOk: false,
      requiredStatuses: greenStatuses,
    });

    expect(decision.action).toBe('block_conflict');
  });

  it('enqueues only when the head is fresh and required statuses are green', () => {
    expect(requiredStatusDecision(greenStatuses).ok).toBe(true);
    expect(
      preQueueFreshnessDecision({
        behindBy: 0,
        requiredStatuses: greenStatuses,
      }).action
    ).toBe('enqueue');

    const waiting = preQueueFreshnessDecision({
      behindBy: 0,
      requiredStatuses: [
        ...greenStatuses.slice(0, 2),
        { name: 'Fork PR Gate', state: 'PENDING' },
      ],
    });
    expect(waiting.action).toBe('wait_for_ci');
    expect(waiting.reason).toContain('Fork PR Gate');
  });
});

describe('autonomous dispatch overlap', () => {
  it('does not classify generic human branches as autonomous blockers', () => {
    expect(isAutonomousBranch('tim/manual-copy-fix')).toBe(false);
    expect(isAutonomousBranch('tim/jov-123-generated-fix')).toBe(true);
  });

  it('blocks two autonomous PRs touching the same hot file', () => {
    const result = detectChangedFileOverlap(
      ['apps/web/tests/unit/design-system/arbitrary-values.baseline.json'],
      [
        {
          number: 11263,
          title: 'converge artists page arbitraries',
          headRefName: 'tim/jov-ds-drift-artists-page',
          changedFiles: [
            'apps/web/tests/unit/design-system/arbitrary-values.baseline.json',
          ],
        },
      ]
    );

    expect(result.blocked).toBe(true);
    expect(result.blockers[0].reason).toContain('ratchet/baseline counter');
  });

  it('blocks issue dispatch when file hints overlap an open subsystem PR', () => {
    const result = detectIssueOverlap(
      {
        title: 'Fix release-to-revenue approval route',
        body: 'Touches apps/web/lib/release-to-revenue/distribution-drafts.ts',
      },
      [
        {
          number: 11236,
          title: 'release-to-revenue drafts',
          headRefName: 'codex/t_ee82b9c8/20260620070815',
          changedFiles: [
            'apps/web/lib/release-to-revenue/distribution-drafts.ts',
          ],
        },
      ]
    );

    expect(result.blocked).toBe(true);
    expect(result.blockers[0].number).toBe(11236);
  });
});

describe('ratchet comparison', () => {
  it('allows decreases against the current base without requiring a shared counter edit', () => {
    const result = compareRatchetCounts(
      { arbitraryValues: 5037, bareTextWhite: 230 },
      { arbitraryValues: 5050, bareTextWhite: 238 }
    );

    expect(result.ok).toBe(true);
    expect(result.improvements.map(item => item.key)).toEqual([
      'arbitraryValues',
      'bareTextWhite',
    ]);
  });

  it('fails monotonic regressions against the current base', () => {
    const result = compareRatchetCounts(
      { arbitraryValues: 5051 },
      { arbitraryValues: 5050 }
    );

    expect(result.ok).toBe(false);
    expect(result.regressions).toEqual([
      { key: 'arbitraryValues', current: 5051, base: 5050 },
    ]);
  });
});

describe('fast-track policy', () => {
  it('removes fast-track from ordinary generated PRs', () => {
    const policy = fastTrackPolicy({
      headRefName: 'codex/jov-123-normal-work',
      labels: [{ name: 'fast' }],
      title: 'Fix dashboard copy',
    });

    expect(policy.removeFast).toBe(true);
    expect(policy.allowed).toBe(false);
  });

  it('permits fast-track only for explicit hotfix classification', () => {
    const policy = fastTrackPolicy({
      headRefName: 'codex/jov-123-prod-fix',
      labels: [{ name: 'fast' }, { name: 'hotfix' }],
      title: 'Hotfix production login incident',
    });

    expect(policy.removeFast).toBe(false);
    expect(policy.allowed).toBe(true);
  });

  it('does not trust generated PR prose for emergency fast-track classification', () => {
    const policy = fastTrackPolicy({
      headRefName: 'codex/jov-123-normal-work',
      labels: [{ name: 'fast' }],
      title: 'Hotfix sev0 production incident',
      body: 'Emergency hotfix requested.',
    });

    expect(policy.removeFast).toBe(true);
    expect(policy.allowed).toBe(false);
  });

  it('permits generated UI fast-track when labels, files, screenshots, checks, and audit trail are present', () => {
    const policy = fastTrackPolicy({
      headRefName: 'codex/jov-3894-text-token-fix',
      labels: [{ name: 'fast' }, { name: 'ui' }, { name: 'fast-track-ui' }],
      title: 'fix(ui): reduce oversized title token',
      changedFiles: [
        'apps/web/components/features/profile/ProfileHeader.tsx',
        'apps/web/tests/unit/profile/ProfileHeader.test.tsx',
      ],
      body: buildUiFastTrackBody(),
    });

    expect(policy.allowed).toBe(true);
    expect(policy.removeFast).toBe(false);
    expect(policy.uiFastTrack.eligible).toBe(true);
  });

  it.each([
    [
      'screenshot evidence',
      {
        checks: 'Checks run: typecheck; biome; affected component test.',
        screenshots: false,
      },
      'missing before/after screenshot evidence in PR body',
    ],
    [
      'typecheck evidence',
      { checks: 'Checks run: biome; affected component test.' },
      'missing narrow typecheck evidence in PR body',
    ],
    [
      'lint evidence',
      { checks: 'Checks run: typecheck; affected component test.' },
      'missing narrow lint/Biome evidence in PR body',
    ],
    [
      'eligibility audit trail',
      { why: false },
      'missing fast-track UI eligibility audit trail in PR body',
    ],
  ])('denies UI fast-track when %s is missing', (_name, bodyOptions, blocker) => {
    const policy = uiFastTrackPolicy({
      headRefName: 'codex/jov-3894-text-token-fix',
      labels: [{ name: 'ui' }, { name: 'fast-track-ui' }],
      changedFiles: ['apps/web/components/features/profile/ProfileHeader.tsx'],
      body: buildUiFastTrackBody(bodyOptions),
    });

    expect(policy.eligible).toBe(false);
    expect(policy.blockers).toContain(blocker);
  });

  it('ignores negated evidence claims in the fast-track UI section', () => {
    const policy = uiFastTrackPolicy({
      labels: [{ name: 'ui' }, { name: 'fast-track-ui' }],
      changedFiles: ['apps/web/components/features/profile/ProfileHeader.tsx'],
      body: [
        '## Fast-track UI eligibility',
        'Why eligible: UI-only visual token/layout fix.',
        'Before: ![before](https://github.com/user-attachments/assets/before.png)',
        'After: ![after](https://github.com/user-attachments/assets/after.png)',
        'Checks run: typecheck not run; biome missing; no affected component test.',
      ].join('\n'),
    });

    expect(policy.eligible).toBe(false);
    expect(policy.blockers).toEqual(
      expect.arrayContaining([
        'missing narrow typecheck evidence in PR body',
        'missing narrow lint/Biome evidence in PR body',
      ])
    );
  });

  it('denies UI fast-track when changed files are unavailable', () => {
    const policy = uiFastTrackPolicy({
      labels: [{ name: 'ui' }, { name: 'fast-track-ui' }],
      body: buildUiFastTrackBody({
        checks: 'Checks run: typecheck; biome; affected component test.',
      }),
    });

    expect(policy.eligible).toBe(false);
    expect(policy.blockers).toContain(
      'changed files are required to classify UI-only fast-track'
    );
  });

  it('warns but does not block when affected test evidence is absent', () => {
    const policy = uiFastTrackPolicy({
      labels: [{ name: 'ui' }, { name: 'fast-track-ui' }],
      changedFiles: ['apps/web/components/features/profile/ProfileHeader.tsx'],
      body: buildUiFastTrackBody({
        checks: 'Checks run: typecheck; biome.',
      }),
    });

    expect(policy.eligible).toBe(true);
    expect(policy.warnings).toContain(
      'no affected component/test evidence found; PR body must explain if none exists'
    );
  });

  it('denies UI fast-track for API, auth, billing, DB, security, infra, and routing paths', () => {
    const policy = uiFastTrackPolicy({
      labels: [{ name: 'ui' }, { name: 'fast-track-ui' }],
      changedFiles: [
        'apps/web/app/api/profile/route.ts',
        'apps/web/lib/entitlements/server.ts',
        'apps/web/drizzle/migrations/0099_add_billing.sql',
        '.github/workflows/ci.yml',
        'apps/web/lib/security/csp.ts',
      ],
      body: buildUiFastTrackBody({
        checks: 'Checks run: typecheck; biome; affected component test.',
      }),
    });

    expect(policy.eligible).toBe(false);
    expect(policy.blockers).toEqual(
      expect.arrayContaining([
        expect.stringContaining('API route or server write path'),
        expect.stringContaining('entitlements or access control'),
        expect.stringContaining('database schema or migration'),
        expect.stringContaining('infra, cron, CI, or routing behavior'),
        expect.stringContaining('security, CSP, or secret handling'),
      ])
    );
  });
});

describe('aggregate required checks', () => {
  it('accepts only aggregate contexts and rejects pinned individual jobs', () => {
    const ok = validateAggregateRequiredChecks([
      'CI / PR Ready',
      'CI / Migration Guard',
      'Fork PR Gate',
      'PR Size Guard',
    ]);
    expect(ok.ok).toBe(true);

    const bad = validateAggregateRequiredChecks([
      'CI / PR Ready',
      'CI / ci-fast',
      'CI / Typecheck',
    ]);
    expect(bad.ok).toBe(false);
    expect(bad.forbidden).toContain('CI / ci-fast');
    expect(bad.forbidden).toContain('CI / Typecheck');
  });

  it('validates checked-in branch protection and CI workflow wiring', () => {
    const branchProtectionYaml = readFileSync(
      resolve(REPO_ROOT, MERGE_QUEUE_REPO_PATHS.branchProtection),
      'utf8'
    );
    const ciWorkflowYaml = readFileSync(
      resolve(REPO_ROOT, MERGE_QUEUE_REPO_PATHS.ciWorkflow),
      'utf8'
    );

    const result = validateMergeQueueRepoConfig({
      backend: 'native',
      branchProtectionYaml,
      ciWorkflowYaml,
    });

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(ciWorkflowHasMergeGroupTrigger(ciWorkflowYaml)).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(parseRequiredStatusChecksFromYaml(branchProtectionYaml)).toEqual([
      'PR Ready',
      'Migration Guard',
      'Fork PR Gate',
      'PR Size Guard',
    ]);
    expect(normalizeBranchProtectionSource(branchProtectionYaml)).toEqual(
      LIVE_NATIVE_RULESET_FIXTURE
    );
    expect(NATIVE_BRANCH_PROTECTION_POLICY).toEqual(
      LIVE_NATIVE_RULESET_FIXTURE
    );

    for (const bypass_actors of [
      '{}',
      '\n  - actor_id: 158384',
      '\n  - actor_id: 2934433',
    ]) {
      const unsafe = validateMergeQueueRepoConfig({
        backend: 'native',
        branchProtectionYaml: branchProtectionYaml.replace(
          'bypass_actors: []',
          `bypass_actors: ${bypass_actors}`
        ),
        ciWorkflowYaml,
      });
      expect(unsafe.errors).toContain(
        'branch-protection.yml native bypass_actors must be an empty array'
      );
    }
  });

  it('keeps Storybook A11y scheduled-only and outside source PR Ready', () => {
    const branchProtectionYaml = readFileSync(
      resolve(REPO_ROOT, MERGE_QUEUE_REPO_PATHS.branchProtection),
      'utf8'
    );
    const ciWorkflowYaml = readFileSync(
      resolve(REPO_ROOT, MERGE_QUEUE_REPO_PATHS.ciWorkflow),
      'utf8'
    );
    const visualWorkflowYaml = readFileSync(
      resolve(REPO_ROOT, '.github/workflows/visual-a11y.yml'),
      'utf8'
    );
    const storybookBlock = extractWorkflowJobBlock(
      visualWorkflowYaml,
      'storybook-a11y'
    );
    const prReadyBlock = extractWorkflowJobBlock(ciWorkflowYaml, 'ci-pr-ready');

    expect(
      parseRequiredStatusChecksFromYaml(branchProtectionYaml)
    ).not.toContain('Storybook A11y');
    // The duplicate manual ci-storybook-a11y job was removed (JOV-4326); the
    // scheduled visual-a11y.yml storybook-a11y lane is the single owner.
    expect(ciWorkflowYaml).not.toContain('ci-storybook-a11y:');
    expect(storybookBlock).toMatch(/pnpm --filter web test:a11y/);
    expect(prReadyBlock).not.toMatch(/ci-storybook-a11y|STORYBOOK_A11Y_RESULT/);
    expect(visualWorkflowYaml).not.toMatch(/^\s+pull_request:/m);
    expect(visualWorkflowYaml).not.toMatch(/^\s+push:/m);
    expect(visualWorkflowYaml).toMatch(/^\s+schedule:/m);
    expect(visualWorkflowYaml).not.toContain('vars.CI_FAST_RUNNER');
  });

  it('keeps merge-queue enroll hot path free of pytest/Python bootstrap (GH-13630)', () => {
    const autoenrollYaml = readFileSync(
      resolve(REPO_ROOT, MERGE_QUEUE_REPO_PATHS.autoenrollWorkflow),
      'utf8'
    );
    const enrollBlock = extractWorkflowJobBlock(autoenrollYaml, 'enroll');

    expect(enrollBlock).toMatch(/drain-pr-queue\.sh/);
    for (const rule of MERGE_QUEUE_ENROLL_HOT_PATH_FORBIDDEN) {
      expect(rule.pattern.test(enrollBlock), rule.id).toBe(false);
    }

    const result = validateMergeQueueEnrollHotPath(autoenrollYaml);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('validates the legacy Graphite ruleset shape only when explicitly selected', () => {
    const liveRuleset = {
      bypass_actors: [
        {
          actor_id: 158384,
          actor_type: 'Integration',
          bypass_mode: 'always',
        },
      ],
      rules: [
        { type: 'pull_request' },
        {
          type: 'required_status_checks',
          parameters: [
            { context: 'PR Ready' },
            { context: 'Migration Guard' },
            { context: 'Fork PR Gate', integration_id: 2934433 },
            { context: 'PR Size Guard' },
          ],
        },
        { type: 'non_fast_forward' },
        { type: 'required_linear_history' },
      ],
    };

    const result = validateLiveMergeQueueRuleset(liveRuleset, {
      backend: 'graphite',
    });
    expect(result.ok).toBe(true);
    expect(result.hasGraphiteBypass).toBe(true);
  });

  it('fails closed when native source wiring omits the queue event and retains Graphite bypass', () => {
    const unsafe = validateMergeQueueRepoConfig({
      backend: 'native',
      branchProtectionYaml: `
        rules:
          - type: non_fast_forward
        bypass_actors:
          - actor_id: 158384
      `,
      ciWorkflowYaml: 'on: pull_request',
    });

    expect(unsafe.ok).toBe(false);
    expect(unsafe.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('must enable GitHub native merge_queue'),
        expect.stringContaining('must handle merge_group'),
        expect.stringContaining('bypass_actors must be an empty array'),
      ])
    );
  });

  it('validates native live ruleset shape and rejects Graphite bypass residue', () => {
    const requiredStatusChecks = {
      type: 'required_status_checks',
      parameters: {
        strict_required_status_checks_policy: false,
        required_status_checks: [
          'PR Ready',
          'Migration Guard',
          'Fork PR Gate',
          'PR Size Guard',
        ].map(context => ({ context })),
      },
    };
    const nativeRules = [
      { type: 'pull_request' },
      requiredStatusChecks,
      { type: 'merge_queue', parameters: NATIVE_QUEUE_POLICY },
    ];
    const result = validateLiveMergeQueueRuleset(
      {
        bypass_actors: [],
        rules: nativeRules,
      },
      { backend: 'native' }
    );

    expect(result).toMatchObject({
      ok: true,
      hasGraphiteBypass: false,
      hasNativeMergeQueue: true,
    });

    for (const dormantType of ['required_signatures', 'non_fast_forward']) {
      const unexpectedDormantRule = validateLiveMergeQueueRuleset(
        {
          bypass_actors: [],
          rules: [...nativeRules, { type: dormantType }],
        },
        { backend: 'native' }
      );
      expect(unexpectedDormantRule.errors).toContain(
        'live native ruleset unexpectedly enables dormant signature or non-fast-forward rules'
      );
    }

    for (const bypass_actors of [undefined, {}]) {
      const malformed = validateLiveMergeQueueRuleset(
        { bypass_actors, rules: nativeRules },
        { backend: 'native' }
      );
      expect(malformed.errors).toContain(
        'live ruleset bypass_actors must be an array'
      );
    }

    for (const actor_id of [158384, 2934433]) {
      const unsafeBypass = validateLiveMergeQueueRuleset(
        {
          bypass_actors: [{ actor_id, actor_type: 'Integration' }],
          rules: nativeRules,
        },
        { backend: 'native' }
      );
      expect(unsafeBypass.errors).toContain(
        'live native ruleset bypass_actors must be empty'
      );
    }

    const unsafe = validateLiveMergeQueueRuleset(
      {
        bypass_actors: [{ actor_id: 158384, actor_type: 'Integration' }],
        rules: [
          requiredStatusChecks,
          {
            type: 'merge_queue',
            parameters: {
              ...NATIVE_QUEUE_POLICY,
              max_entries_to_build: 99,
              merge_method: 'MERGE',
            },
          },
        ],
      },
      { backend: 'native' }
    );
    expect(unsafe.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('SQUASH'),
        expect.stringContaining('max_entries_to_build'),
        expect.stringContaining('bypass_actors must be empty'),
      ])
    );
  });

  it('rejects unknown backend names instead of falling back to Graphite', () => {
    const result = validateLiveMergeQueueRuleset(
      { bypass_actors: [], rules: [] },
      { backend: 'other' }
    );
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('unknown merge queue backend: other');
  });
});

describe('batch bisection', () => {
  it('isolates one failing PR and requeues siblings instead of failing the batch', () => {
    const batch = ['pr-1', 'pr-2', 'pr-bad', 'pr-4', 'pr-5'];
    const failing = new Set(['pr-bad']);
    const batchPasses = subset => !subset.some(id => failing.has(id));

    const result = bisectBatchFailure(batch, batchPasses);

    expect(result.batchFailed).toBe(true);
    expect(result.culprit).toBe('pr-bad');
    expect(result.requeued).toEqual(['pr-1', 'pr-2', 'pr-4', 'pr-5']);
    expect(result.bisectSteps).toBeGreaterThan(0);
  });

  it('returns no culprit when the whole batch passes', () => {
    const batch = ['pr-1', 'pr-2'];
    const result = bisectBatchFailure(batch, () => true);

    expect(result.batchFailed).toBe(false);
    expect(result.culprit).toBeNull();
    expect(result.requeued).toEqual([]);
  });
});

describe('merge queue telemetry parser', () => {
  it('records queued duration, evictions, requeues, staleness, and speculative reruns', () => {
    const metrics = parseMergeQueueTimeline([
      {
        event: 'labeled',
        label: { name: 'merge-queue' },
        created_at: '2026-06-20T01:00:00Z',
      },
      {
        event: 'commented',
        body: '<!-- merge-queue-telemetry {"event":"enqueue","branchStalenessCommits":3,"speculativeRerun":true} -->',
        created_at: '2026-06-20T01:00:02Z',
      },
      {
        event: 'commented',
        body: "Merge Conflict Detected — This PR has state 'BLOCKED'",
        created_at: '2026-06-20T01:30:00Z',
      },
      {
        event: 'unlabeled',
        label: { name: 'merge-queue' },
        actor: { login: 'graphite-app[bot]' },
        created_at: '2026-06-20T01:31:00Z',
      },
      {
        event: 'labeled',
        label: { name: 'merge-queue' },
        created_at: '2026-06-20T02:00:00Z',
      },
      {
        event: 'commented',
        body: 'CI failed after Graphite speculative rerun',
        created_at: '2026-06-20T02:10:00Z',
      },
      {
        event: 'merged',
        created_at: '2026-06-20T02:30:00Z',
      },
    ]);

    expect(metrics.queuedToMergedSeconds).toBe(5400);
    expect(metrics.requeueCount).toBe(1);
    expect(metrics.conflictEvictions).toBe(1);
    expect(metrics.ciEvictions).toBe(1);
    expect(metrics.branchStalenessAtEnqueue).toBe(3);
    expect(metrics.speculativeReruns).toBe(1);
  });

  it('computes readyToMergedSeconds from the latest ready_for_review event', () => {
    const metrics = parseMergeQueueTimeline([
      {
        event: 'ready_for_review',
        created_at: '2026-06-20T01:00:00Z',
      },
      {
        event: 'labeled',
        label: { name: 'merge-queue' },
        created_at: '2026-06-20T01:05:00Z',
      },
      {
        event: 'merged',
        created_at: '2026-06-20T01:10:00Z',
      },
    ]);

    expect(metrics.readyForReviewAt).toEqual(['2026-06-20T01:00:00Z']);
    expect(metrics.readyToMergedSeconds).toBe(600);
  });

  it('falls back to the PR createdAt when never drafted (no ready_for_review event)', () => {
    const metrics = parseMergeQueueTimeline(
      [
        {
          event: 'merged',
          created_at: '2026-06-20T01:10:00Z',
        },
      ],
      { prCreatedAt: '2026-06-20T01:00:00Z' }
    );

    expect(metrics.readyForReviewAt).toEqual([]);
    expect(metrics.readyToMergedSeconds).toBe(600);
  });

  it('returns null readyToMergedSeconds when neither ready_for_review nor prCreatedAt is available', () => {
    const metrics = parseMergeQueueTimeline([
      {
        event: 'merged',
        created_at: '2026-06-20T01:10:00Z',
      },
    ]);

    expect(metrics.readyToMergedSeconds).toBeNull();
  });
});

const ORIGINAL_HEAD = 'a'.repeat(40);
const UPDATED_HEAD = 'b'.repeat(40);
const RACING_HEAD = 'c'.repeat(40);
const BASE_HEAD = 'd'.repeat(40);
const MOVED_BASE_HEAD = 'e'.repeat(40);
const POTENTIAL_MERGE_HEAD = 'f'.repeat(40);
const EXPECTED_INTEGRATION_TREE = '1'.repeat(40);
const RACING_TREE = '2'.repeat(40);
const PR_BASE_HEAD = '3'.repeat(40);

function fakeClock(startMs = 0) {
  let currentMs = startMs;
  return {
    nowImpl: () => currentMs,
    advance: elapsedMs => {
      currentMs += elapsedMs;
    },
    sleepImpl: vi.fn(async delayMs => {
      currentMs += delayMs;
    }),
  };
}

function snapshot(overrides = {}) {
  return {
    id: 'PR_kwDO_example',
    state: 'OPEN',
    isDraft: false,
    baseRefName: 'main',
    baseRefOid: PR_BASE_HEAD,
    headRefName: 'tim/jov-123-example',
    headRefOid: ORIGINAL_HEAD,
    headRepositoryOwner: { login: 'JovieInc' },
    isCrossRepository: false,
    mergeable: 'MERGEABLE',
    potentialMergeCommit: { oid: POTENTIAL_MERGE_HEAD },
    ...overrides,
  };
}

function mutationSnapshot() {
  return {
    data: {
      updatePullRequestBranch: {
        pullRequest: snapshot({ headRefOid: UPDATED_HEAD }),
      },
    },
  };
}

function asynchronousMutationSnapshot() {
  return {
    data: {
      updatePullRequestBranch: {
        pullRequest: snapshot(),
      },
    },
  };
}

function blockedPr(overrides = {}) {
  return {
    number: 123,
    headRefName: 'tim/jov-123-example',
    updatedAt: '2026-07-01T00:00:00Z',
    labels: [],
    failures: ['CI / PR Ready'],
    ...overrides,
  };
}

function potentialMergeCommit(overrides = {}) {
  return {
    sha: POTENTIAL_MERGE_HEAD,
    tree: { sha: EXPECTED_INTEGRATION_TREE },
    parents: [{ sha: BASE_HEAD }, { sha: ORIGINAL_HEAD }],
    ...overrides,
  };
}

function ghSequence({
  before = snapshot(),
  mutation = mutationSnapshot(),
  after = snapshot({ headRefOid: UPDATED_HEAD }),
  afterSequence = null,
  mutationError = null,
  baseRefSequence = [BASE_HEAD],
  potentialCommit = potentialMergeCommit(),
  alreadyIntegrated = false,
  expectedIntegrationTreeOid = EXPECTED_INTEGRATION_TREE,
  verificationTrees = {},
  verificationAncestors = {},
  prepareError = null,
  verifyError = null,
} = {}) {
  const calls = [];
  const callOptions = [];
  let snapshotCalls = 0;
  let baseRefCalls = 0;
  const ghJsonImpl = vi.fn(async (args, options = {}) => {
    calls.push(args);
    callOptions.push(options);
    if (args[0] === 'pr' && args[1] === 'view') {
      snapshotCalls += 1;
      if (snapshotCalls === 1) return before;
      const snapshots = afterSequence ?? [alreadyIntegrated ? before : after];
      return snapshots[Math.min(snapshotCalls - 2, snapshots.length - 1)];
    }
    if (args[0] === 'api' && args[1] === 'graphql') {
      if (mutationError) throw mutationError;
      return mutation;
    }
    if (args[0] === 'api' && args[1].includes('/git/ref/heads/')) {
      const sha =
        baseRefSequence[Math.min(baseRefCalls, baseRefSequence.length - 1)];
      baseRefCalls += 1;
      return { object: { sha } };
    }
    if (
      args[0] === 'api' &&
      args[1].endsWith(`/git/commits/${POTENTIAL_MERGE_HEAD}`)
    ) {
      return potentialCommit;
    }
    throw new Error(`unexpected gh args: ${args.join(' ')}`);
  });
  const integrationProofImpl = vi.fn(async input => {
    if (input.phase === 'prepare') {
      if (prepareError) throw prepareError;
      if (alreadyIntegrated) {
        return {
          alreadyIntegrated: true,
          headTreeOid: EXPECTED_INTEGRATION_TREE,
        };
      }
      return { alreadyIntegrated: false, expectedIntegrationTreeOid };
    }

    if (verifyError) throw verifyError;
    const headTreeOid =
      verificationTrees[input.headRefOid] ??
      (input.headRefOid === UPDATED_HEAD
        ? EXPECTED_INTEGRATION_TREE
        : RACING_TREE);
    const baseIsAncestor = verificationAncestors[input.headRefOid] ?? true;
    return {
      ok: baseIsAncestor && headTreeOid === input.expectedIntegrationTreeOid,
      baseIsAncestor,
      headTreeOid,
    };
  });
  return { calls, callOptions, ghJsonImpl, integrationProofImpl };
}

function ghError(message) {
  return Object.assign(new Error(message), { stderr: message });
}

describe('absolute update-branch subprocess deadline', () => {
  it('passes a decreasing remaining timeout to every GitHub command', async () => {
    const clock = fakeClock();
    const gh = ghSequence();
    const elapsedGhJson = vi.fn(async (args, options) => {
      const result = await gh.ghJsonImpl(args, options);
      clock.advance(10);
      return result;
    });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: elapsedGhJson,
      integrationProofImpl: gh.integrationProofImpl,
      nowImpl: clock.nowImpl,
      operationBudgetMs: 1000,
    });

    expect(result).toMatchObject({ ok: true, category: 'updated' });
    const timeouts = gh.callOptions.map(({ timeoutMs }) => timeoutMs);
    expect(timeouts).toHaveLength(gh.calls.length);
    expect(timeouts.every(timeoutMs => timeoutMs > 0 && timeoutMs < 1000)).toBe(
      true
    );
    expect(timeouts.at(-1)).toBeLessThan(timeouts[0]);
    expect(clock.nowImpl()).toBe(80);
  });

  it('caps every integration-proof git command to the same absolute deadline', async () => {
    const clock = fakeClock();
    const calls = [];
    const gitImpl = vi.fn(async (args, options) => {
      calls.push({ args, atMs: clock.nowImpl(), timeoutMs: options.timeoutMs });
      clock.advance(10);

      if (args[0] === 'fetch') return '';
      if (args[0] === 'merge-base') {
        throw Object.assign(new Error('not an ancestor'), { code: 1 });
      }
      if (args[0] === 'merge-tree') return EXPECTED_INTEGRATION_TREE;
      if (args[0] === 'rev-parse' && args[1] === `${BASE_HEAD}^{commit}`) {
        return BASE_HEAD;
      }
      if (args[0] === 'rev-parse' && args[1] === `${ORIGINAL_HEAD}^{commit}`) {
        return ORIGINAL_HEAD;
      }
      if (args[0] === 'rev-parse' && args[1] === `${ORIGINAL_HEAD}^{tree}`) {
        return RACING_TREE;
      }
      throw new Error(`unexpected git args: ${args.join(' ')}`);
    });

    const result = await gitIntegrationProof({
      phase: 'prepare',
      prNumber: 123,
      baseRefName: 'main',
      baseRefOid: BASE_HEAD,
      headRefOid: ORIGINAL_HEAD,
      deadline: { deadlineAtMs: 1000, nowImpl: clock.nowImpl },
      gitImpl,
    });

    expect(result).toMatchObject({
      alreadyIntegrated: false,
      expectedIntegrationTreeOid: EXPECTED_INTEGRATION_TREE,
    });
    expect(calls).toHaveLength(6);
    for (const call of calls) {
      expect(call.timeoutMs).toBeGreaterThan(0);
      expect(call.timeoutMs).toBeLessThanOrEqual(1000 - call.atMs);
    }
    expect(calls.at(-1).timeoutMs).toBeLessThan(calls[0].timeoutMs);
  });

  it('SIGKILLs a timed-out child instead of abandoning it', async () => {
    let failure;
    try {
      await execFileTerminating(
        process.execPath,
        [
          '-e',
          'process.stdout.write(String(process.pid)); setInterval(() => {}, 1000)',
        ],
        { encoding: 'utf8', timeout: 150 }
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ killed: true, signal: 'SIGKILL' });
    const childPid = Number.parseInt(failure.stdout, 10);
    expect(Number.isInteger(childPid)).toBe(true);
    expect(() => process.kill(childPid, 0)).toThrow();
  });

  it('returns verification_failure for a hung post-mutation command and permits the next run', async () => {
    const gh = ghSequence({ mutation: asynchronousMutationSnapshot() });
    let mutationReturned = false;
    let hungTimeoutMs = null;
    const hungGhJson = vi.fn(async (args, options) => {
      if (args[0] === 'pr' && args[1] === 'view' && mutationReturned) {
        hungTimeoutMs = options.timeoutMs;
        return new Promise(() => {});
      }
      const result = await gh.ghJsonImpl(args, options);
      if (args[0] === 'api' && args[1] === 'graphql') mutationReturned = true;
      return result;
    });
    const startedAt = Date.now();

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: hungGhJson,
      integrationProofImpl: gh.integrationProofImpl,
      operationBudgetMs: 80,
    });
    const elapsedMs = Date.now() - startedAt;

    expect(result).toMatchObject({
      ok: false,
      mutationAttempted: true,
      category: 'verification_failure',
    });
    expect(hungTimeoutMs).toBeGreaterThan(0);
    expect(hungTimeoutMs).toBeLessThan(80);
    expect(elapsedMs).toBeGreaterThanOrEqual(50);
    expect(elapsedMs).toBeLessThan(500);

    const next = ghSequence({ alreadyIntegrated: true });
    await expect(
      tryGitHubRebase({
        repo: 'JovieInc/Jovie',
        pr: blockedPr(),
        expectedBaseRefName: null,
        dryRun: false,
        ghJsonImpl: next.ghJsonImpl,
        integrationProofImpl: next.integrationProofImpl,
      })
    ).resolves.toMatchObject({ ok: true, category: 'no_change' });
  });
});

describe('exact-head GitHub Update Branch rebase', () => {
  it('passes the observed head to updatePullRequestBranch with REBASE and verifies the new head', async () => {
    const gh = ghSequence();

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
    });

    expect(result).toMatchObject({
      ok: true,
      updated: true,
      mutationAttempted: true,
      mutationApplied: true,
      conflict: false,
      expectedHeadOid: ORIGINAL_HEAD,
      observedHeadOid: UPDATED_HEAD,
      baseRefName: 'main',
    });
    const mutationArgs = gh.calls.find(
      args => args[0] === 'api' && args[1] === 'graphql'
    );
    expect(mutationArgs.join('\n')).toContain('updateMethod: REBASE');
    expect(mutationArgs).toContain(`expectedHeadOid=${ORIGINAL_HEAD}`);
    expect(gh.integrationProofImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'prepare',
        baseRefOid: BASE_HEAD,
        headRefOid: ORIGINAL_HEAD,
        potentialMergeCommit: expect.objectContaining({
          oid: POTENTIAL_MERGE_HEAD,
          treeOid: EXPECTED_INTEGRATION_TREE,
        }),
      })
    );
    expect(gh.integrationProofImpl).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'verify',
        baseRefOid: BASE_HEAD,
        headRefOid: UPDATED_HEAD,
        expectedIntegrationTreeOid: EXPECTED_INTEGRATION_TREE,
      })
    );
    expect(gh.calls.flat().join(' ')).not.toMatch(
      /repo clone|force-with-lease|git push/
    );
  });

  it('returns authoritative no change before mutation when exact base is already an ancestor', async () => {
    const gh = ghSequence({ alreadyIntegrated: true });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
    });

    expect(result).toMatchObject({
      ok: true,
      updated: false,
      mutationAttempted: false,
      mutationApplied: false,
      category: 'no_change',
      expectedHeadOid: ORIGINAL_HEAD,
      observedHeadOid: ORIGINAL_HEAD,
    });
    expect(
      gh.calls.some(args => args.join('\n').includes('updatePullRequestBranch'))
    ).toBe(false);
  });

  it('accepts an async head only after exact base ancestry and integration-tree proof', async () => {
    const sleepImpl = vi.fn(async () => {});
    const gh = ghSequence({
      mutation: asynchronousMutationSnapshot(),
      afterSequence: [snapshot(), snapshot({ headRefOid: UPDATED_HEAD })],
    });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
      sleepImpl,
    });

    expect(result).toMatchObject({
      ok: true,
      updated: true,
      mutationAttempted: true,
      mutationApplied: true,
      conflict: false,
      expectedHeadOid: ORIGINAL_HEAD,
      observedHeadOid: UPDATED_HEAD,
    });
    expect(sleepImpl).toHaveBeenCalledOnce();
    expect(sleepImpl).toHaveBeenCalledWith(250);
  });

  it('rejects a same-viewer concurrent push with a different integration tree', async () => {
    const sleepImpl = vi.fn(async () => {});
    const gh = ghSequence({
      mutation: asynchronousMutationSnapshot(),
      afterSequence: [snapshot(), snapshot({ headRefOid: RACING_HEAD })],
    });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
      sleepImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      mutationAttempted: true,
      mutationApplied: false,
      conflict: false,
      category: 'verification_failure',
      expectedHeadOid: ORIGINAL_HEAD,
      observedHeadOid: RACING_HEAD,
    });
    expect(result.reason).toContain('integration-tree proof');
    expect(sleepImpl).toHaveBeenCalledOnce();
    expect(sleepImpl).toHaveBeenCalledWith(250);
  });

  it('rejects an expected tree when the exact base is not an ancestor', async () => {
    const gh = ghSequence({
      mutation: asynchronousMutationSnapshot(),
      after: snapshot({ headRefOid: UPDATED_HEAD }),
      verificationAncestors: { [UPDATED_HEAD]: false },
    });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      category: 'verification_failure',
      observedHeadOid: UPDATED_HEAD,
    });
    expect(result.reason).toContain('base-ancestry');
  });

  it('accepts a same-viewer equivalent-tree race as semantically harmless', async () => {
    const sleepImpl = vi.fn(async () => {});
    const gh = ghSequence({
      mutation: asynchronousMutationSnapshot(),
      afterSequence: [snapshot({ headRefOid: RACING_HEAD })],
      verificationTrees: { [RACING_HEAD]: EXPECTED_INTEGRATION_TREE },
    });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
      sleepImpl,
    });

    expect(result).toMatchObject({
      ok: true,
      updated: true,
      mutationAttempted: true,
      mutationApplied: true,
      conflict: false,
      expectedHeadOid: ORIGINAL_HEAD,
      observedHeadOid: RACING_HEAD,
    });
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  it('accepts a semantically proven completion near the 30-second deadline', async () => {
    const clock = fakeClock();
    const gh = ghSequence({
      mutation: asynchronousMutationSnapshot(),
      afterSequence: [
        snapshot(),
        snapshot(),
        snapshot(),
        snapshot(),
        snapshot(),
        snapshot(),
        snapshot(),
        snapshot({ headRefOid: UPDATED_HEAD }),
      ],
    });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
      sleepImpl: clock.sleepImpl,
      nowImpl: clock.nowImpl,
    });

    expect(result).toMatchObject({
      ok: true,
      updated: true,
      mutationAttempted: true,
      mutationApplied: true,
      conflict: false,
      expectedHeadOid: ORIGINAL_HEAD,
      observedHeadOid: UPDATED_HEAD,
    });
    expect(clock.sleepImpl.mock.calls.map(([delayMs]) => delayMs)).toEqual([
      250, 500, 1000, 2000, 4000, 8000, 14000,
    ]);
    expect(clock.nowImpl()).toBe(29_750);
  });

  it('fails beyond the deadline, then a later retry preflight-proves no change', async () => {
    const clock = fakeClock();
    const gh = ghSequence({
      mutation: asynchronousMutationSnapshot(),
      afterSequence: [snapshot()],
    });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
      sleepImpl: clock.sleepImpl,
      nowImpl: clock.nowImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      mutationAttempted: true,
      mutationApplied: false,
      conflict: false,
      category: 'verification_failure',
      expectedHeadOid: ORIGINAL_HEAD,
      observedHeadOid: ORIGINAL_HEAD,
    });
    expect(clock.sleepImpl.mock.calls.map(([delayMs]) => delayMs)).toEqual([
      250, 500, 1000, 2000, 4000, 8000, 14000, 250,
    ]);
    expect(clock.nowImpl()).toBe(30_000);

    const retry = ghSequence({ alreadyIntegrated: true });
    const retried = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: retry.ghJsonImpl,
      integrationProofImpl: retry.integrationProofImpl,
    });
    expect(retried).toMatchObject({
      ok: true,
      updated: false,
      mutationAttempted: false,
      category: 'no_change',
    });
  });

  it('fails closed when the exact base moves during the mutation', async () => {
    const gh = ghSequence({
      after: snapshot({ headRefOid: UPDATED_HEAD }),
      baseRefSequence: [BASE_HEAD, MOVED_BASE_HEAD],
    });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      conflict: false,
      category: 'verification_failure',
      expectedHeadOid: ORIGINAL_HEAD,
      observedHeadOid: UPDATED_HEAD,
    });
    expect(gh.integrationProofImpl).toHaveBeenCalledTimes(1);
  });

  it('re-reads the exact head after semantic proof and rejects a lost race', async () => {
    const gh = ghSequence({
      afterSequence: [
        snapshot({ headRefOid: UPDATED_HEAD }),
        snapshot({ headRefOid: RACING_HEAD }),
      ],
    });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      mutationAttempted: true,
      category: 'verification_failure',
      observedHeadOid: RACING_HEAD,
    });
  });

  it('refuses fork refs before any mutation or integration fetch', async () => {
    const gh = ghSequence({
      before: snapshot({
        isCrossRepository: true,
        headRepositoryOwner: { login: 'fork-owner' },
      }),
    });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      mutationAttempted: false,
      category: 'stale_pr',
    });
    expect(gh.integrationProofImpl).not.toHaveBeenCalled();
    expect(
      gh.calls.some(args => args.join('\n').includes('updatePullRequestBranch'))
    ).toBe(false);
  });

  it('treats an expected-head mutation error as stale, never as a conflict', async () => {
    const gh = ghSequence({
      mutationError: ghError('GraphQL: head branch was modified'),
      after: snapshot({ headRefOid: UPDATED_HEAD }),
    });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      mutationAttempted: true,
      mutationApplied: false,
      conflict: false,
      category: 'stale_head',
      expectedHeadOid: ORIGINAL_HEAD,
      observedHeadOid: UPDATED_HEAD,
    });
  });

  it('refuses enrollment when the post-update head differs from the mutation result', async () => {
    const gh = ghSequence({
      after: snapshot({ headRefOid: RACING_HEAD }),
    });

    const result = await tryGitHubRebase({
      repo: 'JovieInc/Jovie',
      pr: blockedPr(),
      expectedBaseRefName: null,
      dryRun: false,
      ghJsonImpl: gh.ghJsonImpl,
      integrationProofImpl: gh.integrationProofImpl,
    });

    expect(result).toMatchObject({
      ok: false,
      conflict: false,
      category: 'verification_failure',
      expectedHeadOid: ORIGINAL_HEAD,
      observedHeadOid: RACING_HEAD,
    });
  });

  it('only classifies a conflict when GitHub confirms CONFLICTING after failure', () => {
    const error = ghError('GraphQL: pull request is not mergeable');

    expect(
      classifyGitHubRebaseFailure({
        error,
        before: snapshot(),
        after: snapshot({ mergeable: 'CONFLICTING' }),
      })
    ).toMatchObject({ conflict: true, category: 'conflict' });
    expect(
      classifyGitHubRebaseFailure({
        error: ghError('HTTP 503 service unavailable'),
        before: snapshot(),
        after: snapshot({ mergeable: 'MERGEABLE' }),
      })
    ).toMatchObject({ conflict: false, category: 'transient' });
    expect(
      classifyGitHubRebaseFailure({
        error: ghError('HTTP 403 Resource not accessible by integration'),
        before: snapshot(),
        after: snapshot({ mergeable: 'UNKNOWN' }),
      })
    ).toMatchObject({ conflict: false, category: 'auth' });
    expect(
      classifyGitHubRebaseFailure({
        error: ghError('GraphQL: PR branch already up-to-date'),
        before: snapshot(),
        after: snapshot(),
      })
    ).toMatchObject({
      ok: false,
      conflict: false,
      category: 'api_failure',
    });
  });
});

describe('remediation mutations', () => {
  const options = {
    repo: 'JovieInc/Jovie',
    baseRef: 'main',
    dryRun: false,
    maxPerRun: 3,
    cooldownHours: 0,
    limit: 10,
  };

  it('bypasses the cooldown for a stale conflict label', async () => {
    const rebaseImpl = vi.fn(async () => ({
      ok: true,
      updated: true,
      dryRun: true,
      reason: 'would rebase exact head',
    }));

    const summary = await remediateBlockedPrs(
      { ...options, dryRun: true, cooldownHours: 4 },
      {
        listBlockedAgentPrsImpl: async () => [
          blockedPr({
            updatedAt: '2026-07-18T17:59:00Z',
            labels: [{ name: 'needs-conflict-resolution' }],
          }),
        ],
        rebaseImpl,
        nowMs: Date.parse('2026-07-18T18:00:00Z'),
      }
    );

    expect(rebaseImpl).toHaveBeenCalledOnce();
    expect(summary.applied).toBe(1);
  });

  it('does not add conflict or queue labels for transient rebase failures', async () => {
    const labelPrImpl = vi.fn();
    const commentPrImpl = vi.fn();

    const summary = await remediateBlockedPrs(options, {
      listBlockedAgentPrsImpl: async () => [blockedPr()],
      rebaseImpl: async () => ({
        ok: false,
        mutationAttempted: true,
        mutationApplied: false,
        conflict: false,
        category: 'transient',
        reason: 'GitHub rebase transient: HTTP 503',
      }),
      labelPrImpl,
      commentPrImpl,
      nowMs: Date.parse('2026-07-18T00:00:00Z'),
    });

    expect(summary.applied).toBe(0);
    expect(summary.mutationBudgetUsed).toBe(1);
    expect(labelPrImpl).not.toHaveBeenCalled();
    expect(commentPrImpl).not.toHaveBeenCalled();
  });

  it('stops after one attempted but unverified mutation', async () => {
    const rebaseImpl = vi.fn(async () => ({
      ok: false,
      mutationAttempted: true,
      mutationApplied: true,
      conflict: false,
      category: 'verification_failure',
      reason: 'updated head did not converge before timeout',
    }));
    const labelPrImpl = vi.fn();
    const commentPrImpl = vi.fn();

    const summary = await remediateBlockedPrs(
      { ...options, maxPerRun: 1 },
      {
        listBlockedAgentPrsImpl: async () => [
          blockedPr(),
          blockedPr({ number: 124, headRefName: 'codex/next-candidate' }),
        ],
        rebaseImpl,
        labelPrImpl,
        commentPrImpl,
        nowMs: Date.parse('2026-07-18T00:00:00Z'),
      }
    );

    expect(rebaseImpl).toHaveBeenCalledOnce();
    expect(summary).toMatchObject({ applied: 0, mutationBudgetUsed: 1 });
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]).toMatchObject({
      mutationAttempted: true,
      mutationApplied: true,
      consumedBudget: true,
    });
    expect(labelPrImpl).not.toHaveBeenCalled();
    expect(commentPrImpl).not.toHaveBeenCalled();
  });

  it('clears a stale conflict label on a verified no-op without queue churn', async () => {
    const labelPrImpl = vi.fn();
    const removeLabelPrImpl = vi.fn();
    const commentPrImpl = vi.fn();

    const summary = await remediateBlockedPrs(options, {
      listBlockedAgentPrsImpl: async () => [
        blockedPr({ labels: [{ name: 'needs-conflict-resolution' }] }),
      ],
      rebaseImpl: async () => ({
        ok: true,
        updated: false,
        mutationAttempted: false,
        mutationApplied: false,
        conflict: false,
        category: 'no_change',
        reason: `exact base ${BASE_HEAD.slice(0, 12)} is already an ancestor of the PR head`,
      }),
      labelPrImpl,
      removeLabelPrImpl,
      commentPrImpl,
      nowMs: Date.parse('2026-07-18T00:00:00Z'),
    });

    expect(summary.applied).toBe(0);
    expect(removeLabelPrImpl).toHaveBeenCalledOnce();
    expect(removeLabelPrImpl).toHaveBeenCalledWith(
      'JovieInc/Jovie',
      123,
      'needs-conflict-resolution'
    );
    expect(labelPrImpl).not.toHaveBeenCalled();
    expect(commentPrImpl).not.toHaveBeenCalled();
  });

  it('adds needs-conflict-resolution only for confirmed conflicts', async () => {
    const labelPrImpl = vi.fn();
    const commentPrImpl = vi.fn();

    await remediateBlockedPrs(options, {
      listBlockedAgentPrsImpl: async () => [blockedPr()],
      rebaseImpl: async () => ({
        ok: false,
        conflict: true,
        category: 'conflict',
        reason: 'GitHub confirmed conflicts',
      }),
      labelPrImpl,
      commentPrImpl,
      nowMs: Date.parse('2026-07-18T00:00:00Z'),
    });

    expect(labelPrImpl).toHaveBeenCalledOnce();
    expect(labelPrImpl).toHaveBeenCalledWith(
      'JovieInc/Jovie',
      123,
      'needs-conflict-resolution'
    );
    expect(commentPrImpl).toHaveBeenCalledOnce();
  });

  it('clears a stale conflict label before enrolling the rebased head', async () => {
    const labelPrImpl = vi.fn();
    const removeLabelPrImpl = vi.fn();
    const commentPrImpl = vi.fn();

    const summary = await remediateBlockedPrs(options, {
      listBlockedAgentPrsImpl: async () => [
        blockedPr({ labels: [{ name: 'needs-conflict-resolution' }] }),
      ],
      rebaseImpl: async () => ({
        ok: true,
        updated: true,
        mutationAttempted: true,
        mutationApplied: true,
        conflict: false,
        category: 'updated',
        baseRefName: 'main',
        expectedHeadOid: ORIGINAL_HEAD,
        observedHeadOid: UPDATED_HEAD,
        reason: 'GitHub rebased the exact head',
      }),
      labelPrImpl,
      removeLabelPrImpl,
      commentPrImpl,
      nowMs: Date.parse('2026-07-18T00:00:00Z'),
    });

    expect(summary.applied).toBe(1);
    expect(removeLabelPrImpl).toHaveBeenCalledWith(
      'JovieInc/Jovie',
      123,
      'needs-conflict-resolution'
    );
    expect(labelPrImpl).toHaveBeenCalledWith(
      'JovieInc/Jovie',
      123,
      'merge-queue'
    );
    expect(removeLabelPrImpl.mock.invocationCallOrder[0]).toBeLessThan(
      labelPrImpl.mock.invocationCallOrder[0]
    );
    expect(commentPrImpl).toHaveBeenCalledOnce();
  });
});
