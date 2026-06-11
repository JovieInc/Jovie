import { describe, expect, it } from 'vitest';
import {
  buildAgentPrompt,
  buildDispatchPlans,
  buildGbrainCaptureText,
  CODEX_BLOCKED_LABEL,
  CODEX_CLAIM_LABEL,
  eligibleCodexIssues,
  HUMAN_REVIEW_LABEL,
  selectTaskRoute,
  shellQuote,
} from '../../hermes/lib/codex-issue-shipper.ts';

const config = {
  maxIssuesPerRun: 2,
  integrationThreshold: 3,
  simpleModel: 'cheap-model',
  standardModel: 'standard-model',
  escalationModel: 'escalation-model',
  fallbackModel: 'fallback-model',
};

function issue(overrides = {}) {
  return {
    number: 123,
    title: 'Fix dashboard copy',
    body: 'Small copy update',
    url: 'https://github.com/JovieInc/Jovie/issues/123',
    updatedAt: '2026-06-11T00:00:00Z',
    labels: [{ name: 'codex' }],
    ...overrides,
  };
}

describe('codex issue shipper planner', () => {
  it('returns no dispatch plans for an empty queue', () => {
    expect(buildDispatchPlans([], config)).toEqual([]);
  });

  it('filters human-gated, claimed, and blocked issues before dispatch', () => {
    const ready = issue({ number: 1, title: 'Fix docs typo' });
    const human = issue({
      number: 2,
      labels: [{ name: 'codex' }, { name: HUMAN_REVIEW_LABEL }],
    });
    const claimed = issue({
      number: 3,
      labels: [{ name: 'codex' }, { name: CODEX_CLAIM_LABEL }],
    });
    const blocked = issue({
      number: 4,
      labels: [{ name: 'codex' }, { name: CODEX_BLOCKED_LABEL }],
    });

    expect(eligibleCodexIssues([ready, human, claimed, blocked])).toEqual([
      ready,
    ]);
    expect(
      buildDispatchPlans([ready, human, claimed, blocked], config)
    ).toHaveLength(1);
  });

  it('uses cheap models for simple work and escalation models for sensitive work', () => {
    const simple = selectTaskRoute(
      issue({ title: 'Docs typo in README' }),
      config
    );
    expect(simple.modelProfile).toBe('simple');
    expect(simple.sessionModel).toBe('cheap-model');

    const sensitive = selectTaskRoute(
      issue({
        title: 'Fix Stripe webhook auth token handling',
        body: 'Touches billing and secrets',
      }),
      config
    );
    expect(sensitive.modelProfile).toBe('escalation');
    expect(sensitive.sessionModel).toBe('escalation-model');
    expect(sensitive.specialistSubagents.map(agent => agent.name)).toContain(
      'security'
    );
  });

  it('uses integration branches for trainable queue pressure but not high-risk work', () => {
    const issues = [
      issue({ number: 1, title: 'Refactor dashboard filter copy' }),
      issue({ number: 2, title: 'Fix docs typo' }),
      issue({ number: 3, title: 'Update test fixture' }),
    ];
    const plans = buildDispatchPlans(issues, config);
    expect(plans[0].integrationBranch).toBe('integration/codex-queue');

    const highRiskPlans = buildDispatchPlans(
      [
        issue({ number: 1, title: 'Fix Clerk auth middleware' }),
        issue({ number: 2, title: 'Fix docs typo' }),
        issue({ number: 3, title: 'Update test fixture' }),
      ],
      config
    );
    expect(highRiskPlans[0].integrationBranch).toBeNull();
  });

  it('respects maxIssuesPerRun', () => {
    const plans = buildDispatchPlans(
      [
        issue({ number: 1, title: 'Fix docs typo' }),
        issue({ number: 2, title: 'Update README' }),
        issue({ number: 3, title: 'Refactor util' }),
      ],
      config
    );

    expect(plans).toHaveLength(2);
    expect(plans.map(plan => plan.issue.number)).toEqual([1, 2]);
  });
});

describe('codex issue shipper prompt', () => {
  it('requires gbrain, gstack, subagents, exhaustive QA, CodeRabbit, and PR evidence', () => {
    const plan = buildDispatchPlans([issue()], config)[0];
    const prompt = buildAgentPrompt({
      issue: plan.issue,
      branchName: plan.branchName,
      baseBranch: 'main',
      integrationBranch: plan.integrationBranch,
      route: plan.route,
      repoRoot: '/repo',
      gbrain: {
        captureSlug: 'ops/codex-issue-shipper/github-123',
        queryText: 'Jovie implementation context',
        queryResult: 'Relevant memory result',
      },
    });

    expect(prompt).toContain('Load gstack');
    expect(prompt).toContain('Use gbrain before planning');
    expect(prompt).toContain('Use subagents');
    expect(prompt).toContain('/qa');
    expect(prompt).toContain('/ship');
    expect(prompt).toContain(
      'coderabbit review --agent -c AGENTS.md -t uncommitted'
    );
    expect(prompt).toContain('Closes #<issue-number>');
    expect(prompt).toContain('Session model: cheap-model');
    expect(prompt).toContain(
      'Captured slug: ops/codex-issue-shipper/github-123'
    );
  });

  it('captures issue body and labels for gbrain', () => {
    const capture = buildGbrainCaptureText(
      issue({
        title: 'Build codex automation',
        body: 'Use gbrain and subagents.',
        labels: [{ name: 'codex' }, { name: 'automation' }],
      })
    );

    expect(capture).toContain('# Codex Issue Shipper Dispatch: GitHub #123');
    expect(capture).toContain('Build codex automation');
    expect(capture).toContain('codex, automation');
    expect(capture).toContain('Use gbrain and subagents.');
  });

  it('shell-quotes integration branch commands in prompts', () => {
    const plan = buildDispatchPlans(
      [
        issue({
          title: "Fix $HOME `backtick` and user's path",
          labels: [{ name: 'codex' }, { name: 'integration-branch' }],
        }),
      ],
      config
    )[0];
    const prompt = buildAgentPrompt({
      issue: plan.issue,
      branchName: plan.branchName,
      baseBranch: 'main',
      integrationBranch: plan.integrationBranch,
      route: plan.route,
      repoRoot: '/repo',
      gbrain: {
        captureSlug: 'ops/codex-issue-shipper/github-123',
        queryText: 'Jovie implementation context',
        queryResult: 'Relevant memory result',
      },
    });

    expect(shellQuote("Fix $HOME `backtick` and user's path")).toBe(
      "'Fix $HOME `backtick` and user'\\''s path'"
    );
    expect(prompt).toContain(
      `./scripts/loop-integration-ship.sh 'integration/codex-queue' '${plan.branchName}' 'Fix $HOME \`backtick\` and user'\\''s path'`
    );
  });
});
