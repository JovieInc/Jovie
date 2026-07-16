import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ADVISORY_CHECK_NAMES,
  AGENT_BRANCH_RE,
  classifyQueueCheckBlockers,
  collapseNewestCheckAttempts,
  extractTerminalFailures,
  isAgentBranch,
  isTerminalFailure,
  normalizeCheckName,
} from '../pr-check-failures.mjs';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

describe('pr-check-failures', () => {
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

  it('uses an exact advisory allowlist and preserves canonical gates', () => {
    const harness = JSON.parse(
      readFileSync(`${repoRoot}/.github/ci-harness/manifest.json`, 'utf8')
    );
    const e2eSmoke = harness.jobs.find(
      job => job.name === 'E2E Smoke (PR Fast Feedback)'
    );
    const extendedSmoke = harness.jobs.find(
      job => job.name === 'Extended Smoke (Preview)'
    );

    expect(e2eSmoke?.mergeGate).toBe(true);
    expect(extendedSmoke?.mergeGate).toBe(true);
    expect(ADVISORY_CHECK_NAMES).toContain('Preview Deploy');
    expect(ADVISORY_CHECK_NAMES).toContain(
      'A11y (authenticated, informational)'
    );
    expect(ADVISORY_CHECK_NAMES).not.toContain('Gitleaks Secret Scanning');
    expect(ADVISORY_CHECK_NAMES).not.toContain('TruffleHog Secret Scanning');
    expect(ADVISORY_CHECK_NAMES).not.toContain('Verify Draft Agent PR');
    expect(ADVISORY_CHECK_NAMES).not.toContain('E2E Smoke (PR Fast Feedback)');
    expect(ADVISORY_CHECK_NAMES).not.toContain('Extended Smoke (Preview)');
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
      ])
    ).toEqual([
      'E2E Smoke (PR Fast Feedback)',
      'Extended Smoke (Preview)',
      'Gitleaks Secret Scanning',
      'Preview Deploy (PR)',
      'Security Advisory Enforcement',
      'Verify Draft Agent PR',
    ]);
  });

  it('blocks pending and missing required or canonical gates', () => {
    const checks = [
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Ready' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Migration Guard' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Fork PR Gate' },
      { bucket: 'pass', state: 'SUCCESS', name: 'PR Size Guard' },
      { bucket: 'pass', state: 'SUCCESS', name: 'Verify Draft Agent PR' },
      {
        bucket: 'pending',
        state: 'IN_PROGRESS',
        name: 'E2E Smoke (PR Fast Feedback)',
      },
    ];

    expect(classifyQueueCheckBlockers(checks)).toEqual([
      'E2E Smoke (PR Fast Feedback) (not complete)',
      'E2E Smoke (PR Fast Feedback) (pending)',
    ]);
    expect(
      classifyQueueCheckBlockers(checks, { requireVerifyDraft: true })
    ).toEqual([
      'E2E Smoke (PR Fast Feedback) (not complete)',
      'E2E Smoke (PR Fast Feedback) (pending)',
    ]);

    expect(
      classifyQueueCheckBlockers(
        checks.filter(check => check.name !== 'PR Ready')
      )
    ).toContain('CI / PR Ready (missing)');
  });

  it('keeps Extended Smoke pending until the testing evidence completes', () => {
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

    expect(classifyQueueCheckBlockers(checks)).toEqual([
      'Extended Smoke (Preview) (not complete)',
      'Extended Smoke (Preview) (pending)',
    ]);
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
    ).toEqual([
      'E2E Smoke (PR Fast Feedback) (not complete)',
      'E2E Smoke (PR Fast Feedback) (pending)',
    ]);

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
    ).toContain('E2E Smoke (PR Fast Feedback) (ambiguous latest attempt)');
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
    expect(autoReady).not.toContain('dependabot/');
    expect(drain).toContain(`fail='["required check status unavailable"]'`);
    expect(drain).not.toContain("fail='[]'");
  });

  it('recognizes agent branches used by drain AGENT_RE', () => {
    expect(isAgentBranch('codex/gh-12734-fix')).toBe(true);
    expect(isAgentBranch('tim/jov-1234')).toBe(true);
    expect(isAgentBranch('agent/wave-1')).toBe(true);
    expect(isAgentBranch('gtmq_spec_abc')).toBe(false);
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
