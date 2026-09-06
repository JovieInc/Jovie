import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  CANONICAL_NATIVE_MUTATION_ACTOR,
  canAcceptExactHeadQueueReceipt,
  DEFAULT_MERGE_QUEUE_BACKEND,
  dequeuePullRequest,
  enrollPullRequest,
  explainExactHeadAdmissionSelector,
  explainExactHeadQueueReceipt,
  HARD_HOLD_LABELS,
  hasAuthoritativeExactHeadQueueReceipt,
  listPullRequestQueueStates,
  preflightMergeQueue,
  proveExactHeadQueueReceipt,
  resolveMergeQueueBackend,
  runCli,
  SELECTOR_BLOCKING_LABELS,
  validateNativePreflightEvidence,
} from '../../merge-queue-backend.mjs';

const REPOSITORY = 'JovieInc/Jovie';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const RULESET_ID = 10512119;
const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const PR_ID = 'PR_kwDO_native_pr';
const ENTRY_ID = 'MQE_kwDO_native_entry';
const QUEUE_ENTRY = { id: ENTRY_ID, state: 'QUEUED', position: 1 };
const AUTO_MERGE = { enabledAt: '2026-07-15T00:00:00Z' };
const VALID_REPOSITORY = Object.freeze(
  JSON.parse(
    '{"default_branch":"main","allow_auto_merge":true,"allow_squash_merge":true}'
  )
);
const VALID_RULESET = Object.freeze(
  JSON.parse(
    `{"id":${RULESET_ID},"enforcement":"active","target":"branch","conditions":{"ref_name":{"include":["refs/heads/main"],"exclude":[]}},"bypass_actors":[],"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"required_status_checks":[{"context":"PR Ready"},{"context":"Migration Guard"},{"context":"Fork PR Gate"},{"context":"PR Size Guard"}]}},{"type":"merge_queue","parameters":{"check_response_timeout_minutes":20,"grouping_strategy":"ALLGREEN","max_entries_to_build":1,"max_entries_to_merge":5,"merge_method":"SQUASH","min_entries_to_merge":5,"min_entries_to_merge_wait_minutes":10}}]}`
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
/** @type {{
  checkResponseTimeout: number,
  maximumEntriesToBuild: number,
  maximumEntriesToMerge: number,
  mergeMethod: string,
  minimumEntriesToMerge: number,
  minimumEntriesToMergeWaitTime: number,
}} */
const VALID_LIVE_QUEUE_CONFIGURATION = Object.freeze({
  checkResponseTimeout: 1200,
  maximumEntriesToBuild: 1,
  maximumEntriesToMerge: 5,
  mergeMethod: 'SQUASH',
  minimumEntriesToMerge: 5,
  minimumEntriesToMergeWaitTime: 10,
});
function prState(overrides = {}) {
  return {
    id: PR_ID,
    number: 14359,
    state: 'OPEN',
    isDraft: false,
    headRefOid: HEAD,
    labels: { nodes: [] },
    isInMergeQueue: false,
    mergeQueueEntry: null,
    autoMergeRequest: null,
    ...overrides,
  };
}
const nativeStatePayload = state => ({
  data: { repository: { pullRequest: state } },
});
const ok = (/** @type {unknown} */ stdout = '') => ({
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
  liveQueueConfiguration = VALID_LIVE_QUEUE_CONFIGURATION,
  states = [],
  listPages = null,
  enableResult = ok({ data: {} }),
  viewerPayload = /** @type {unknown} */ ({
    data: { viewer: { login: CANONICAL_NATIVE_MUTATION_ACTOR } },
  }),
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
    if (query.includes('MergeQueueNativeMutationActor')) {
      return ok(viewerPayload);
    }
    if (query.includes('MergeQueueBranchProtection')) {
      return ok({ data: { repository: { ref: branchProtectionRef } } });
    }
    if (query.includes('MergeQueueLiveConfiguration')) {
      return ok({
        data: {
          repository: {
            mergeQueue:
              liveQueueConfiguration === null
                ? null
                : { configuration: liveQueueConfiguration },
          },
        },
      });
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
    if (query.includes('enablePullRequestAutoMerge')) return enableResult;
    if (
      query.includes('dequeuePullRequest') ||
      query.includes('disablePullRequestAutoMerge')
    )
      return ok({ data: {} });
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
const invokedEnrollment = runner =>
  runner.mock.calls.some(([args]) =>
    queryText(args).includes('enablePullRequestAutoMerge')
  );
const invokedNativeMutation = runner =>
  runner.mock.calls.some(([args]) =>
    /enablePullRequestAutoMerge|dequeuePullRequest|disablePullRequestAutoMerge/.test(
      queryText(args)
    )
  );
const invokedMutationActorCheck = runner =>
  runner.mock.calls.some(([args]) =>
    queryText(args).includes('MergeQueueNativeMutationActor')
  );

function readRepoFile(path) {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

describe('merge queue backend resolution', () => {
  it('defaults bare callers to the live native backend', () => {
    expect(DEFAULT_MERGE_QUEUE_BACKEND).toBe('native');
    expect(resolveMergeQueueBackend()).toBe('native');
    expect(resolveMergeQueueBackend('native')).toBe('native');
  });

  it.each([
    'graphite',
    'github',
  ])('rejects retired or unknown backend %s before any command can run', async backend => {
    const runner = vi.fn();
    await expect(
      preflightMergeQueue({ backend, repository: REPOSITORY, runner })
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

  it('refuses a live drain without a dedicated GitHub App mutation token', () => {
    const result = spawnSync('bash', ['scripts/drain-pr-queue.sh'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        DRAIN_MUTATION_AUTHORIZATION: 'merge-queue-autoenroll',
        GH_MUTATION_TOKEN: '',
        GH_TOKEN: 'read-token-fixture',
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      'legacy external admission drain is retired'
    );
  });
});

describe('retired queue workflow writer', () => {
  it('uses only explicit exact-head intent and cannot resume fleet drains', () => {
    const workflow = readRepoFile(
      '.github/workflows/merge-queue-autoenroll.yml'
    );
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('native-merge-intent.mjs');
    expect(workflow).toContain('exit 2');
    expect(workflow).not.toMatch(/run:\s*node|uses:|GH_TOKEN/);
    for (const legacy of [
      'workflow_run:',
      'schedule:',
      'drain-pr-queue.sh',
      'fleet-policy:',
    ]) {
      expect(workflow).not.toContain(legacy);
    }
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
    expect(result.evidence.bypassActorsVisible).toBe(true);
    expect(result.policyReadback).toMatchObject({
      schema: 'jovie-native-queue-policy-readback/v1',
      matched: true,
      drift: [],
    });
  });

  it('records pending cohort cutover drift without failing live 1/0 preflight', () => {
    const liveUntilCutover = {
      ...VALID_RULESET,
      rules: VALID_RULESET.rules.map(rule =>
        rule.type === 'merge_queue'
          ? {
              ...rule,
              parameters: {
                ...rule.parameters,
                min_entries_to_merge: 1,
                min_entries_to_merge_wait_minutes: 0,
              },
            }
          : rule
      ),
    };
    const result = validateNativePreflightEvidence({
      ruleset: liveUntilCutover,
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef: VALID_BRANCH_PROTECTION_REF,
    });
    expect(result.ok).toBe(true);
    expect(result.policyReadback).toMatchObject({
      matched: false,
      drift: ['min_entries_to_merge', 'min_entries_to_merge_wait_minutes'],
    });
    expect(result.evidence).not.toHaveProperty('classicPushAllowanceCount');
    expect(result.evidence).not.toHaveProperty('classicPushAllowanceActors');
  });

  it('does not fail enroll preflight when GraphQL live max_entries_to_build matches the lock', () => {
    const staleRest = {
      ...VALID_RULESET,
      rules: VALID_RULESET.rules.map(rule =>
        rule.type === 'merge_queue'
          ? {
              ...rule,
              parameters: {
                ...rule.parameters,
                max_entries_to_build: 3,
              },
            }
          : rule
      ),
    };
    const restOnly = validateNativePreflightEvidence({
      ruleset: staleRest,
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef: VALID_BRANCH_PROTECTION_REF,
    });
    expect(restOnly.ok).toBe(false);
    expect(restOnly.policyReadback.drift).toContain('max_entries_to_build');

    const liveGraphql = validateNativePreflightEvidence({
      ruleset: staleRest,
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef: VALID_BRANCH_PROTECTION_REF,
      liveQueueConfiguration: VALID_LIVE_QUEUE_CONFIGURATION,
    });
    expect(liveGraphql.ok).toBe(true);
    expect(liveGraphql.policyReadback).toMatchObject({
      matched: true,
      drift: [],
      observed: { max_entries_to_build: 1 },
    });
  });

  it('reads GraphQL mergeQueue.configuration during live preflight', async () => {
    const runner = createNativeRunner();
    const result = await preflightMergeQueue({
      repository: REPOSITORY,
      runner,
    });
    expect(result).toMatchObject({ ready: true });
    expect(result.policyReadback).toMatchObject({
      matched: true,
      observed: { max_entries_to_build: 1 },
    });
    const liveConfigCall = runner.mock.calls.find(([args]) =>
      queryText(args).includes('MergeQueueLiveConfiguration')
    )?.[0];
    expect(liveConfigCall).toEqual(
      expect.arrayContaining(['-f', 'branch=main'])
    );
    expect(queryText(liveConfigCall)).toContain('maximumEntriesToBuild');
  });

  it('does not fail enroll preflight when GraphQL checkResponseTimeout is seconds for a 20-minute lock', () => {
    const liveUntilCutover = {
      ...VALID_RULESET,
      rules: VALID_RULESET.rules.map(rule =>
        rule.type === 'merge_queue'
          ? {
              ...rule,
              parameters: {
                ...rule.parameters,
                min_entries_to_merge: 1,
                min_entries_to_merge_wait_minutes: 0,
              },
            }
          : rule
      ),
    };
    const falseDrift = validateNativePreflightEvidence({
      ruleset: liveUntilCutover,
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef: VALID_BRANCH_PROTECTION_REF,
      liveQueueConfiguration: {
        ...VALID_LIVE_QUEUE_CONFIGURATION,
        checkResponseTimeout: 1200,
        minimumEntriesToMerge: 1,
        minimumEntriesToMergeWaitTime: 0,
      },
    });
    expect(falseDrift.ok).toBe(true);
    expect(
      falseDrift.policyReadback.observed.check_response_timeout_minutes
    ).toBe(20);
    expect(falseDrift.policyReadback.drift).toEqual([
      'min_entries_to_merge',
      'min_entries_to_merge_wait_minutes',
    ]);
    expect(
      falseDrift.errors.some(error =>
        error.includes('check_response_timeout_minutes')
      )
    ).toBe(false);

    const actualTimeoutDrift = validateNativePreflightEvidence({
      ruleset: liveUntilCutover,
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef: VALID_BRANCH_PROTECTION_REF,
      liveQueueConfiguration: {
        ...VALID_LIVE_QUEUE_CONFIGURATION,
        checkResponseTimeout: 1800,
        minimumEntriesToMerge: 1,
        minimumEntriesToMergeWaitTime: 0,
      },
    });
    expect(actualTimeoutDrift.ok).toBe(false);
    expect(actualTimeoutDrift.errors).toContain(
      'merge_queue check_response_timeout_minutes must be 20'
    );
    expect(actualTimeoutDrift.errors).toContain(
      'native queue policy readback drifted: check_response_timeout_minutes'
    );
  });

  it('reads live GraphQL checkResponseTimeout seconds as 20 minutes', async () => {
    const runner = createNativeRunner({
      liveQueueConfiguration: {
        ...VALID_LIVE_QUEUE_CONFIGURATION,
        checkResponseTimeout: 1200,
      },
    });
    await expect(
      preflightMergeQueue({
        repository: REPOSITORY,
        runner,
      })
    ).resolves.toMatchObject({
      ready: true,
      policyReadback: {
        observed: { check_response_timeout_minutes: 20 },
      },
    });
  });

  it('prefers GraphQL maximumEntriesToBuild over stale REST max_entries_to_build', async () => {
    const staleRest = {
      ...VALID_RULESET,
      rules: VALID_RULESET.rules.map(rule =>
        rule.type === 'merge_queue'
          ? {
              ...rule,
              parameters: {
                ...rule.parameters,
                max_entries_to_build: 3,
              },
            }
          : rule
      ),
    };
    const runner = createNativeRunner({ ruleset: staleRest });
    await expect(
      preflightMergeQueue({
        repository: REPOSITORY,
        runner,
      })
    ).resolves.toMatchObject({
      ready: true,
      policyReadback: {
        matched: true,
        observed: { max_entries_to_build: 1 },
      },
    });
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
    expect(result.policyReadback).toMatchObject({
      schema: 'jovie-native-queue-policy-readback/v1',
      matched: true,
    });
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

  it('allows unavailable bypass actors only for an explicit controller preflight', () => {
    const result = validateNativePreflightEvidence({
      ruleset: { ...structuredClone(VALID_RULESET), bypass_actors: undefined },
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef: VALID_BRANCH_PROTECTION_REF,
      allowUnavailableBypassActors: true,
    });
    expect(result.ok).toBe(true);
    expect(result.evidence.bypassActorsVisible).toBe(false);
  });

  it.each([
    null,
    {},
  ])('rejects a visible malformed bypass_actors value in controller mode', bypass_actors => {
    const result = validateNativePreflightEvidence({
      ruleset: { ...structuredClone(VALID_RULESET), bypass_actors },
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef: VALID_BRANCH_PROTECTION_REF,
      allowUnavailableBypassActors: true,
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
      branchProtectionRef: VALID_BRANCH_PROTECTION_REF,
      allowUnavailableBypassActors: true,
    });
    expect(result.errors).toContain(
      'ruleset bypass_actors must be empty before native enrollment'
    );
  });

  it('keeps direct preflight strict while an explicit controller can proceed', async () => {
    const ruleset = structuredClone(VALID_RULESET);
    delete ruleset.bypass_actors;
    await expect(
      preflightMergeQueue({
        backend: 'native',
        repository: REPOSITORY,
        runner: createNativeRunner({ ruleset }),
      })
    ).rejects.toMatchObject({ code: 'native_preflight_failed' });
    await expect(
      preflightMergeQueue({
        backend: 'native',
        repository: REPOSITORY,
        runner: createNativeRunner({ ruleset }),
        allowUnavailableBypassActors: true,
      })
    ).resolves.toMatchObject({
      ready: true,
      bypassActorsVisible: false,
    });
  });

  it('derives controller visibility only from the exact CLI authorization', async () => {
    const ruleset = structuredClone(VALID_RULESET);
    delete ruleset.bypass_actors;
    await expect(
      runCli(['preflight'], {
        env: {
          MERGE_QUEUE_BACKEND: 'native',
          GITHUB_REPOSITORY: REPOSITORY,
          MERGE_QUEUE_NATIVE_AUTHORIZATION: 'test-fixture',
        },
        runner: createNativeRunner({ ruleset }),
        write: vi.fn(),
      })
    ).rejects.toMatchObject({ code: 'native_preflight_failed' });

    await expect(
      runCli(['preflight'], {
        env: {
          MERGE_QUEUE_BACKEND: 'native',
          GITHUB_REPOSITORY: REPOSITORY,
          MERGE_QUEUE_NATIVE_AUTHORIZATION: 'merge-queue-autoenroll',
        },
        runner: createNativeRunner({ ruleset }),
        write: vi.fn(),
      })
    ).resolves.toMatchObject({ ready: true, bypassActorsVisible: false });

    await expect(
      runCli(['enroll', '14359', HEAD], {
        env: {
          MERGE_QUEUE_BACKEND: 'native',
          GITHUB_REPOSITORY: REPOSITORY,
          MERGE_QUEUE_NATIVE_AUTHORIZATION: 'merge-queue-autoenroll',
        },
        runner: createNativeRunner({
          ruleset,
          states: [
            prState({
              isInMergeQueue: true,
              mergeQueueEntry: QUEUE_ENTRY,
              autoMergeRequest: AUTO_MERGE,
            }),
          ],
        }),
        write: vi.fn(),
      })
    ).resolves.toMatchObject({ changed: false });
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

describe('native mutation actor boundary', () => {
  it('reserves the App runner for actor proof and GraphQL mutations', async () => {
    const readRunner = createNativeRunner({
      states: [
        prState(),
        prState({
          isInMergeQueue: true,
          mergeQueueEntry: QUEUE_ENTRY,
        }),
      ],
    });
    const mutationRunner = createNativeRunner();

    await expect(
      enrollPullRequest(
        nativeOptions(readRunner, {
          expectedHeadOid: HEAD,
          mutationRunner,
        })
      )
    ).resolves.toMatchObject({ changed: true });

    expect(invokedMutationActorCheck(readRunner)).toBe(false);
    expect(invokedNativeMutation(readRunner)).toBe(false);
    expect(invokedMutationActorCheck(mutationRunner)).toBe(true);
    expect(invokedEnrollment(mutationRunner)).toBe(true);
    expect(
      mutationRunner.mock.calls.every(([args]) => {
        const query = queryText(args);
        return (
          query.includes('MergeQueueNativeMutationActor') ||
          query.includes('enablePullRequestAutoMerge')
        );
      })
    ).toBe(true);
  });

  it('keeps dequeue reads on the workflow runner and mutations on the App runner', async () => {
    const queued = prState({
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
      autoMergeRequest: AUTO_MERGE,
    });
    const autoMergeOnly = prState({
      autoMergeRequest: AUTO_MERGE,
    });
    const readRunner = createNativeRunner({
      states: [queued, autoMergeOnly, prState()],
    });
    const mutationRunner = createNativeRunner();

    await expect(
      dequeuePullRequest(
        nativeOptions(readRunner, {
          mutationRunner,
        })
      )
    ).resolves.toMatchObject({ changed: true });

    expect(invokedMutationActorCheck(readRunner)).toBe(false);
    expect(invokedNativeMutation(readRunner)).toBe(false);
    expect(invokedMutationActorCheck(mutationRunner)).toBe(true);
    expect(invokedNativeMutation(mutationRunner)).toBe(true);
    expect(
      mutationRunner.mock.calls.every(([args]) => {
        const query = queryText(args);
        return (
          query.includes('MergeQueueNativeMutationActor') ||
          query.includes('dequeuePullRequest') ||
          query.includes('disablePullRequestAutoMerge')
        );
      })
    ).toBe(true);
  });

  it('rejects an authorized CLI intent when GitHub identifies the Tim user', async () => {
    const runner = createNativeRunner({
      viewerPayload: { data: { viewer: { login: 'itstimwhite' } } },
    });

    await expect(
      runCli(['enroll', '14359', HEAD], {
        env: {
          MERGE_QUEUE_BACKEND: 'native',
          GITHUB_REPOSITORY: REPOSITORY,
          MERGE_QUEUE_NATIVE_AUTHORIZATION: 'merge-queue-autoenroll',
        },
        runner,
        write: vi.fn(),
      })
    ).rejects.toMatchObject({
      code: 'native_mutation_actor_unauthorized',
      details: {
        expectedActor: CANONICAL_NATIVE_MUTATION_ACTOR,
        observedActor: 'itstimwhite',
      },
    });
    expect(runner.mock.calls).toHaveLength(1);
    expect(invokedMutationActorCheck(runner)).toBe(true);
    expect(invokedNativeMutation(runner)).toBe(false);
  });

  it.each([
    ['enroll', runner => enroll(runner)],
    ['dequeue', runner => dequeue(runner)],
  ])('protects direct %s imports from bypassing actor identity', async (_name, invoke) => {
    const runner = createNativeRunner({
      viewerPayload: { data: { viewer: { login: 'itstimwhite' } } },
    });

    await expect(invoke(runner)).rejects.toMatchObject({
      code: 'native_mutation_actor_unauthorized',
    });
    expect(runner.mock.calls).toHaveLength(1);
    expect(invokedNativeMutation(runner)).toBe(false);
  });

  it.each([
    [
      'missing viewer',
      { data: { viewer: null } },
      'native_mutation_actor_unauthorized',
    ],
    [
      'malformed login',
      { data: { viewer: { login: 42 } } },
      'native_mutation_actor_unauthorized',
    ],
    [
      'GraphQL error',
      { errors: [{ message: 'viewer unavailable' }] },
      'github_graphql_error',
    ],
  ])('fails closed on %s evidence', async (_name, viewerPayload, code) => {
    const runner = createNativeRunner({ viewerPayload });

    await expect(enroll(runner)).rejects.toMatchObject({ code });
    expect(invokedNativeMutation(runner)).toBe(false);
  });

  it('keeps preflight and state listing read-only for noncanonical actors', async () => {
    const viewerPayload = { data: { viewer: { login: 'itstimwhite' } } };
    const preflightRunner = createNativeRunner({ viewerPayload });
    const listRunner = createNativeRunner({
      viewerPayload,
      states: [prState({ number: 99 })],
    });

    await expect(
      preflightMergeQueue({
        repository: REPOSITORY,
        runner: preflightRunner,
      })
    ).resolves.toMatchObject({ ready: true });
    await expect(
      listPullRequestQueueStates(nativeOptions(listRunner))
    ).resolves.toMatchObject({ 99: { backend: 'native' } });
    expect(invokedMutationActorCheck(preflightRunner)).toBe(false);
    expect(invokedMutationActorCheck(listRunner)).toBe(false);
  });
});

describe('native enrollment', () => {
  it('uses the native GraphQL mutation and proves a positioned queue receipt', async () => {
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
    expect(result).toMatchObject({
      backend: 'native',
      changed: true,
      mutationActor: CANONICAL_NATIVE_MUTATION_ACTOR,
    });
    const mutationCall = runner.mock.calls.find(([args]) =>
      queryText(args).includes('enablePullRequestAutoMerge')
    )?.[0];
    expect(mutationCall).toEqual(
      expect.arrayContaining([
        '-f',
        `pullRequestId=${PR_ID}`,
        '-f',
        'mergeMethod=SQUASH',
      ])
    );
  });

  it('polls through stale reads until the exact-head enrollment is authoritative', async () => {
    const wait = vi.fn(async () => {});
    const runner = createNativeRunner({
      states: [
        prState(),
        prState(),
        prState(),
        prState({
          isInMergeQueue: true,
          mergeQueueEntry: QUEUE_ENTRY,
        }),
      ],
    });

    await expect(
      enroll(runner, {
        postconditionAttempts: 6,
        postconditionDelayMs: 2_000,
        wait,
      })
    ).resolves.toMatchObject({
      changed: true,
      postconditionAttempts: 3,
      state: { headRefOid: HEAD, queued: true },
    });
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenNthCalledWith(1, 2_000);
    expect(wait).toHaveBeenNthCalledWith(2, 2_000);
  });

  it('fails closed with mutation stderr after bounded authoritative reads', async () => {
    const wait = vi.fn(async () => {});
    const runner = createNativeRunner({
      states: [prState(), prState(), prState()],
      enableResult: {
        code: 1,
        stdout: '',
        stderr: 'GraphQL: Pull request head SHA changed',
      },
    });

    await expect(
      enroll(runner, {
        postconditionAttempts: 2,
        postconditionDelayMs: 2_000,
        wait,
      })
    ).rejects.toMatchObject({
      code: 'enrollment_postcondition_failed',
      message: expect.stringContaining(
        'mutation error: enrolling PR #14359 with native failed with exit code 1: GraphQL: Pull request head SHA changed'
      ),
      details: {
        mutationError: {
          code: 'gh_command_failed',
          details: { stderr: 'GraphQL: Pull request head SHA changed' },
        },
        postconditionAttempts: 2,
        state: { headRefOid: HEAD, queued: false },
      },
    });
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it('refuses a changed head before invoking the enrollment mutation', async () => {
    const runner = createNativeRunner({
      states: [prState({ headRefOid: OTHER_HEAD })],
    });
    await expect(enroll(runner)).rejects.toMatchObject({
      code: 'head_changed',
    });
    expect(invokedEnrollment(runner)).toBe(false);
  });

  it.each([
    'queue-deferred',
    'hold',
    'gated',
    'incident',
  ])('refuses the machine hold %s before invoking enrollment', async label => {
    const runner = createNativeRunner({
      states: [prState({ labels: { nodes: [{ name: label }] } })],
    });
    await expect(enroll(runner)).rejects.toMatchObject({
      code: 'held_pull_request',
      details: { labels: [label] },
    });
    expect(invokedEnrollment(runner)).toBe(false);
  });

  it.each([
    'human-review-required',
    'needs-human',
    'needs-human-review',
    'needs-human-taste',
    'needs:taste',
    'no-auto',
    'no-auto-merge',
    'no-automerge',
    'taste',
  ])('ignores the legacy %s label during native enrollment', async label => {
    const queued = prState({
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
      labels: { nodes: [{ name: label }] },
    });
    const runner = createNativeRunner({
      states: [prState({ labels: { nodes: [{ name: label }] } }), queued],
    });
    await expect(enroll(runner)).resolves.toMatchObject({
      changed: true,
      state: { queued: true },
    });
    expect(invokedEnrollment(runner)).toBe(true);
  });

  it('refuses a delayed queue entry when a hard hold appears after SNAP', async () => {
    const queuedAndHeld = prState({
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
      autoMergeRequest: AUTO_MERGE,
      labels: { nodes: [{ name: 'queue-deferred' }] },
    });
    const runner = createNativeRunner({
      states: [prState(), queuedAndHeld],
    });
    await expect(
      enroll(runner, { postconditionAttempts: 2, wait: async () => {} })
    ).rejects.toMatchObject({
      code: 'held_pull_request',
      details: { labels: ['queue-deferred'] },
    });
    expect(invokedEnrollment(runner)).toBe(true);
  });

  it('rejects auto-merge success without an authoritative native queue entry', async () => {
    const runner = createNativeRunner({
      states: [
        prState({ autoMergeRequest: AUTO_MERGE }),
        prState({ autoMergeRequest: AUTO_MERGE }),
      ],
    });
    await expect(
      enroll(runner, { postconditionAttempts: 1 })
    ).rejects.toMatchObject({
      code: 'enrollment_postcondition_failed',
      details: {
        state: {
          autoMergeEnabled: true,
          mergeQueueEntry: null,
          queued: false,
        },
      },
    });
    expect(invokedEnrollment(runner)).toBe(true);
  });

  it('no-ops only after GraphQL proves queue state and position', async () => {
    const runner = createNativeRunner({
      states: [
        prState({
          isInMergeQueue: true,
          mergeQueueEntry: QUEUE_ENTRY,
          autoMergeRequest: AUTO_MERGE,
        }),
      ],
    });
    const result = await enroll(runner);
    expect(result).toMatchObject({
      changed: false,
      state: {
        queued: true,
        mergeQueueEntry: { state: 'QUEUED', position: 1 },
      },
    });
    expect(invokedEnrollment(runner)).toBe(false);
  });

  it('accepts a positioned queue entry after GitHub advances it to checks', async () => {
    const runner = createNativeRunner({
      states: [
        prState({
          isInMergeQueue: true,
          mergeQueueEntry: { ...QUEUE_ENTRY, state: 'AWAITING_CHECKS' },
          autoMergeRequest: AUTO_MERGE,
        }),
      ],
    });
    const result = await enroll(runner);
    expect(result.changed).toBe(false);
    expect(invokedEnrollment(runner)).toBe(false);
  });

  it.each([
    ['missing id', { state: 'QUEUED', position: 1 }],
    ['unknown state', { ...QUEUE_ENTRY, state: 'UNKNOWN' }],
    ['missing position', { id: ENTRY_ID, state: 'QUEUED' }],
    ['zero position', { ...QUEUE_ENTRY, position: 0 }],
    ['negative position', { ...QUEUE_ENTRY, position: -1 }],
    ['fractional position', { ...QUEUE_ENTRY, position: 1.5 }],
  ])('fails closed on a queue entry with %s', async (_name, mergeQueueEntry) => {
    const runner = createNativeRunner({
      states: [prState({ isInMergeQueue: true, mergeQueueEntry })],
    });

    await expect(enroll(runner)).rejects.toMatchObject({
      code: 'incomplete_queue_state',
    });
    expect(invokedEnrollment(runner)).toBe(false);
  });

  it('reconciles an errored mutation only when a later read proves queue membership', async () => {
    const runner = createNativeRunner({
      states: [
        prState(),
        prState({ isInMergeQueue: true, mergeQueueEntry: QUEUE_ENTRY }),
      ],
      enableResult: {
        code: 1,
        stdout: '',
        stderr: 'GraphQL transport closed after dispatch',
      },
    });

    await expect(enroll(runner)).resolves.toMatchObject({
      changed: true,
      reconciledAfterCommandError: true,
      state: { mergeQueueEntry: QUEUE_ENTRY },
    });
  });

  it('fails closed when the head changes after the mutation', async () => {
    const runner = createNativeRunner({
      states: [prState(), prState({ headRefOid: OTHER_HEAD })],
    });

    await expect(enroll(runner)).rejects.toMatchObject({
      code: 'head_changed',
    });
    expect(invokedEnrollment(runner)).toBe(true);
  });

  it('treats GraphQL errors as an unproven mutation and fails after bounded reads', async () => {
    const runner = createNativeRunner({
      states: [prState(), prState()],
      enableResult: ok({ errors: [{ message: 'auto-merge unavailable' }] }),
    });

    await expect(
      enroll(runner, { postconditionAttempts: 1 })
    ).rejects.toMatchObject({
      code: 'enrollment_postcondition_failed',
      details: { mutationError: { code: 'github_graphql_error' } },
    });
  });

  it('does not accept a success-only auto-merge request without a queue entry', async () => {
    const wait = vi.fn(async () => {});
    const successOnly = prState({ autoMergeRequest: AUTO_MERGE });
    const runner = createNativeRunner({
      states: [successOnly, successOnly, successOnly],
    });

    await expect(
      enroll(runner, {
        postconditionAttempts: 2,
        postconditionDelayMs: 2_000,
        wait,
      })
    ).rejects.toMatchObject({
      code: 'enrollment_postcondition_failed',
      details: {
        postconditionAttempts: 2,
        state: {
          autoMergeRequest: AUTO_MERGE,
          mergeQueueEntry: null,
        },
      },
    });
    expect(invokedEnrollment(runner)).toBe(true);
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
      mutationActor: CANONICAL_NATIVE_MUTATION_ACTOR,
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

describe('exact-head queue receipt proof', () => {
  const selectorRow = {
    n: 16068,
    draft: false,
    m: 'MERGEABLE',
    base: 'main',
    fail: [],
    q: false,
    L: [],
    headOid: HEAD,
    iso: false,
  };

  it('accepts persisted isInMergeQueue plus a positioned mergeQueueEntry', async () => {
    const state = prState({
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
    });
    expect(hasAuthoritativeExactHeadQueueReceipt(state, HEAD)).toBe(true);
    expect(explainExactHeadQueueReceipt(state, HEAD)).toEqual({
      ok: true,
      reason: 'queued',
    });

    const runner = createNativeRunner({ states: [state] });
    await expect(
      proveExactHeadQueueReceipt(
        nativeOptions(runner, { expectedHeadOid: HEAD })
      )
    ).resolves.toMatchObject({
      ok: true,
      attempts: 1,
      state: {
        isInMergeQueue: true,
        queued: true,
        mergeQueueEntry: QUEUE_ENTRY,
      },
    });
    expect(invokedEnrollment(runner)).toBe(false);
  });

  it('polls through delayed authoritative reads until the receipt appears', async () => {
    const wait = vi.fn(async () => {});
    const runner = createNativeRunner({
      states: [
        prState({ autoMergeRequest: AUTO_MERGE }),
        prState({ autoMergeRequest: AUTO_MERGE }),
        prState({
          isInMergeQueue: true,
          mergeQueueEntry: QUEUE_ENTRY,
          autoMergeRequest: AUTO_MERGE,
        }),
      ],
    });

    await expect(
      proveExactHeadQueueReceipt(
        nativeOptions(runner, {
          expectedHeadOid: HEAD,
          postconditionAttempts: 6,
          postconditionDelayMs: 2_000,
          wait,
        })
      )
    ).resolves.toMatchObject({
      ok: true,
      attempts: 3,
      state: { isInMergeQueue: true, mergeQueueEntry: QUEUE_ENTRY },
    });
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenNthCalledWith(1, 2_000);
    expect(invokedEnrollment(runner)).toBe(false);
  });

  it('classifies selector no-ops without requiring the native backend', () => {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/merge-queue-backend.mjs',
        'explain-selector',
        '16068',
        HEAD,
        'normal',
        '15',
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          MERGE_QUEUE_BACKEND: 'test-label-fixture',
        },
        input: JSON.stringify([selectorRow]),
      }
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toEqual({
      observed: true,
      queued: false,
      eligible: true,
      reason: 'eligible',
    });
  });

  it('does not treat a delayed native entry as a receipt when a hard hold is live', async () => {
    const queuedAndHeld = prState({
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
      labels: { nodes: [{ name: 'queue-deferred' }] },
    });
    expect(hasAuthoritativeExactHeadQueueReceipt(queuedAndHeld, HEAD)).toBe(
      true
    );
    expect(canAcceptExactHeadQueueReceipt(queuedAndHeld, HEAD)).toBe(false);
    expect(explainExactHeadQueueReceipt(queuedAndHeld, HEAD)).toEqual({
      ok: false,
      reason: 'held-by=queue-deferred',
    });

    const runner = createNativeRunner({ states: [queuedAndHeld] });
    await expect(
      proveExactHeadQueueReceipt(
        nativeOptions(runner, { expectedHeadOid: HEAD })
      )
    ).resolves.toMatchObject({
      ok: false,
      attempts: 1,
      explanation: { ok: false, reason: 'held-by=queue-deferred' },
    });
    expect(invokedEnrollment(runner)).toBe(false);
  });

  it('fails closed on a missing receipt and does not treat auto-merge as membership', async () => {
    const wait = vi.fn(async () => {});
    const autoMergeOnly = prState({ autoMergeRequest: AUTO_MERGE });
    expect(hasAuthoritativeExactHeadQueueReceipt(autoMergeOnly, HEAD)).toBe(
      false
    );
    expect(explainExactHeadQueueReceipt(autoMergeOnly, HEAD)).toEqual({
      ok: false,
      reason:
        'isInMergeQueue=false mergeQueueEntry=null autoMergeRequest=present (auto-merge intent is not membership)',
    });

    const runner = createNativeRunner({
      states: [autoMergeOnly, autoMergeOnly],
    });
    await expect(
      proveExactHeadQueueReceipt(
        nativeOptions(runner, {
          expectedHeadOid: HEAD,
          postconditionAttempts: 2,
          postconditionDelayMs: 2_000,
          wait,
        })
      )
    ).resolves.toMatchObject({
      ok: false,
      attempts: 2,
      explanation: {
        ok: false,
        reason:
          'isInMergeQueue=false mergeQueueEntry=null autoMergeRequest=present (auto-merge intent is not membership)',
      },
    });
    expect(wait).toHaveBeenCalledTimes(1);
    expect(invokedEnrollment(runner)).toBe(false);
  });

  it('explains a selector no-op instead of a generic missing receipt', () => {
    expect(
      explainExactHeadAdmissionSelector({
        snapshot: [{ ...selectorRow, m: 'UNKNOWN' }],
        admissionPr: 16068,
        admissionHead: HEAD,
        promotionMode: 'normal',
        enrollSlots: 15,
      })
    ).toEqual({
      observed: true,
      queued: false,
      eligible: false,
      reason: 'mergeable=UNKNOWN',
    });
  });

  it('admits only an attested controller repair in controller-repair-only mode', () => {
    const input = {
      admissionPr: 16068,
      admissionHead: HEAD,
      promotionMode: 'controller-repair-only',
      enrollSlots: 1,
    };
    expect(
      explainExactHeadAdmissionSelector({
        ...input,
        snapshot: [{ ...selectorRow, controllerRepair: true }],
      })
    ).toEqual({
      observed: true,
      queued: false,
      eligible: true,
      reason: 'eligible',
    });
    expect(
      explainExactHeadAdmissionSelector({
        ...input,
        snapshot: [{ ...selectorRow, controllerRepair: false }],
      })
    ).toMatchObject({
      eligible: false,
      reason: 'promotion-mode=controller-repair-only',
    });
  });

  it('does not treat snapshot auto-merge intent as queued membership', () => {
    expect(
      explainExactHeadAdmissionSelector({
        snapshot: [{ ...selectorRow, q: false, autoMergeRequest: AUTO_MERGE }],
        admissionPr: 16068,
        admissionHead: HEAD,
        promotionMode: 'normal',
        enrollSlots: 15,
      })
    ).toEqual({
      observed: true,
      queued: false,
      eligible: true,
      reason: 'eligible',
    });
  });

  it.each([
    'human-review-required',
    'needs-human',
    'needs-human-review',
    'needs-human-taste',
    'needs:taste',
    'no-auto',
    'no-auto-merge',
    'no-automerge',
    'taste',
  ])('ignores the legacy %s label in exact-head selection', label => {
    expect(SELECTOR_BLOCKING_LABELS.has(label)).toBe(false);
    expect(HARD_HOLD_LABELS.has(label)).toBe(false);
    const snapshot = [{ ...selectorRow, L: [label] }];
    for (const promotionMode of ['normal', 'hold-intake', 'draft-only']) {
      expect(
        explainExactHeadAdmissionSelector({
          snapshot,
          admissionPr: 16068,
          admissionHead: HEAD,
          promotionMode,
          enrollSlots: 15,
        })
      ).toEqual({
        observed: true,
        queued: false,
        eligible: true,
        reason: 'eligible',
      });
    }
  });

  it.each([
    'hold',
    'gated',
    'incident',
  ])('blocks exact-head selection on the machine hold %s', label => {
    expect(SELECTOR_BLOCKING_LABELS.has(label)).toBe(true);
    expect(HARD_HOLD_LABELS.has(label)).toBe(true);
    expect(
      explainExactHeadAdmissionSelector({
        snapshot: [{ ...selectorRow, L: [label] }],
        admissionPr: 16068,
        admissionHead: HEAD,
        promotionMode: 'normal',
        enrollSlots: 15,
      })
    ).toMatchObject({ eligible: false, reason: `held-by=${label}` });
  });

  it.each([
    'human-review-required',
    'needs-human',
    'needs-human-review',
    'needs-human-taste',
    'needs:taste',
    'no-auto',
    'no-auto-merge',
    'no-automerge',
    'taste',
  ])('accepts an exact-head native receipt carrying legacy %s', async label => {
    const queuedAndHeld = prState({
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
      labels: { nodes: [{ name: label }] },
    });
    expect(hasAuthoritativeExactHeadQueueReceipt(queuedAndHeld, HEAD)).toBe(
      true
    );
    expect(canAcceptExactHeadQueueReceipt(queuedAndHeld, HEAD)).toBe(true);
    expect(explainExactHeadQueueReceipt(queuedAndHeld, HEAD)).toEqual({
      ok: true,
      reason: 'queued',
    });

    const runner = createNativeRunner({ states: [queuedAndHeld] });
    await expect(
      proveExactHeadQueueReceipt(
        nativeOptions(runner, { expectedHeadOid: HEAD })
      )
    ).resolves.toMatchObject({
      ok: true,
      attempts: 1,
      explanation: { ok: true, reason: 'queued' },
    });
    expect(invokedEnrollment(runner)).toBe(false);
  });

  it('proves a native receipt without mutation authorization', async () => {
    const runner = createNativeRunner({
      states: [
        prState({
          isInMergeQueue: true,
          mergeQueueEntry: QUEUE_ENTRY,
        }),
      ],
    });
    await expect(
      runCli(['prove-receipt', '14359', HEAD], {
        env: {
          MERGE_QUEUE_BACKEND: 'native',
          GITHUB_REPOSITORY: REPOSITORY,
        },
        runner,
        write: vi.fn(),
      })
    ).resolves.toMatchObject({ ok: true, state: { queued: true } });
    expect(invokedNativeMutation(runner)).toBe(false);
    expect(invokedMutationActorCheck(runner)).toBe(false);
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

  it('reads exact-target queue state for one PR instead of the whole fleet', async () => {
    const queued = prState({
      number: 16909,
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
    });
    const runner = createNativeRunner({ states: [queued] });
    await expect(
      listPullRequestQueueStates({
        ...nativeOptions(runner),
        exactPullRequestNumber: 16909,
      })
    ).resolves.toMatchObject({
      16909: { backend: 'native', queued: true, number: 16909 },
    });
    const queries = runner.mock.calls.map(call => queryText(call[0]));
    expect(
      queries.some(query => query.includes('MergeQueuePullRequestState'))
    ).toBe(true);
    expect(
      queries.some(query => query.includes('MergeQueueOpenPullRequestStates'))
    ).toBe(false);
  });
});
