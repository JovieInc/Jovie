import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ADVISORY_CHECK_NAMES,
  AGENT_BRANCH_RE,
  classifyQueueCheckBlockers,
  collapseNewestCheckAttempts,
  extractTerminalFailures,
  fetchRequiredCheckFailures,
  isAdvisoryCheck,
  isAgentBranch,
  isHardGated,
  isTerminalFailure,
  MERGE_GATE_CHECK_NAMES,
  normalizeCheckName,
} from '../pr-check-failures.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

describe('pr-check-failures', () => {
  it('treats legacy human labels as inert while preserving machine holds', () => {
    expect(isHardGated(['needs-human', 'no-auto', 'needs:taste'])).toBe(false);
    expect(isHardGated(['hold'])).toBe(true);
    expect(isHardGated([{ name: 'gated' }])).toBe(true);
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

  it('keeps failed fleet-refresh receipts out of product gate classification', () => {
    const required = [
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Ready' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Migration Guard' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Fork PR Gate' },
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Size Guard' },
    ];
    const fleetRefreshFailure = {
      bucket: 'fail',
      state: 'FAILURE',
      name: 'Refresh persisted fleet gate receipt',
      workflow: 'Fleet Gate Refresh',
    };

    expect(isAdvisoryCheck(fleetRefreshFailure)).toBe(true);
    expect(
      classifyQueueCheckBlockers([...required, fleetRefreshFailure])
    ).toEqual([]);
    // The workflow exception cannot hide a real required-gate failure.
    expect(
      classifyQueueCheckBlockers([
        ...required.filter(check => check.name !== 'PR Ready'),
        { bucket: 'fail', state: 'FAILURE', name: 'PR Ready' },
        fleetRefreshFailure,
      ])
    ).toEqual(['PR Ready', 'PR Ready (not successful)']);
  });

  describe('ownerless recovery workflow admission', () => {
    const required = [
      'PR Ready',
      'Migration Guard',
      'Fork PR Gate',
      'PR Size Guard',
    ].map(name => ({
      name,
      bucket: 'pass',
      state: 'SUCCESS',
    }));
    const sweep = {
      name: 'sweep',
      workflow: 'Ownerless Recovery Sweep',
      bucket: 'fail',
      state: 'FAILURE',
    };

    it('ignores the operational workflow only with all required contexts green', () => {
      expect(classifyQueueCheckBlockers([...required, sweep])).toEqual([]);
      for (const workflow of ['Real Safety Workflow', undefined]) {
        expect(
          classifyQueueCheckBlockers([...required, { ...sweep, workflow }])
        ).toEqual(['sweep']);
      }
      expect(ADVISORY_CHECK_NAMES).not.toContain('sweep');
    });

    it('does not erase an older safety failure with a newer advisory job of the same name', () => {
      for (const workflow of ['Real Safety Workflow', undefined]) {
        const older = {
          ...sweep,
          workflow,
          startedAt: '2026-09-04T23:00:00Z',
          completedAt: '2026-09-04T23:01:00Z',
        };
        const newer = {
          ...sweep,
          startedAt: '2026-09-04T23:02:00Z',
          completedAt: '2026-09-04T23:03:00Z',
        };
        for (const attempts of [
          [older, newer],
          [newer, older],
        ]) {
          expect(
            classifyQueueCheckBlockers([...required, ...attempts])
          ).toEqual(['sweep']);
          expect(collapseNewestCheckAttempts(attempts).checks).toHaveLength(2);
        }
      }
    });

    it.each([
      'missing',
      'equal',
    ])('retains advisory identity through %s timestamp ambiguity', timestamps => {
      const clock =
        timestamps === 'equal'
          ? {
              startedAt: '2026-09-04T23:00:00Z',
              completedAt: '2026-09-04T23:01:00Z',
            }
          : {};
      const attempts = [
        { ...sweep, ...clock },
        { ...sweep, ...clock, bucket: 'pass', state: 'SUCCESS' },
      ];
      expect(collapseNewestCheckAttempts(attempts).ambiguousNames).toEqual([
        'sweep',
      ]);
      expect(classifyQueueCheckBlockers([...required, ...attempts])).toEqual(
        []
      );
      const safety = attempts.map(check => ({
        ...check,
        workflow: 'Real Safety Workflow',
      }));
      expect(
        classifyQueueCheckBlockers([...required, ...attempts, ...safety])
      ).toContain('sweep (ambiguous latest attempt)');
      for (const { name } of required) {
        const others = required.filter(check => check.name !== name);
        expect(
          classifyQueueCheckBlockers([
            ...others,
            ...attempts.map(check => ({ ...check, name })),
          ])
        ).toContain(`${name} (ambiguous latest attempt)`);
      }
    });

    it('does not make another job in the recovery workflow advisory', () => {
      const safety = { ...sweep, name: 'Release Safety Gate' };
      expect(isAdvisoryCheck(safety)).toBe(false);
      expect(classifyQueueCheckBlockers([...required, sweep, safety])).toEqual([
        'Release Safety Gate',
      ]);
    });

    it.each(
      required.map(check => check.name)
    )('never filters required %s from failure extraction', name => {
      for (const workflow of [
        sweep.workflow,
        'Merge Queue Auto-Enroll',
        'Fleet Gate Refresh',
      ]) {
        const failure = { ...sweep, name, workflow };
        expect(isAdvisoryCheck(failure)).toBe(false);
        expect(extractTerminalFailures([failure])).toEqual([name]);
      }
    });

    it('preserves required-only CLI failures for both JSON success and nonzero results', async () => {
      const root = mkdtempSync(join(tmpdir(), 'jovie-required-checks-'));
      const previousPath = process.env.PATH;
      const failures = required.map(check => ({
        ...check,
        workflow: sweep.workflow,
        bucket: 'fail',
        state: 'FAILURE',
      }));
      try {
        process.env.PATH = `${root}${delimiter}${previousPath ?? ''}`;
        for (const exit of [0, 1]) {
          const gh = join(root, 'gh');
          writeFileSync(
            gh,
            `#!/bin/sh\n[ "$1 $2 $4" = "pr checks --required" ] || exit 99\nprintf '%s\n' '${JSON.stringify(failures)}'\nexit ${exit}\n`
          );
          chmodSync(gh, 0o700);
          expect(await fetchRequiredCheckFailures('example/repo', 123)).toEqual(
            required.map(check => check.name).sort()
          );
        }
      } finally {
        if (previousPath === undefined) delete process.env.PATH;
        else process.env.PATH = previousPath;
        rmSync(root, { recursive: true, force: true });
      }
    });

    it.each(
      required.map(check => check.name)
    )('preserves required failure, missing and pending for %s', name => {
      const others = required.filter(check => check.name !== name);
      for (const workflow of ['CI', sweep.workflow]) {
        expect(
          classifyQueueCheckBlockers([
            ...others,
            sweep,
            { name, workflow, bucket: 'fail', state: 'FAILURE' },
          ])
        ).toContain(`${name} (not successful)`);
      }
      expect(classifyQueueCheckBlockers([...others, sweep])).toContain(
        `${name} (missing)`
      );
      expect(
        classifyQueueCheckBlockers([
          ...others,
          sweep,
          { name, bucket: 'pending', state: 'PENDING' },
        ])
      ).toContain(`${name} (pending)`);
    });
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

  it('keeps queue admission exact and auto-ready independent of check completion', () => {
    const autoReady = readFileSync(
      `${repoRoot}/scripts/auto-ready-agent-drafts.sh`,
      'utf8'
    );
    const drain = readFileSync(`${repoRoot}/scripts/drain-pr-queue.sh`, 'utf8');

    for (const source of [autoReady, drain]) {
      expect(source).not.toMatch(
        /test\(["']advisory\|Preview Deploy\|Slop Gate/i
      );
      expect(source).not.toMatch(/Verify Draft\|E2E Smoke/);
    }

    expect(autoReady).toContain('classify_promotion');
    expect(autoReady).not.toContain('--classify-auto-ready');
    expect(autoReady).not.toContain('check_failures_for_pr');
    expect(autoReady).not.toContain('Verify Draft Agent PR');
    expect(autoReady).not.toContain('dependabot/');
    expect(drain).toContain('--classify-queue');
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
