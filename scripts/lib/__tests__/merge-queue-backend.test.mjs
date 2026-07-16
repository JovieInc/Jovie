import { describe, expect, it, vi } from 'vitest';
import {
  dequeuePullRequest,
  enrollPullRequest,
  listPullRequestQueueStates,
  preflightMergeQueue,
  runCli,
  validateNativePreflightEvidence,
} from '../../merge-queue-backend.mjs';

const REPOSITORY = 'JovieInc/Jovie';
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
    `{"id":${RULESET_ID},"enforcement":"active","target":"branch","conditions":{"ref_name":{"include":["refs/heads/main"],"exclude":[]}},"bypass_actors":[{"actor_id":2934433,"actor_type":"Integration"}],"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"required_status_checks":[{"context":"PR Ready"},{"context":"Migration Guard"},{"context":"Fork PR Gate"},{"context":"PR Size Guard"}]}},{"type":"merge_queue","parameters":{"check_response_timeout_minutes":60,"grouping_strategy":"ALLGREEN","max_entries_to_build":2,"max_entries_to_merge":10,"merge_method":"SQUASH","min_entries_to_merge":1,"min_entries_to_merge_wait_minutes":0}}]}`
  )
);
const VALID_WORKFLOW = `name: CI
on:
  pull_request:
    branches: [main]
  merge_group:
    types: [checks_requested]
`;
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

describe('native live preflight', () => {
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
        'Graphite bypass actor must be absent before native enrollment',
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
