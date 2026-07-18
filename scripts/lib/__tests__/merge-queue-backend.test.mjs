import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  dequeuePullRequest,
  enrollPullRequest,
  listPullRequestQueueStates,
  preflightMergeQueue,
  runCli,
  validateNativePreflightEvidence,
} from '../../merge-queue-backend.mjs';
import { extractWorkflowJobBlock } from '../merge-queue-guard.mjs';

const REPOSITORY = 'JovieInc/Jovie';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const RULESET_ID = 10512119;
const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const PR_ID = 'PR_kwDO_native_pr';
const ENTRY_ID = 'MQE_kwDO_native_entry';
const QUEUE_ENTRY = { id: ENTRY_ID, state: 'QUEUED' };
const AUTO_MERGE = { enabledAt: '2026-07-15T00:00:00Z' };
const VALID_REPOSITORY = Object.freeze(
  JSON.parse(
    '{"default_branch":"main","allow_auto_merge":true,"allow_squash_merge":true}'
  )
);
const VALID_RULESET = Object.freeze(
  JSON.parse(
    `{"id":${RULESET_ID},"enforcement":"active","target":"branch","conditions":{"ref_name":{"include":["refs/heads/main"],"exclude":[]}},"bypass_actors":[],"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"required_status_checks":[{"context":"PR Ready"},{"context":"Migration Guard"},{"context":"Fork PR Gate"},{"context":"PR Size Guard"}]}},{"type":"merge_queue","parameters":{"check_response_timeout_minutes":60,"grouping_strategy":"ALLGREEN","max_entries_to_build":2,"max_entries_to_merge":10,"merge_method":"SQUASH","min_entries_to_merge":1,"min_entries_to_merge_wait_minutes":0}}]}`
  )
);
const VALID_WORKFLOW = `name: CI
on:
  pull_request:
    branches: [main]
  merge_group:
    types: [checks_requested]
`;
const VALID_BRANCH_PROTECTION_REF = Object.freeze({
  name: 'main',
  branchProtectionRule: null,
});
function prState(overrides = {}) {
  return {
    id: PR_ID,
    number: 14359,
    state: 'OPEN',
    isDraft: false,
    headRefOid: HEAD,
    isInMergeQueue: false,
    mergeQueueEntry: null,
    autoMergeRequest: null,
    ...overrides,
  };
}
const nativeStatePayload = state => ({
  data: { repository: { pullRequest: state } },
});
const ok = (stdout = '') => ({
  code: 0,
  stdout: typeof stdout === 'string' ? stdout : JSON.stringify(stdout),
  stderr: '',
});
const queryText = args => args.find(arg => arg.startsWith('query=')) ?? '';
function createNativeRunner({
  ruleset = VALID_RULESET,
  repository = VALID_REPOSITORY,
  workflow = VALID_WORKFLOW,
  branchProtectionRef = VALID_BRANCH_PROTECTION_REF,
  states = [],
  listPages = null,
} = {}) {
  const stateQueue = [...states];
  const restResponses = new Map([
    [`repos/${REPOSITORY}/rulesets/${RULESET_ID}`, ruleset],
    [`repos/${REPOSITORY}`, repository],
  ]);
  return vi.fn(async args => {
    if (args[0] === 'api' && restResponses.has(args[1]))
      return ok(restResponses.get(args[1]));
    if (args.some(arg => arg.includes('/contents/.github/workflows/ci.yml'))) {
      return ok(workflow);
    }

    const query = queryText(args);
    if (query.includes('MergeQueueBranchProtection')) {
      return ok({ data: { repository: { ref: branchProtectionRef } } });
    }
    if (query.includes('MergeQueueOpenPullRequestStates')) {
      return ok(
        listPages ?? [
          {
            data: {
              repository: {
                pullRequests: {
                  nodes: stateQueue,
                  pageInfo: { hasNextPage: false },
                },
              },
            },
          },
        ]
      );
    }
    if (query.includes('MergeQueuePullRequestState')) {
      const state = stateQueue.shift();
      if (!state) throw new Error('Test runner exhausted PR states');
      return ok(nativeStatePayload(state));
    }
    if (
      query.includes('dequeuePullRequest') ||
      query.includes('disablePullRequestAutoMerge')
    )
      return ok({ data: {} });
    if (args[0] === 'pr' && args[1] === 'merge') return ok();
    throw new Error(`Unexpected gh command: ${args.join(' ')}`);
  });
}

function nativeOptions(runner, overrides = {}) {
  return {
    backend: 'native',
    repository: REPOSITORY,
    number: 14359,
    runner,
    ...overrides,
  };
}

