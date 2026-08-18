import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ADVISORY_CHECK_NAMES,
  AGENT_BRANCH_RE,
  classifyQueueCheckBlockers,
  classifyRemediationCandidate,
  collapseNewestCheckAttempts,
  extractExactHeadControllerFailures,
  extractTerminalControlPlaneFailures,
  extractTerminalFailures,
  isAdvisoryCheck,
  isAgentBranch,
  isTerminalFailure,
  MERGE_GATE_CHECK_NAMES,
  normalizeCheckName,
} from '../pr-check-failures.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

describe('pr-check-failures', () => {
  it('selects stale, conflicting, or failed exact heads without admitting held work', () => {
    const candidate = (overrides = {}) => ({
      number: 16060,
      title: 'repair the control loop',
      isDraft: false,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      labels: [],
      headRefName: 'codex/control-loop',
      headRefOid: 'a'.repeat(40),
      baseRefName: 'main',
      nativeQueueState: {
        headRefOid: 'a'.repeat(40),
        queued: false,
        autoMergeEnabled: false,
      },
      headRepositoryOwner: { login: 'JovieInc' },
      ...overrides,
    });

    expect(
      classifyRemediationCandidate(
        candidate({ mergeStateStatus: 'BEHIND' }),
        'JovieInc/Jovie',
        []
      )
    ).toMatchObject({ reasons: ['branch_behind'] });
    expect(
      classifyRemediationCandidate(
        candidate({ mergeable: 'CONFLICTING', mergeStateStatus: 'DIRTY' }),
        'JovieInc/Jovie',
        []
      )
    ).toMatchObject({ reasons: ['merge_conflict'] });
    expect(
      classifyRemediationCandidate(
        candidate({
          mergeable: 'CONFLICTING',
          mergeStateStatus: 'DIRTY',
          labels: [{ name: 'needs-conflict-resolution' }],
        }),
        'JovieInc/Jovie',
        []
      )
    ).toMatchObject({ reasons: ['merge_conflict'] });
    expect(
      classifyRemediationCandidate(candidate(), 'JovieInc/Jovie', ['PR Ready'])
    ).toMatchObject({ reasons: ['required_checks_failed'] });
    expect(
      classifyRemediationCandidate(
        candidate(),
        'JovieInc/Jovie',
        [],
        ['enroll']
      )
    ).toMatchObject({
      reasons: ['control_plane_checks_failed'],
      controlPlaneFailures: ['enroll'],
    });
    expect(
      classifyRemediationCandidate(candidate(), 'JovieInc/Jovie', [])
    ).toBeNull();

    for (const excluded of [
      { isDraft: true },
      { baseRefName: 'release' },
      { headRefName: 'human/manual-fix' },
      { headRefName: 'dependabot/npm_and_yarn/example' },
      ...[
        'blocked',
        'fast',
        'gated',
        'hold',
        'human-review-required',
        'needs-human',
        'needs-human-review',
        'needs-human-taste',
        'needs:taste',
        'needs-manual-rebase',
        'no-auto',
        'queue-deferred',
        'risk:high',
        'taste',
      ].map(name => ({ labels: [{ name }] })),
      { headRepositoryOwner: { login: 'fork-owner' } },
      { isCrossRepository: true },
      { headRepository: { nameWithOwner: 'JovieInc/another-repo' } },
      {
        nativeQueueState: {
          headRefOid: 'a'.repeat(40),
          queued: true,
          autoMergeEnabled: true,
        },
      },
    ]) {
      expect(
        classifyRemediationCandidate(
          candidate({ mergeStateStatus: 'BEHIND', ...excluded }),
          'JovieInc/Jovie',
          []
        )
      ).toBeNull();
    }
  });

  it('keeps terminal controller failures actionable without making them product gates', () => {
    const controllerStatus = overrides => ({
      context: 'jovie-gem-queue-remediation/v1',
      state: 'failure',
      updated_at: '2026-08-18T00:00:00Z',
      creator: { type: 'Bot', login: 'jovie-bot[bot]' },
      target_url: 'https://github.com/JovieInc/Jovie/actions/runs/123',
      ...overrides,
    });
    expect(
      extractTerminalControlPlaneFailures([
        {
          name: 'enroll',
          workflow: 'Merge Queue Auto-Enroll',
          bucket: 'fail',
          state: 'FAILURE',
        },
        {
          name: 'PR Ready',
          workflow: 'CI',
          bucket: 'fail',
          state: 'FAILURE',
        },
      ])
    ).toEqual(['enroll']);

    expect(
      extractExactHeadControllerFailures(
        {
          statuses: [
            controllerStatus(),
            controllerStatus({
              state: 'success',
              updated_at: '2026-08-18T00:01:00Z',
            }),
          ],
        },
        'JovieInc/Jovie'
      )
    ).toEqual([]);
    expect(
      extractExactHeadControllerFailures(
        {
          statuses: [controllerStatus({ updated_at: '2026-08-18T00:02:00Z' })],
        },
        'JovieInc/Jovie'
      )
    ).toEqual(['jovie-gem-queue-remediation/v1']);
    for (const untrusted of [
      controllerStatus({ creator: { type: 'Bot', login: 'other-bot[bot]' } }),
      controllerStatus({
        target_url: 'https://github.com/Other/Repo/actions/runs/123',
      }),
      controllerStatus({ target_url: 'https://example.com/actions/runs/123' }),
    ]) {
      expect(
        extractExactHeadControllerFailures(
          { statuses: [untrusted] },
          'JovieInc/Jovie'
        )
      ).toEqual([]);
    }
  });

  it('treats bucket=fail as terminal like drain-pr-queue.sh', () => {
    expect(
      isTerminalFailure({ bucket: 'fail', state: 'SUCCESS', name: 'PR Ready' })
    ).toBe(true);
    expect(
      isTerminalFailure({ bucket: 'pass', state: 'FAILURE', name: 'Typecheck' })
    ).toBe(true);
    expect(
      isTerminalFailure({ bucket: 'pending', state: 'QUEUED', name: 'Build' })
    ).toBe(false);
  });

  it('normalizes check names from workflow/description fallbacks', () => {
    expect(normalizeCheckName({ workflow: 'Guardrails (proxy)' })).toBe(
      'Guardrails (proxy)'
    );
    expect(
      extractTerminalFailures([
        {
          bucket: 'fail',
          workflow: 'Guardrails (proxy)',
          description: 'version-stamp',
        },
      ])
    ).toEqual(['Guardrails (proxy)']);
  });

  it('filters advisory checks', () => {
    expect(
      extractTerminalFailures([
        { bucket: 'fail', name: 'Preview Deploy' },
        { bucket: 'fail', name: 'Typecheck' },
      ])
    ).toEqual(['Typecheck']);
  });

  it('keeps fleet-queue-hold receipts out of product gate classification', () => {
    const required = [
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Ready' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Migration Guard' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Fork PR Gate' },
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Size Guard' },
    ];
    expect(
      classifyQueueCheckBlockers([
        ...required,
        {
          bucket: 'pending',
          state: 'PENDING',
          name: 'jovie-fleet-queue-hold/v1',
        },
        {
          bucket: 'fail',
          state: 'FAILURE',
          name: 'jovie-fleet-queue-hold/v1',
        },
      ])
    ).toEqual([]);
  });

  it('keeps failed merge-queue controller receipts out of product gate classification', () => {
    const required = [
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Ready' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Migration Guard' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Fork PR Gate' },
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Size Guard' },
    ];
    const controllerFailure = {
      bucket: 'fail',
      state: 'FAILURE',
      name: 'enroll',
      workflow: 'Merge Queue Auto-Enroll',
    };

    expect(isAdvisoryCheck(controllerFailure)).toBe(true);
    expect(
      classifyQueueCheckBlockers([...required, controllerFailure])
    ).toEqual([]);
    // A generic job name is not an allow-list escape hatch for a new safety
    // check in another workflow.
    expect(
      classifyQueueCheckBlockers([
        ...required,
        { ...controllerFailure, workflow: 'Real Safety Workflow' },
      ])
    ).toEqual(['enroll']);
  });

  it('keeps an exact-head Gem failure receipt advisory while required gates stay authoritative', () => {
    const required = [
      'PR Ready',
      'Migration Guard',
      'Fork PR Gate',
      'PR Size Guard',
    ].map(name => ({ name, bucket: 'pass', state: 'SUCCESS' }));
    expect(
      classifyQueueCheckBlockers([
        ...required,
        {
          name: 'jovie-gem-queue-remediation/v1',
          bucket: 'fail',
          state: 'FAILURE',
        },
      ])
    ).toEqual([]);
  });

  it('treats a red Fork PR Gate Controller receipt with SKIPPED twin as advisory (JOV-4782)', () => {
    const required = [
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Ready' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Migration Guard' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Fork PR Gate' },
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Size Guard' },
    ];
    // pull_request-event run fails at create-github-app-token (no
    // JOVIE_BOT_PRIVATE_KEY); pull_request_target run of the same job is
    // SKIPPED for non-fork heads. The red controller receipt must not block
    // enrollment when the required gates are green.
    const controllerReceipts = [
      {
        bucket: 'fail',
        state: 'FAILURE',
        name: 'Fork PR Gate Controller',
        workflow: 'Fork PR Gate',
        startedAt: '2026-08-03T01:00:00Z',
        completedAt: '2026-08-03T01:01:00Z',
      },
      {
        bucket: 'skipping',
        state: 'SKIPPED',
        name: 'Fork PR Gate Controller',
        workflow: 'Fork PR Gate',
        startedAt: '2026-08-03T01:02:00Z',
        completedAt: '2026-08-03T01:02:00Z',
      },
    ];

    expect(
      classifyQueueCheckBlockers([...required, ...controllerReceipts])
    ).toEqual([]);

    // The actual gate is the required `Fork PR Gate` commit status: it stays
    // fail-closed, so the advisory receipt never smuggles a red fork gate.
    expect(
      classifyQueueCheckBlockers([
        { bucket: 'pass', state: 'SUCCESS', name: 'PR Ready' },
        { bucket: 'pass', state: 'SUCCESS', name: 'Migration Guard' },
        { bucket: 'fail', state: 'FAILURE', name: 'Fork PR Gate' },
        { bucket: 'pass', state: 'SUCCESS', name: 'PR Size Guard' },
        ...controllerReceipts,
      ])
    ).toEqual(['Fork PR Gate', 'Fork PR Gate (not successful)']);
  });

  it('derives staged advisory evidence from the manifest and preserves safety gates', () => {
    const harness = JSON.parse(
      readFileSync(`${repoRoot}/.github/ci-harness/manifest.json`, 'utf8')
    );
    const e2eSmoke = harness.jobs.find(
      job => job.name === 'E2E Smoke (manual)'
    );
    const extendedSmoke = harness.jobs.find(
      job => job.name === 'Extended Smoke (manual)'
    );

    expect(e2eSmoke?.mergeGate).toBe(false);
    expect(extendedSmoke?.mergeGate).toBe(false);
    expect(MERGE_GATE_CHECK_NAMES).toEqual([
      'Path Changes',
      'ci-fast',
      'CI Risk Classifier',
      'Secret Scan (gitleaks + trufflehog)',
      'Golden Path Lock',
      'Migration Guard',
    ]);
    expect(ADVISORY_CHECK_NAMES).toContain('Preview Deploy');
    expect(ADVISORY_CHECK_NAMES).toContain(
      'A11y (authenticated, informational)'
    );
    expect(ADVISORY_CHECK_NAMES).not.toContain('Gitleaks Secret Scanning');
    expect(ADVISORY_CHECK_NAMES).not.toContain('TruffleHog Secret Scanning');
    expect(ADVISORY_CHECK_NAMES).toContain('Verify Draft Agent PR');
    expect(ADVISORY_CHECK_NAMES).toContain('Preview Deploy (PR)');
    expect(ADVISORY_CHECK_NAMES).toContain('E2E Smoke (PR Fast Feedback)');
    expect(ADVISORY_CHECK_NAMES).toContain('Extended Smoke (Preview)');
    expect(ADVISORY_CHECK_NAMES).toContain('Classify PR taste');
    expect(ADVISORY_CHECK_NAMES).toContain('Claude Review');
    expect(ADVISORY_CHECK_NAMES).toContain(
      'Capture changed UI (desktop + mobile) (advisory)'
    );
    expect(ADVISORY_CHECK_NAMES).toContain(
      'Review screenshots and post advisory review'
    );
    expect(ADVISORY_CHECK_NAMES).toContain('SonarCloud Code Analysis');
    expect(ADVISORY_CHECK_NAMES).toContain('Vercel Agent Review');
    expect(ADVISORY_CHECK_NAMES).toContain('Fork PR Gate Controller');
    expect(ADVISORY_CHECK_NAMES).toContain('jovie-fleet-queue-hold/v1');
    expect(ADVISORY_CHECK_NAMES).not.toContain('Fork PR Gate');
    expect(ADVISORY_CHECK_NAMES).not.toContain('Brand Scrub');
    expect(
      extractTerminalFailures([
        { bucket: 'fail', name: 'Preview Deploy' },
        { bucket: 'fail', name: 'Preview Deploy (PR)' },
        { bucket: 'fail', name: 'Security Advisory Enforcement' },
        { bucket: 'fail', name: 'Gitleaks Secret Scanning' },
        { bucket: 'fail', name: 'Verify Draft Agent PR' },
        { bucket: 'fail', name: 'E2E Smoke (PR Fast Feedback)' },
        { bucket: 'fail', name: 'Extended Smoke (Preview)' },
        { bucket: 'fail', name: 'A11y (authenticated, informational)' },
        {
          bucket: 'fail',
          name: 'Capture changed UI (desktop + mobile) (advisory)',
        },
        { bucket: 'fail', name: 'Review screenshots and post advisory review' },
        { bucket: 'fail', name: 'SonarCloud Code Analysis' },
        { bucket: 'fail', name: 'Vercel Agent Review' },
      ])
    ).toEqual(['Gitleaks Secret Scanning', 'Security Advisory Enforcement']);
  });

  it('blocks pending and missing required or canonical gates', () => {
    const checks = [
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Ready' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Migration Guard' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Fork PR Gate' },
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Size Guard' },
      {
        bucket: 'pending',
        state: 'IN_PROGRESS',
        name: 'E2E Smoke (PR Fast Feedback)',
      },
    ];

    expect(classifyQueueCheckBlockers(checks)).toEqual([]);
    expect(
      classifyQueueCheckBlockers(
        checks.filter(check => check.name !== 'PR Ready')
      )
    ).toContain('PR Ready (missing)');
  });

  it('keeps opt-in Extended Smoke outside queue readiness', () => {
    const checks = [
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Ready' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Migration Guard' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Fork PR Gate' },
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Size Guard' },
      {
        bucket: 'pending',
        state: 'IN_PROGRESS',
        name: 'Extended Smoke (Preview)',
      },
      {
        bucket: 'fail',
        state: 'FAILURE',
        name: 'A11y (authenticated, informational)',
      },
    ];

    expect(classifyQueueCheckBlockers(checks)).toEqual([]);
  });

  it('fails closed on every unknown or non-advisory terminal red check', () => {
    const required = [
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Ready' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Migration Guard' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Fork PR Gate' },
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Size Guard' },
    ];

    expect(
      classifyQueueCheckBlockers([
        ...required,
        { bucket: 'fail', state: 'FAILURE', name: 'Brand Scrub' },
        { bucket: 'fail', state: 'FAILURE', name: 'Future Safety Gate' },
        { bucket: 'fail', state: 'FAILURE', name: 'Claude Review' },
      ])
    ).toEqual(['Brand Scrub', 'Future Safety Gate']);
  });

  it('duplicate SKIPPED checks with equal timestamps do not block enrollment', () => {
    const required = [
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Ready' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Migration Guard' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Fork PR Gate' },
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Size Guard' },
    ];
    const skippedDupes = [
      {
        bucket: 'skipping',
        state: 'SKIPPED',
        name: 'Fork PR Gate Dependabot Controller',
        startedAt: '2026-07-21T02:12:55Z',
        completedAt: '2026-07-21T02:12:54Z',
      },
      {
        bucket: 'skipping',
        state: 'SKIPPED',
        name: 'Fork PR Gate Dependabot Controller',
        startedAt: '2026-07-21T02:12:55Z',
        completedAt: '2026-07-21T02:12:54Z',
      },
      {
        bucket: 'skipping',
        state: 'SKIPPED',
        name: "github.event_name == 'merge_group' && 'Fork PR Gate' || 'Fork PR Gate (merge-group inactive)'",
        startedAt: '2026-07-21T02:12:55Z',
        completedAt: '2026-07-21T02:12:54Z',
      },
      {
        bucket: 'skipping',
        state: 'SKIPPED',
        name: "github.event_name == 'merge_group' && 'Fork PR Gate' || 'Fork PR Gate (merge-group inactive)'",
        startedAt: '2026-07-21T02:12:55Z',
        completedAt: '2026-07-21T02:12:54Z',
      },
    ];
    expect(classifyQueueCheckBlockers([...required, ...skippedDupes])).toEqual(
      []
    );
    expect(collapseNewestCheckAttempts(skippedDupes).ambiguousNames).toEqual(
      []
    );
  });

  it('uses only the uniquely newest same-name check attempt', () => {
    const required = [
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Ready' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Migration Guard' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Fork PR Gate' },
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Size Guard' },
    ];
    const oldFailure = {
      bucket: 'fail',
      state: 'FAILURE',
      name: 'E2E Smoke (PR Fast Feedback)',
      startedAt: '2026-07-12T01:00:00Z',
      completedAt: '2026-07-12T01:01:00Z',
    };
    const newerSuccess = {
      bucket: 'pass',
      state: 'SUCCESS',
      name: 'E2E Smoke (PR Fast Feedback)',
      startedAt: '2026-07-12T01:02:00Z',
      completedAt: '2026-07-12T01:03:00Z',
    };

    expect(
      classifyQueueCheckBlockers([...required, oldFailure, newerSuccess])
    ).toEqual([]);

    const oldSuccess = { ...newerSuccess, startedAt: '2026-07-12T01:00:00Z' };
    const newerPending = {
      bucket: 'pending',
      state: 'IN_PROGRESS',
      name: 'E2E Smoke (PR Fast Feedback)',
      startedAt: '2026-07-12T01:04:00Z',
      completedAt: '0001-01-01T00:00:00Z',
    };
    expect(
      classifyQueueCheckBlockers([...required, oldSuccess, newerPending])
    ).toEqual([]);

    expect(
      collapseNewestCheckAttempts([
        { ...oldFailure, startedAt: '' },
        newerSuccess,
      ]).ambiguousNames
    ).toEqual(['E2E Smoke (PR Fast Feedback)']);

    expect(
      collapseNewestCheckAttempts([
        {
          bucket: 'skipping',
          state: 'SKIPPED',
          name: 'Fork PR Gate',
          startedAt: '2026-07-12T12:26:42Z',
          completedAt: '2026-07-12T12:26:36Z',
        },
        {
          bucket: 'pass',
          state: 'SUCCESS',
          name: 'Fork PR Gate',
          startedAt: '2026-07-12T12:26:39Z',
          completedAt: '2026-07-12T12:26:46Z',
        },
      ]).checks
    ).toEqual([
      expect.objectContaining({ name: 'Fork PR Gate', state: 'SUCCESS' }),
    ]);

    const requiredWithoutForkGate = required.filter(
      check => check.name !== 'Fork PR Gate'
    );
    const forkGateSuccess = {
      bucket: 'pass',
      state: 'SUCCESS',
      name: 'Fork PR Gate',
      startedAt: '2026-07-13T08:34:09Z',
      completedAt: '2026-07-13T08:34:16Z',
    };
    const skippedForkGateAttempts = [
      {
        bucket: 'skipping',
        state: 'SKIPPED',
        name: 'Fork PR Gate',
        startedAt: '2026-07-13T08:49:01Z',
        completedAt: '2026-07-13T08:49:00Z',
      },
      {
        bucket: 'skipping',
        state: 'SKIPPED',
        name: 'Fork PR Gate',
        startedAt: '2026-07-13T08:49:08Z',
        completedAt: '2026-07-13T08:49:00Z',
      },
    ];
    expect(
      classifyQueueCheckBlockers([
        ...requiredWithoutForkGate,
        forkGateSuccess,
        ...skippedForkGateAttempts,
      ])
    ).toEqual([]);

    const newerForkGateFailure = {
      bucket: 'fail',
      state: 'FAILURE',
      name: 'Fork PR Gate',
      startedAt: '2026-07-13T08:50:00Z',
      completedAt: '2026-07-13T08:50:10Z',
    };
    expect(
      classifyQueueCheckBlockers([
        ...requiredWithoutForkGate,
        forkGateSuccess,
        ...skippedForkGateAttempts,
        newerForkGateFailure,
      ])
    ).toEqual(['Fork PR Gate', 'Fork PR Gate (not successful)']);

    const newerForkGatePending = {
      bucket: 'pending',
      state: 'IN_PROGRESS',
      name: 'Fork PR Gate',
      startedAt: '2026-07-13T08:50:00Z',
      completedAt: '0001-01-01T00:00:00Z',
    };
    expect(
      classifyQueueCheckBlockers([
        ...requiredWithoutForkGate,
        forkGateSuccess,
        ...skippedForkGateAttempts,
        newerForkGatePending,
      ])
    ).toEqual(['Fork PR Gate (not successful)', 'Fork PR Gate (pending)']);

    expect(
      classifyQueueCheckBlockers([
        ...requiredWithoutForkGate,
        ...skippedForkGateAttempts,
      ])
    ).toEqual(['Fork PR Gate (not successful)']);
    expect(
      classifyQueueCheckBlockers([
        ...required,
        oldFailure,
        {
          ...newerSuccess,
          startedAt: oldFailure.startedAt,
          completedAt: oldFailure.completedAt,
        },
      ])
    ).toEqual([]);
  });

  it('keeps queue scripts on the shared exact policy and auto-ready fail-closed', () => {
    const autoReady = readFileSync(
      `${repoRoot}/scripts/auto-ready-agent-drafts.sh`,
      'utf8'
    );
    const drain = readFileSync(`${repoRoot}/scripts/drain-pr-queue.sh`, 'utf8');

    for (const source of [autoReady, drain]) {
      expect(source).toMatch(/--classify-(?:auto-ready|queue)/);
      expect(source).not.toMatch(
        /test\(["']advisory\|Preview Deploy\|Slop Gate/i
      );
      expect(source).not.toMatch(/Verify Draft\|E2E Smoke/);
    }

    expect(autoReady).toContain('--classify-auto-ready');
    expect(autoReady).not.toContain('Verify Draft Agent PR');
    expect(autoReady).not.toContain('dependabot/');
    expect(drain).toContain(`fail='["required check status unavailable"]'`);
    expect(drain).not.toContain("fail='[]'");
  });

  it('recognizes agent branches used by drain AGENT_RE', () => {
    expect(isAgentBranch('codex/gh-12734-fix')).toBe(true);
    expect(isAgentBranch('tim/jov-1234')).toBe(true);
    expect(isAgentBranch('agent/wave-1')).toBe(true);
    expect(isAgentBranch('feature/user-auth')).toBe(false);
    expect(AGENT_BRANCH_RE.test('feat/onboarding')).toBe(true);
  });

  it('marks checks systemic at the shared-failure threshold', () => {
    const failCountByCheck = {
      'Guardrails (proxy)': 5,
      Typecheck: 2,
    };
    const systemicChecks = Object.entries(failCountByCheck)
      .filter(([, count]) => count >= 3)
      .map(([check, count]) => ({ check, count }));
    expect(systemicChecks).toEqual([{ check: 'Guardrails (proxy)', count: 5 }]);
  });
});
