import { describe, expect, it } from 'vitest';
import { isAgentBranch } from '../agent-branch.mjs';
import {
  extractTerminalFailureNames,
  isTerminalFailureCheck,
} from '../ci-check-failures.mjs';
import {
  buildRemediationPlan,
  classifyRemediationCandidate,
  hasRecentDrainRebase,
} from '../drain-pr-remediate.mjs';
import {
  buildPrFailureEntry,
  detectSystemicChecks,
  formatSystemicSummary,
} from '../systemic-failures.mjs';

function pr(overrides) {
  return {
    number: 1,
    title: 'Example',
    isDraft: false,
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'BEHIND',
    baseRefName: 'main',
    headRefName: 'codex/jov-123',
    headRepositoryOwner: { login: 'JovieInc' },
    isCrossRepository: false,
    labels: [],
    statusCheckRollup: [],
    updatedAt: '2026-07-01T00:00:00Z',
    commitsBehindBase: 3,
    ...overrides,
  };
}

describe('agent branch detection', () => {
  it('matches drain-pr-queue agent prefixes', () => {
    expect(isAgentBranch('tim/jov-1')).toBe(true);
    expect(isAgentBranch('codex/gh-12734')).toBe(true);
    expect(isAgentBranch('agent/foo')).toBe(true);
    expect(isAgentBranch('feat/bar')).toBe(true);
    expect(isAgentBranch('integration/loop-ui')).toBe(false);
    expect(isAgentBranch('gtmq_spec_abc')).toBe(false);
  });
});

describe('terminal required-check failures', () => {
  it('counts bucket=fail and terminal states like drain-pr-queue.sh', () => {
    const names = extractTerminalFailureNames([
      { name: 'CI / Guardrails (proxy)', bucket: 'fail' },
      { name: 'Preview Deploy', bucket: 'fail' },
      { name: 'Typecheck', state: 'TIMED_OUT' },
      { name: 'Unit Tests', state: 'SUCCESS' },
      { name: 'Lint', state: 'PENDING' },
    ]);
    expect(names).toEqual(['CI / Guardrails (proxy)', 'Typecheck']);
    expect(isTerminalFailureCheck({ state: 'failure' })).toBe(true);
    expect(isTerminalFailureCheck({ state: 'PENDING' })).toBe(false);
  });
});

describe('systemic failure detection', () => {
  it('flags checks failing on 3+ agent PRs', () => {
    const entries = [
      buildPrFailureEntry(pr({ number: 1 }), [
        { name: 'CI / Guardrails (proxy)', bucket: 'fail' },
      ]),
      buildPrFailureEntry(pr({ number: 2 }), [
        { name: 'CI / Guardrails (proxy)', bucket: 'fail' },
      ]),
      buildPrFailureEntry(pr({ number: 3 }), [
        { name: 'CI / Guardrails (proxy)', bucket: 'fail' },
      ]),
      buildPrFailureEntry(pr({ number: 4, headRefName: 'human/feature' }), [
        { name: 'CI / Guardrails (proxy)', bucket: 'fail' },
      ]),
    ];
    const systemic = detectSystemicChecks(entries);
    expect(systemic).toHaveLength(1);
    expect(systemic[0].count).toBe(3);
    expect(formatSystemicSummary(systemic)).toContain('Guardrails (proxy)');
  });
});

describe('drain remediation candidates', () => {
  it('rebases behind-base agent PRs with stale required failures', () => {
    const verdict = classifyRemediationCandidate(
      pr({
        statusCheckRollup: [
          { name: 'CI / Guardrails (proxy)', bucket: 'fail' },
        ],
      }),
      { requiredFailures: ['CI / Guardrails (proxy)'] }
    );
    expect(verdict.eligible).toBe(true);
  });

  it('skips current branches with PR-local failures', () => {
    const verdict = classifyRemediationCandidate(
      pr({
        mergeStateStatus: 'BLOCKED',
        commitsBehindBase: 0,
        statusCheckRollup: [
          { name: 'CI / PR Ready', bucket: 'fail' },
        ],
      }),
      { requiredFailures: ['CI / PR Ready'] }
    );
    expect(verdict.eligible).toBe(false);
    expect(verdict.reason).toContain('current with base');
  });

  it('respects drain-rebased cooldown', () => {
    expect(
      hasRecentDrainRebase(
        pr({
          labels: [{ name: 'drain-rebased' }],
          updatedAt: new Date().toISOString(),
        })
      )
    ).toBe(true);
  });

  it('caps planned rebases per run', () => {
    const prs = [1, 2, 3, 4].map(number =>
      pr({
        number,
        headRefName: `codex/pr-${number}`,
        commitsBehindBase: 2,
      })
    );
    const requiredFailuresByPr = new Map(
      prs.map(item => [item.number, ['CI / Guardrails (proxy)']])
    );
    const plan = buildRemediationPlan(prs, {
      maxRebases: 2,
      requiredFailuresByPr,
    });
    expect(plan.candidates).toHaveLength(2);
    expect(plan.deferred).toHaveLength(2);
    expect(plan.summary.planned).toBe(2);
  });
});