const enroll = (runner, overrides) =>
  enrollPullRequest(
    nativeOptions(runner, { expectedHeadOid: HEAD, ...overrides })
  );
const dequeue = runner => dequeuePullRequest(nativeOptions(runner));
const invokedMerge = runner =>
  runner.mock.calls.some(([args]) => args[0] === 'pr' && args[1] === 'merge');

function readRepoFile(path) {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

function workflowStep(workflow, name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  if (start === -1) throw new Error(`Workflow step not found: ${name}`);
  const end = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, end === -1 ? undefined : end);
}

describe('merge queue backend resolution', () => {
  it('fails unknown backends before any command can run', async () => {
    const runner = vi.fn();
    await expect(
      preflightMergeQueue({ backend: 'github', repository: REPOSITORY, runner })
    ).rejects.toMatchObject({ code: 'unknown_backend' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('refuses native CLI mutation without the dedicated authorization', async () => {
    const runner = vi.fn();
    await expect(
      runCli(['enroll', '14359', HEAD], {
        env: { MERGE_QUEUE_BACKEND: 'native', GITHUB_REPOSITORY: REPOSITORY },
        runner,
        write: vi.fn(),
      })
    ).rejects.toMatchObject({ code: 'native_mutation_unauthorized' });
    expect(runner).not.toHaveBeenCalled();
  });
});

describe('queue workflow mutation safety', () => {
  it('revalidates the live head and hard gates before approval, then delegates enrollment', () => {
    const workflow = readRepoFile('.github/workflows/agent-pipeline.yml');
    const approval = workflowStep(workflow, 'Auto-approve PR');
    const handoff = workflowStep(
      workflow,
      'Mark approved PR for queue controller'
    );

    expect(approval).toContain(
      'PR_HEAD_SHA="${{ needs.guard.outputs.pr_head_sha }}"'
    );
    expect(approval).toContain('--json state,isDraft,headRefOid,labels');
    expect(approval).toContain('.headRefOid == $expected_head');
    for (const label of [
      'needs-human',
      'hold',
      'gated',
      'queue-deferred',
      'needs-conflict-resolution',
      'fast',
    ]) {
      expect(approval).toContain(`. == "${label}"`);
    }
    expect(approval.indexOf('CURRENT_STATE=$(gh pr view')).toBeLessThan(
      approval.indexOf('-f event="APPROVE"')
    );
    expect(approval).toContain('echo "approved=false"');
    expect(approval).toContain('echo "approved=true"');

    expect(handoff).toContain("steps.auto-approve.outputs.approved == 'true'");
    expect(handoff).toContain('--field "labels[]=auto-approved"');
    expect(handoff).toContain('merge-queue-autoenroll');
    expect(workflow).not.toContain('name: Add to Graphite merge queue');
    expect(workflow).not.toMatch(
      /gh pr edit[^\n]*--add-label[^\n]*merge-queue/
    );
  });

  it('requires native configuration, app auth, and preflight before autoenroll mutations', () => {
    const workflow = readRepoFile(
      '.github/workflows/merge-queue-autoenroll.yml'
    );
    const enrollJob = extractWorkflowJobBlock(workflow, 'enroll');
    const rebaseJob = extractWorkflowJobBlock(workflow, 'rebase');
    const enroll = workflowStep(workflow, 'Enroll clean PRs');
    const rebasePreflight = workflowStep(
      workflow,
      'Preflight native queue cutover'
    );
    const rebaseMutation = workflowStep(
      workflow,
      'Rebase blocked agent PRs onto main (Phase 2)'
    );
    const drain = readRepoFile('scripts/drain-pr-queue.sh');
    const tokenAction =
      'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1';

    expect(workflow).toContain(
      'MERGE_QUEUE_BACKEND: ${{ vars.MERGE_QUEUE_BACKEND }}'
    );
    expect(workflow).not.toContain("MERGE_QUEUE_BACKEND || 'graphite'");
    expect(workflow).toContain('  rebase:\n    needs: enroll\n');
    for (const job of [enrollJob, rebaseJob]) {
      expect(job).toContain(tokenAction);
      expect(job).toContain('id: app-token');
      expect(job).toContain('app-id: ${{ vars.JOVIE_BOT_APP_ID }}');
      expect(job).toContain(
        'private-key: ${{ secrets.JOVIE_BOT_PRIVATE_KEY }}'
      );
      expect(job).not.toContain('secrets.GITHUB_TOKEN');
    }
    for (const step of [enroll, rebasePreflight, rebaseMutation]) {
      expect(step).toContain('GH_TOKEN: ${{ steps.app-token.outputs.token }}');
      expect(step).not.toContain('secrets.GITHUB_TOKEN');
    }
    expect(enroll).toContain('if [[ "$MERGE_QUEUE_BACKEND" != "native" ]]');
    expect(enroll).toContain('bash scripts/drain-pr-queue.sh');
    expect(rebasePreflight).toContain(
      'if [[ "$MERGE_QUEUE_BACKEND" != "native" ]]'
    );
    expect(rebasePreflight).toContain(
      'node scripts/merge-queue-backend.mjs preflight'
    );
    expect(
      drain.indexOf('node scripts/merge-queue-backend.mjs preflight')
    ).toBeLessThan(
      drain.indexOf('node scripts/merge-queue-backend.mjs list-state')
    );
  });
});

describe('native live preflight', () => {
  it('accepts an exact ref with no classic branch-protection rule', () => {
    const result = validateNativePreflightEvidence({
      ruleset: VALID_RULESET,
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef: VALID_BRANCH_PROTECTION_REF,
    });
    expect(result.ok).toBe(true);
    expect(result.evidence).not.toHaveProperty('classicPushAllowanceCount');
    expect(result.evidence).not.toHaveProperty('classicPushAllowanceActors');
  });

  it.each([
    ['an unrestricted classic rule', { id: 'BPR_unrestricted' }],
    [
      'a classic rule with legacy push allowances',
      {
        id: 'BPR_restricted',
        pushAllowances: { totalCount: 0, nodes: [] },
      },
    ],
  ])('rejects %s as a dual control plane', (_label, branchProtectionRule) => {
    const result = validateNativePreflightEvidence({
      ruleset: VALID_RULESET,
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef: {
        name: 'main',
        branchProtectionRule,
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining(`found rule ${branchProtectionRule.id}`)
    );
    expect(result.errors).toContainEqual(
      expect.stringContaining('dual control planes')
    );
  });

  it.each([
    ['missing ref evidence', undefined],
    ['null ref evidence', null],
    ['malformed ref evidence', []],
    ['missing ref name', { branchProtectionRule: null }],
    ['wrong ref name', { name: 'develop', branchProtectionRule: null }],
    ['missing branchProtectionRule', { name: 'main' }],
    ['classic rule without an id', { name: 'main', branchProtectionRule: {} }],
    [
      'classic rule with a malformed id',
      { name: 'main', branchProtectionRule: { id: 123 } },
    ],
    ['malformed classic rule', { name: 'main', branchProtectionRule: 'BPR' }],
  ])('fails closed on %s', (_label, branchProtectionRef) => {
    const result = validateNativePreflightEvidence({
      ruleset: VALID_RULESET,
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef,
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('classic branch protection')
    );
  });

  it('queries only the exact ref and non-sensitive classic-rule identity', async () => {
    const runner = createNativeRunner();
    const result = await preflightMergeQueue({
      backend: 'native',
      repository: REPOSITORY,
      runner,
    });
    expect(result).toMatchObject({ ready: true });
    expect(result).not.toHaveProperty('classicPushAllowanceCount');
    expect(result).not.toHaveProperty('classicPushAllowanceActors');
    const protectionCall = runner.mock.calls.find(([args]) =>
      queryText(args).includes('MergeQueueBranchProtection')
    )?.[0];
    expect(protectionCall).toEqual(
      expect.arrayContaining(['-f', 'refName=refs/heads/main'])
    );
    expect(queryText(protectionCall)).toContain(
      'ref(qualifiedName:$refName){name branchProtectionRule{id}}'
    );
    expect(queryText(protectionCall)).not.toContain('pushAllowances');
  });

  it.each([
    undefined,
    {},
  ])('fails closed when bypass_actors is missing or malformed', bypass_actors => {
    const result = validateNativePreflightEvidence({
      ruleset: { ...structuredClone(VALID_RULESET), bypass_actors },
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
    });
    expect(result.errors).toContain('ruleset bypass_actors must be an array');
  });

  it.each([
    158384, 2934433,
  ])('rejects non-empty bypass_actors including actor %s', actor_id => {
    const result = validateNativePreflightEvidence({
      ruleset: {
        ...structuredClone(VALID_RULESET),
        bypass_actors: [{ actor_id, actor_type: 'Integration' }],
      },
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
    });
    expect(result.errors).toContain(
      'ruleset bypass_actors must be empty before native enrollment'
    );
  });

  it('reports every unsafe activation condition instead of partially enabling native mode', () => {
    const invalidRuleset = structuredClone(VALID_RULESET);
    invalidRuleset.enforcement = 'evaluate';
    invalidRuleset.bypass_actors.push({
      actor_id: 158384,
      actor_type: 'Integration',
    });
    invalidRuleset.rules = invalidRuleset.rules.filter(
      rule => rule.type !== 'merge_queue'
    );
    invalidRuleset.rules[0].parameters.required_status_checks = [
      { context: 'PR Ready' },
    ];
    const result = validateNativePreflightEvidence({
      ruleset: invalidRuleset,
      repository: { ...VALID_REPOSITORY, allow_auto_merge: false },
      workflowYaml: 'name: CI\non:\n  pull_request:\n',
      rulesetId: String(RULESET_ID),
      baseBranch: 'main',
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'ruleset enforcement must be active',
        'ruleset must contain an active merge_queue rule',
        'ruleset is missing required checks: Migration Guard, Fork PR Gate, PR Size Guard',
        'ruleset bypass_actors must be empty before native enrollment',
        'repository auto-merge must be enabled',
        'CI workflow must handle merge_group checks_requested',
      ])
    );
  });
});

describe('native enrollment', () => {
  it('uses an exact-head protected native auto-merge command and proves queue state', async () => {
    const runner = createNativeRunner({
      states: [
        prState(),
        prState({
          isInMergeQueue: true,
          mergeQueueEntry: QUEUE_ENTRY,
        }),
      ],
    });
    const result = await enroll(runner);
    expect(result).toMatchObject({ backend: 'native', changed: true });
    const mergeCall = runner.mock.calls.find(
      ([args]) => args[0] === 'pr' && args[1] === 'merge'
    )?.[0];
    expect(mergeCall).toEqual(
      expect.arrayContaining([
        '--auto',
        '--squash',
        '--match-head-commit',
        HEAD,
      ])
    );
  });

  it('refuses a changed head before invoking the enrollment mutation', async () => {
    const runner = createNativeRunner({
      states: [prState({ headRefOid: OTHER_HEAD })],
    });
    await expect(enroll(runner)).rejects.toMatchObject({
      code: 'head_changed',
    });
    expect(invokedMerge(runner)).toBe(false);
  });

  it('no-ops only after authoritative state proves the exact head is enrolled', async () => {
    const runner = createNativeRunner({
      states: [prState({ autoMergeRequest: AUTO_MERGE })],
    });
    const result = await enroll(runner);
    expect(result.changed).toBe(false);
    expect(invokedMerge(runner)).toBe(false);
  });
});

describe('native dequeue', () => {
  it('dequeues the queue entry and disables auto-merge using the PullRequest id', async () => {
    const runner = createNativeRunner({
      states: [
        prState({
          isInMergeQueue: true,
          mergeQueueEntry: QUEUE_ENTRY,
          autoMergeRequest: AUTO_MERGE,
        }),
        prState({ autoMergeRequest: AUTO_MERGE }),
        prState(),
      ],
    });
    await expect(dequeue(runner)).resolves.toMatchObject({
      backend: 'native',
      changed: true,
    });
    const dequeueCall = runner.mock.calls.find(([args]) =>
      queryText(args).includes('dequeuePullRequest')
    )?.[0];
    const disableCall = runner.mock.calls.find(([args]) =>
      queryText(args).includes('disablePullRequestAutoMerge')
    )?.[0];
    expect(dequeueCall).toContain(`id=${PR_ID}`);
    expect(dequeueCall).not.toContain(`id=${ENTRY_ID}`);
    expect(disableCall).toContain(`pullRequestId=${PR_ID}`);
  });

  it('fails closed when the final authoritative state remains queued', async () => {
    const stuck = prState({
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
      autoMergeRequest: AUTO_MERGE,
    });
    const runner = createNativeRunner({ states: [stuck, stuck, stuck] });
    await expect(dequeue(runner)).rejects.toMatchObject({
      code: 'dequeue_postcondition_failed',
    });
  });
});

describe('authoritative native state listing', () => {
  it('keys state by PR number and does not infer membership from labels', async () => {
    const queued = prState({
      number: 99,
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
    });
    const runner = createNativeRunner({ states: [queued] });
    await expect(
      listPullRequestQueueStates(nativeOptions(runner))
    ).resolves.toMatchObject({
      99: { backend: 'native', queued: true, id: PR_ID },
    });
  });
});
