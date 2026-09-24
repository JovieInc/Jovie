// biome-ignore-all format: keep origin/main layout under PR Size Guard
import { execFile, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { describe, expect, it, vi } from 'vitest';
import { classifyProductionMarkerEvidence } from '../../../.github/scripts/production-marker-state.mjs';
import {
  CANONICAL_NATIVE_MUTATION_ACTOR,
  canAcceptExactHeadQueueReceipt,
  DEFAULT_MERGE_QUEUE_BACKEND,
  dequeuePullRequest,
  enrollPullRequest,
  explainExactHeadAdmissionSelector,
  explainExactHeadQueueReceipt,
  formatBackendFailure,
  HARD_HOLD_LABELS,
  hasAuthoritativeExactHeadQueueReceipt,
  listPullRequestQueueStates,
  preflightMergeQueue,
  proveCanonicalMembership,
  proveExactHeadQueueReceipt,
  resolveMergeQueueBackend,
  runCli,
  SELECTOR_BLOCKING_LABELS,
  validateNativePreflightEvidence,
} from '../../merge-queue-backend.mjs';
import {
  attestationMatchesControllerRepair,
  renderControllerRepairAttestation,
  selectSeerControllerRepairReview,
} from '../controller-repair-attestation.mjs';

const REPOSITORY = 'JovieInc/Jovie';
const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
const RULESET_ID = 10512119;
const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);
const PR_ID = 'PR_kwDO_native_pr';
const ENTRY_ID = 'MQE_kwDO_native_entry';
const QUEUE_ENTRY = {
  id: ENTRY_ID,
  state: 'QUEUED',
  position: 1,
  enqueuedAt: '2026-07-15T00:00:00Z',
};
const AUTO_MERGE = { enabledAt: '2026-07-15T00:00:00Z' };
const VALID_REPOSITORY = Object.freeze(
  JSON.parse(
    '{"default_branch":"main","allow_auto_merge":true,"allow_squash_merge":true}'
  )
);
const VALID_RULESET = Object.freeze(
  JSON.parse(
    `{"id":${RULESET_ID},"enforcement":"active","target":"branch","conditions":{"ref_name":{"include":["refs/heads/main"],"exclude":[]}},"bypass_actors":[],"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"required_status_checks":[{"context":"PR Ready"},{"context":"Migration Guard"},{"context":"Fork PR Gate"},{"context":"PR Size Guard"}]}},{"type":"merge_queue","parameters":{"check_response_timeout_minutes":60,"grouping_strategy":"ALLGREEN","max_entries_to_build":2,"max_entries_to_merge":5,"merge_method":"SQUASH","min_entries_to_merge":5,"min_entries_to_merge_wait_minutes":10}}]}`
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
  checkResponseTimeout: 3600,
  maximumEntriesToBuild: 2,
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
function canonicalMembership(state) {
  return nativeStatePayload({
    ...state,
    mergeQueueEntry: {
      ...state.mergeQueueEntry,
      enqueuer: { __typename: 'Bot', login: 'jovie-bot' },
    },
    timelineItems: {
      nodes: [
        {
          __typename: 'AddedToMergeQueueEvent',
          id: 'event-current',
          createdAt: QUEUE_ENTRY.enqueuedAt,
          actor: { __typename: 'Bot', login: 'jovie-bot' },
          enqueuer: { login: CANONICAL_NATIVE_MUTATION_ACTOR },
        },
      ],
      pageInfo: { hasNextPage: false },
    },
  });
}
function createNativeRunner({
  ruleset = VALID_RULESET,
  repository = VALID_REPOSITORY,
  workflow = VALID_WORKFLOW,
  branchProtectionRef = VALID_BRANCH_PROTECTION_REF,
  liveQueueConfiguration = VALID_LIVE_QUEUE_CONFIGURATION,
  states = [],
  membershipPayload = null,
  listPages = null,
  enableResult = ok({ data: {} }),
  viewerPayload = /** @type {unknown} */ ({
    data: { viewer: { login: CANONICAL_NATIVE_MUTATION_ACTOR } },
  }),
} = {}) {
  const stateQueue = [...states];
  let lastState;
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
    if (query.includes('MergeQueueCanonicalMembership')) {
      return ok(membershipPayload ?? canonicalMembership(lastState));
    }
    if (query.includes('MergeQueuePullRequestState')) {
      const state = stateQueue.shift();
      if (!state) throw new Error('Test runner exhausted PR states');
      lastState = state;
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

function exactProductionMarkerEvidence({
  evidenceSha = HEAD,
  markerSha = evidenceSha,
  expired = false,
  conclusion = 'success',
  runRepository = REPOSITORY,
} = {}) {
  const workflowId = 9876;
  const controllerRun = 54321;
  return {
    sha: evidenceSha,
    repo: REPOSITORY,
    controllerWorkflowId: workflowId,
    markers: [
      {
        artifact: {
          id: 777,
          name: `production-generation-verified-${markerSha}`,
          expired,
          workflowRunId: controllerRun,
        },
        payload: {
          sha: markerSha,
          deploymentId: 'dpl_ExactProduction123',
          controllerRun: String(controllerRun),
          controllerAttempt: '1',
        },
        attemptRun: {
          id: controllerRun,
          run_attempt: 1,
          workflow_id: workflowId,
          path: '.github/workflows/production-controller.yml',
          head_sha: markerSha,
          head_branch: 'main',
          head_repository: { full_name: runRepository },
          event: 'workflow_run',
          status: 'completed',
          conclusion,
        },
        attemptJobs: [
          {
            id: 999,
            name: 'Production Verified',
            run_id: controllerRun,
            run_attempt: 1,
            head_sha: markerSha,
            head_branch: 'main',
            status: 'completed',
            conclusion: 'success',
          },
        ],
      },
    ],
    recoveryArtifacts: [],
  };
}

function executeHoldIntakePreflight({
  closureIntakeAllowed,
  cohortIntakeAllowed,
  closureStatus = undefined,
  closureReasons = undefined,
}) {
  const receipt = {
    schema: 'jovie-fleet-gate/v1',
    observedAt: new Date().toISOString(),
    state: 'AMBER',
    promotionMode: 'hold-intake',
    reasons: [{ code: 'production-deployment-unbound' }],
    reviewAdmission: {
      allowed: true,
      required: true,
      authority: 'Gem',
      scope: 'exact-main-head',
      headSha: HEAD,
      reviewer: 'Gem',
      reason: 'fresh-exact-head-independent-review',
      reviewId: 'test-exact-main-review',
      observedAt: new Date().toISOString(),
    },
    signals: {
      main: { status: 'green', sha: HEAD },
      production: { status: 'green' },
      controller: { status: 'green' },
      integrity: { status: 'clear' },
    },
    promotionAdmission: { allowed: false },
    isolatedPromotionAdmission: { allowed: false },
    productionUnboundRepairAdmission: {
      allowed: true,
      condition: 'production-deployment-unbound',
      mainSha: HEAD,
      deployedSha: OTHER_HEAD,
      maxConcurrent: 1,
      deploymentsAllowed: false,
    },
    closureAdmission: {
      allowed: closureIntakeAllowed,
      authority: 'Summer',
      status: closureStatus ?? (closureIntakeAllowed ? 'healthy' : 'red'),
      newIssueIntakeAllowed: closureIntakeAllowed,
      newImplementationAllowed: closureIntakeAllowed,
      fallbackPrGenerationAllowed: closureIntakeAllowed,
      promotionContinues: true,
      remediationContinues: true,
      ...(closureReasons ? { reasons: closureReasons } : {}),
    },
    alreadyAdmittedCohort: {
      preserve: true,
      newIntakeAllowed: cohortIntakeAllowed,
    },
  };
  return spawnSync('bash', ['scripts/drain-pr-queue.sh'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      DRY_RUN: '1',
      DRAIN_PROMOTION_MODE: 'hold-intake',
      DRAIN_FLEET_GATE_B64: Buffer.from(JSON.stringify(receipt)).toString(
        'base64'
      ),
      DRAIN_MAX_SECONDS: '10',
      DRAIN_ISOLATION_EVAL_TIMEOUT_SECONDS: '1',
      FLEET_HOLD_TTL_SECONDS: '0',
    },
  });
}

describe('merge queue backend resolution', () => {
  it.each([
    ['normal', 0],
    ['hold-intake', 0],
    ['draft-only', 0],
    ['controller-repair-only', 1],
    ['isolated-only', 1],
    ['deferred-release-only', 1],
  ])('the real drain preserves pending intent only for unleased mode %s', (mode, expectedStatus) => {
    const drain = readFileSync(
      join(REPO_ROOT, 'scripts/drain-pr-queue.sh'),
      'utf8'
    );
    const expression = drain.match(
      /if ! jq -e --arg expected_head "\$expected_head" --arg promotion_mode "\$DRAIN_PROMOTION_MODE" '([\s\S]*?)' <<</
    )?.[1];
    expect(expression).toBeTruthy();
    const result = spawnSync(
      'jq',
      [
        '-e',
        '--arg',
        'expected_head',
        HEAD,
        '--arg',
        'promotion_mode',
        mode,
        expression ?? 'error("missing predicate")',
      ],
      {
        encoding: 'utf8',
        input: JSON.stringify({
          disposition: 'auto-merge-pending',
          state: {
            state: 'OPEN',
            isDraft: false,
            headRefOid: HEAD,
            isInMergeQueue: false,
            mergeQueueEntry: null,
            autoMergeRequest: AUTO_MERGE,
          },
        }),
      }
    );
    expect(result.status, result.stderr).toBe(expectedStatus);
  });

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
      'Refusing live drain without GH_MUTATION_TOKEN'
    );
  });
});

describe('queue workflow mutation safety', () => {
  it('accepts the canonical healthy closure receipt during production-unbound repair', () => {
    const result = executeHoldIntakePreflight({
      closureIntakeAllowed: true,
      cohortIntakeAllowed: true,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      'FLEET_HOLD_TTL_SECONDS must be an integer from 1 through 3600'
    );
    expect(result.stderr).not.toContain(
      'Fleet receipt does not authorize promotion mode hold-intake'
    );
  });

  it('accepts Summer stop-line hold-intake while keeping promotion and remediation live', () => {
    const result = executeHoldIntakePreflight({
      closureIntakeAllowed: false,
      cohortIntakeAllowed: false,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      'FLEET_HOLD_TTL_SECONDS must be an integer from 1 through 3600'
    );
    expect(result.stderr).not.toContain(
      'Fleet receipt does not authorize promotion mode hold-intake'
    );
  });

  it('rejects a hold-intake receipt whose cohort contradicts Summer intake authority', () => {
    const result = executeHoldIntakePreflight({
      closureIntakeAllowed: false,
      cohortIntakeAllowed: true,
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      'Fleet receipt does not authorize promotion mode hold-intake'
    );
  });

  it('accepts issue-blocked red hold-intake while promotion stays held', () => {
    const result = executeHoldIntakePreflight({
      closureIntakeAllowed: true,
      cohortIntakeAllowed: true,
      closureStatus: 'red',
      closureReasons: [
        'queue-controller-red-over-10m',
        'unclassified-open-pr-over-15m',
      ],
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain(
      'FLEET_HOLD_TTL_SECONDS must be an integer from 1 through 3600'
    );
    expect(result.stderr).not.toContain(
      'Fleet receipt does not authorize promotion mode hold-intake'
    );
  });
  it('accepts only exact trusted production marker evidence at the checkpoint', () => {
    expect(
      classifyProductionMarkerEvidence(exactProductionMarkerEvidence())
    ).toMatchObject({
      state: 'verified',
      reason: 'exact_attempt_verified',
    });

    const rejected = [
      exactProductionMarkerEvidence({ expired: true }),
      exactProductionMarkerEvidence({
        evidenceSha: OTHER_HEAD,
        markerSha: HEAD,
      }),
      exactProductionMarkerEvidence({ runRepository: 'attacker/fork' }),
      exactProductionMarkerEvidence({ conclusion: 'failure' }),
      exactProductionMarkerEvidence({ conclusion: 'cancelled' }),
    ].map(evidence => classifyProductionMarkerEvidence(evidence));

    expect(rejected).toHaveLength(5);
    expect(rejected.every(result => result.state !== 'verified')).toBe(true);
    expect(rejected.map(result => result.reason)).toEqual([
      'malformed_or_contradictory_marker',
      'malformed_or_contradictory_marker',
      'contradictory_marker_attempt',
      'unsafe_or_contradictory_rollback',
      'unsafe_or_contradictory_rollback',
    ]);
  });

  it('keeps the controller repair escape exact, independently owned, and expiring', () => {
    const now = Date.parse('2026-09-06T18:00:00.000Z');
    const changedPathsSha256 = 'c'.repeat(64);
    const reviewId = 'github-review-17219';
    const body = renderControllerRepairAttestation(
      {
        schema: 'jovie-controller-repair-attestation/v1',
        kind: 'controller-runtime-repair',
        condition: 'controller-failure',
        repository: REPOSITORY,
        pr: 16546,
        head: HEAD,
        mainSha: OTHER_HEAD,
        reviewAuthority: 'github-approved-collaborator',
        reviewId,
        reviewedHead: HEAD,
        changedPathsSha256,
        issuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 15 * 60_000).toISOString(),
        deploymentsAllowed: false,
        runtimeActivationAllowed: false,
      },
      now
    );
    const exactScope = {
      repository: REPOSITORY,
      pr: 16546,
      head: HEAD,
      mainSha: OTHER_HEAD,
      changedPathsSha256,
      reviewId,
    };

    expect(
      attestationMatchesControllerRepair(body, {
        ...exactScope,
        minimumValidForMs: 2 * 60_000,
        now: now + 10 * 60_000,
      })
    ).toBe(true);
    expect(
      attestationMatchesControllerRepair(body, {
        ...exactScope,
        minimumValidForMs: 1,
        now: now + 15 * 60_000 + 1,
      })
    ).toBe(false);
    expect(
      attestationMatchesControllerRepair(body, {
        ...exactScope,
        head: OTHER_HEAD,
        minimumValidForMs: 1,
        now: now + 10 * 60_000,
      })
    ).toBe(false);
    expect(
      attestationMatchesControllerRepair(body, {
        ...exactScope,
        reviewId: 'github-review-99999',
        minimumValidForMs: 1,
        now: now + 10 * 60_000,
      })
    ).toBe(false);
  });

  it('binds controller repair authority to one successful exact-head Seer check', () => {
    const checkSuite = {
      app: { id: 12637, slug: 'sentry' },
      head_sha: HEAD,
      id: 92271699412,
    };
    const checkRun = {
      app: { id: 12637, slug: 'sentry' },
      check_suite: { id: checkSuite.id },
      conclusion: 'success',
      head_sha: HEAD,
      id: 101553168181,
      name: 'Seer Code Review',
      status: 'completed',
    };

    expect(
      selectSeerControllerRepairReview(
        { checkRuns: [checkRun], checkSuite },
        { expectedHead: HEAD }
      )
    ).toEqual({
      checkRunId: checkRun.id,
      checkSuiteId: checkSuite.id,
      reviewId: `seer-check-${checkRun.id}`,
      reviewedHead: HEAD,
    });

    for (const evidence of [
      { checkRuns: [{ ...checkRun, head_sha: OTHER_HEAD }], checkSuite },
      { checkRuns: [{ ...checkRun, conclusion: 'failure' }], checkSuite },
      {
        checkRuns: [checkRun, { ...checkRun, id: checkRun.id + 1 }],
        checkSuite,
      },
      {
        checkRuns: [{ ...checkRun, app: { id: 999, slug: 'attacker-review' } }],
        checkSuite,
      },
      {
        checkRuns: [checkRun],
        checkSuite: { ...checkSuite, head_sha: OTHER_HEAD },
      },
    ]) {
      expect(() =>
        selectSeerControllerRepairReview(evidence, { expectedHead: HEAD })
      ).toThrow();
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

  it.each([
    1, 2,
  ])('allows supported build count %s during rollout and rollback with truthful readback', buildCount => {
    const result = validateNativePreflightEvidence({
      ruleset: VALID_RULESET,
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef: VALID_BRANCH_PROTECTION_REF,
      liveQueueConfiguration: {
        ...VALID_LIVE_QUEUE_CONFIGURATION,
        maximumEntriesToBuild: buildCount,
      },
    });
    expect(result.ok).toBe(true);
    expect(result.policyReadback.observed.max_entries_to_build).toBe(
      buildCount
    );
    expect(result.policyReadback.matched).toBe(buildCount === 2);
    expect(result.policyReadback.drift).toEqual(
      buildCount === 1 ? ['max_entries_to_build'] : []
    );
  });

  it.each([
    0,
    3,
    100,
    -1,
    1.5,
    '2',
    null,
    undefined,
    true,
  ])('rejects unqualified or malformed build count %s', buildCount => {
    const ruleset = {
      ...VALID_RULESET,
      rules: VALID_RULESET.rules.map(rule =>
        rule.type === 'merge_queue'
          ? {
              ...rule,
              parameters: {
                ...rule.parameters,
                max_entries_to_build: buildCount,
              },
            }
          : rule
      ),
    };
    const result = validateNativePreflightEvidence({
      ruleset,
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef: VALID_BRANCH_PROTECTION_REF,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('max_entries_to_build');
  });

  it.each([
    ['check_response_timeout_minutes', 21],
    ['grouping_strategy', 'HEADGREEN'],
    ['max_entries_to_merge', 6],
  ])('still rejects %s drift while using rollback build concurrency', (field, value) => {
    const result = validateNativePreflightEvidence({
      ruleset: {
        ...VALID_RULESET,
        rules: VALID_RULESET.rules.map(rule =>
          rule.type === 'merge_queue'
            ? {
                ...rule,
                parameters: {
                  ...rule.parameters,
                  max_entries_to_build: 1,
                  [field]: value,
                },
              }
            : rule
        ),
      },
      repository: VALID_REPOSITORY,
      workflowYaml: VALID_WORKFLOW,
      branchProtectionRef: VALID_BRANCH_PROTECTION_REF,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain(field);
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
      observed: { max_entries_to_build: 2 },
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
      observed: { max_entries_to_build: 2 },
    });
    const liveConfigCall = runner.mock.calls.find(([args]) =>
      queryText(args).includes('MergeQueueLiveConfiguration')
    )?.[0];
    expect(liveConfigCall).toEqual(
      expect.arrayContaining(['-f', 'branch=main'])
    );
    expect(queryText(liveConfigCall)).toContain('maximumEntriesToBuild');
  });

  it('accepts the exact old 20-minute timeout during source-first cutover', () => {
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
      'check_response_timeout_minutes',
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
      'merge_queue check_response_timeout_minutes must be 60'
    );
    expect(actualTimeoutDrift.errors).toContain(
      'native queue policy readback drifted: check_response_timeout_minutes'
    );
  });

  it('reads live GraphQL checkResponseTimeout seconds as 60 minutes', async () => {
    const runner = createNativeRunner({
      liveQueueConfiguration: {
        ...VALID_LIVE_QUEUE_CONFIGURATION,
        checkResponseTimeout: 3600,
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
        observed: { check_response_timeout_minutes: 60 },
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
        observed: { max_entries_to_build: 2 },
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

function ghTransportFixtureError(error, stderr, environment, phases = {}) {
  let safeStderr = String(stderr ?? '');
  // Never print inherited credentials, the command/argv, or process.env.
  const secrets = Object.entries(environment)
    .filter(
      ([key, value]) =>
        /token|secret|password|credential|api.?key/i.test(key) && value
    )
    .map(([, value]) => String(value))
    .sort((a, b) => b.length - a.length);
  for (const secret of secrets)
    safeStderr = safeStderr.split(secret).join('[redacted]');
  return new Error(
    `gh HTTP transport fixture failed: ${JSON.stringify({
      code: error.code ?? null,
      killed: error.killed === true,
      signal: error.signal ?? null,
      stderr: safeStderr.slice(0, 1500),
      // Whitelist numeric lifecycle evidence only; never include response
      // bodies, command arguments, process objects, or ambient environment.
      phases: Object.fromEntries(
        [
          'elapsedMs',
          'spawnMs',
          'requestMs',
          'requestEndMs',
          'responseFinishMs',
          'exitMs',
          'stdoutBytes',
          'eventLoopDelayMaxMs',
        ].flatMap(key =>
          Number.isFinite(phases[key]) && phases[key] >= 0
            ? [[key, Math.round(phases[key])]]
            : []
        )
      ),
    })}`
  );
}

describe('canonical admission membership binding', () => {
  it('preserves process failure fields while redacting and bounding gh fixture stderr', () => {
    const environment = {
      GH_TOKEN: 'fixture-gh-token',
      GITHUB_TOKEN: 'inherited-github-token',
      OTHER_SECRET: 'other-private-value',
    };
    const error = ghTransportFixtureError(
      { code: 'ETIMEDOUT', killed: true, signal: 'SIGTERM' },
      `failed ${Object.values(environment).join(' ')} ${'x'.repeat(2000)}`,
      environment
    );
    expect(error.message).toContain('ETIMEDOUT');
    expect(error.message).toContain('"killed":true');
    expect(error.message).toContain('SIGTERM');
    expect(error.message).toContain('[redacted]');
    for (const secret of Object.values(environment)) {
      expect(error.message).not.toContain(secret);
    }
    expect(error.message.length).toBeLessThan(1800);
    expect(ghTransportFixtureError({ code: 1 }, '', {}).message).toContain(
      '"code":1,"killed":false,"signal":null'
    );
  });
  it('distinguishes pre-request and post-response timeouts without leaking extra phase data', () => {
    const error = { code: null, killed: true, signal: 'SIGTERM' };
    const beforeRequest = ghTransportFixtureError(
      error,
      '',
      {},
      {
        elapsedMs: 3001,
        spawnMs: 1,
        eventLoopDelayMaxMs: 2998,
        requestMs: NaN,
        body: 'private-body',
        token: 'private-token',
      }
    );
    const afterResponse = ghTransportFixtureError(
      error,
      '',
      {},
      {
        elapsedMs: 3002,
        spawnMs: 1,
        requestMs: 15,
        requestEndMs: 16,
        responseFinishMs: 17,
        stdoutBytes: 500,
        eventLoopDelayMaxMs: 20,
        exitMs: -1,
      }
    );
    expect(beforeRequest.message).toContain('"spawnMs":1');
    expect(beforeRequest.message).toContain('"eventLoopDelayMaxMs":2998');
    expect(beforeRequest.message).not.toMatch(
      /requestMs|private-body|private-token/
    );
    expect(afterResponse.message).toContain('"responseFinishMs":17');
    expect(afterResponse.message).toContain('"stdoutBytes":500');
    expect(afterResponse.message).not.toContain('exitMs');
  });
  it('encodes the GraphQL Int through the real gh HTTP transport', async () => {
    const config = mkdtempSync(join(tmpdir(), 'membership-gh-'));
    const started = performance.now();
    const phases = {};
    const mark = name => {
      phases[name] = performance.now() - started;
    };
    const eventLoopDelay = monitorEventLoopDelay({ resolution: 20 });
    eventLoopDelay.enable();
    /** @type {Array<Record<string, unknown>>} */
    const received = [];
    const server = createServer((request, response) => {
      mark('requestMs');
      response.once('finish', () => mark('responseFinishMs'));
      let body = '';
      request.on('data', chunk => {
        body += chunk;
      });
      request.on('end', () => {
        mark('requestEndMs');
        const payload = JSON.parse(body);
        received.push(payload);
        const valid = typeof payload.number === 'number';
        response.writeHead(valid ? 200 : 400, {
          'Content-Type': 'application/json',
        });
        response.end(
          JSON.stringify(
            valid
              ? canonicalMembership(
                  prState({
                    isInMergeQueue: true,
                    mergeQueueEntry: QUEUE_ENTRY,
                  })
                )
              : { errors: [{ message: 'Variable $number must be Int' }] }
          )
        );
      });
    });
    await new Promise(resolve =>
      server.listen(0, '127.0.0.1', () => resolve(undefined))
    );
    try {
      const address = server.address();
      if (!address || typeof address === 'string')
        throw new Error('Missing test port');
      const result = await proveCanonicalMembership({
        ...nativeOptions(
          args =>
            new Promise((resolve, reject) => {
              // Only redirect the endpoint. gh itself converts the production
              // argument flags to JSON; no live account or GitHub request is involved.
              const environment = {
                ...process.env,
                GH_CONFIG_DIR: config,
                GH_TOKEN: 'fixture',
                GH_ENTERPRISE_TOKEN: 'fixture',
              };
              const child = execFile(
                'gh',
                [
                  'api',
                  `http://127.0.0.1:${address.port}/graphql`,
                  ...args.slice(2),
                ],
                {
                  env: environment,
                  timeout: 3000,
                },
                (error, stdout, stderr) => {
                  if (error) {
                    mark('elapsedMs');
                    reject(
                      ghTransportFixtureError(error, stderr, environment, {
                        ...phases,
                        stdoutBytes: Buffer.byteLength(stdout),
                        eventLoopDelayMaxMs: eventLoopDelay.max / 1e6,
                      })
                    );
                    return;
                  }
                  resolve({ code: 0, stdout, stderr });
                }
              );
              child.once('spawn', () => mark('spawnMs'));
              child.once('exit', () => mark('exitMs'));
            })
        ),
        expectedHeadOid: HEAD,
        expectedEntryId: ENTRY_ID,
      });
      expect(result.entryId).toBe(ENTRY_ID);
      expect(received).toHaveLength(1);
      expect(received[0]).toMatchObject({
        number: 14359,
        owner: 'JovieInc',
        name: 'Jovie',
      });
      expect(received[0].query).toContain('$number:Int!');
      for (const phase of [
        'spawnMs',
        'requestMs',
        'requestEndMs',
        'responseFinishMs',
        'exitMs',
      ]) {
        expect(Number.isFinite(phases[phase])).toBe(true);
      }
    } finally {
      eventLoopDelay.disable();
      await new Promise(resolve => server.close(resolve));
      rmSync(config, { recursive: true, force: true });
    }
  });
  it('does not prove or stamp new membership when receipt evidence is unavailable', () => {
    const source = readRepoFile('scripts/drain-pr-queue.sh');
    const start = source.indexOf('record_queue_reentry_receipt() {');
    const end = source.indexOf('\n}\n', start) + 2;
    const result = spawnSync('bash', ['-c', `${source.slice(start, end)}
canonical_admission_producer_is_active() { return 0; }
fleet_hold_target_url() { echo https://github.com/JovieInc/Jovie/actions/runs/1; }
queue_reentry_receipt_is_recoverable() { return 2; }
node() { echo UNEXPECTED_PROOF >&2; }
gh_mutate_retry() { echo UNEXPECTED_STATUS >&2; }
record_queue_reentry_receipt 14359 "$EXPECTED_HEAD" "$EXPECTED_ENTRY" "2026-07-15T00:00:00Z"
`], {
      encoding: 'utf8',
      env: { ...process.env, DRY_RUN: '0', DRAIN_PROMOTION_MODE: 'normal',
        FLEET_POLICY_MAIN_SHA: HEAD, EXPECTED_HEAD: HEAD, EXPECTED_ENTRY: ENTRY_ID },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).not.toContain('UNEXPECTED_');
  });
  it.each([
    '2026-07-14T23:59:59Z',
    '2026-07-15T00:00:00Z',
  ])('reuses same-run status only since this entry (%s)', updatedAt => {
    const source = readRepoFile('scripts/drain-pr-queue.sh');
    const start = source.indexOf('queue_reentry_receipt_is_recoverable() {');
    const end =
      source.indexOf(
        '\n}\n',
        source.indexOf('record_queue_reentry_receipt() {')
      ) + 2;
    const target = 'https://github.com/JovieInc/Jovie/actions/runs/1';
    const status = {
      id: 1,
      context: 'jovie-queue-admission/v2',
      state: 'success',
      description: `checkpoint=source-qualified;main=${HEAD};pr=14359`,
      target_url: target,
      updated_at: updatedAt,
      creator: { type: 'Bot', login: CANONICAL_NATIVE_MUTATION_ACTOR },
    };
    const result = spawnSync(
      'bash',
      [
        '-c',
        `${source.slice(start, end)}
canonical_admission_producer_is_active() { return 0; }
canonical_admission_receipt_has_provenance() { return 0; }
fleet_hold_target_url() { echo "$TARGET"; }
gh_retry() { printf '%s' "$STATUSES"; }
node() { return 0; }
gh_mutate_retry() { echo STATUS_WRITE >&2; }
record_queue_reentry_receipt 14359 "$EXPECTED_HEAD" "$EXPECTED_ENTRY" "2026-07-15T00:00:00Z"
`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DRY_RUN: '0',
          DRAIN_PROMOTION_MODE: 'normal',
          FLEET_POLICY_MAIN_SHA: HEAD,
          EXPECTED_HEAD: HEAD,
          EXPECTED_ENTRY: ENTRY_ID,
          REPO: REPOSITORY,
          QUEUE_REENTRY_CONTEXT: 'jovie-queue-admission/v2',
          FLEET_HOLD_APP_USER: CANONICAL_NATIVE_MUTATION_ACTOR,
          TARGET: target,
          STATUSES: JSON.stringify([[status]]),
        },
      }
    );
    expect(result.status).toBe(0);
    expect(result.stderr.includes('STATUS_WRITE')).toBe(
      updatedAt < QUEUE_ENTRY.enqueuedAt
    );
    expect(result.stdout.includes('already recorded')).toBe(
      updatedAt === QUEUE_ENTRY.enqueuedAt
    );
  });
  it.each([
    false,
    true,
  ])('never publishes or reuses a receipt after failed membership proof (reuse=%s)', reuse => {
    const source = readRepoFile('scripts/drain-pr-queue.sh');
    const start = source.indexOf('record_queue_reentry_receipt() {');
    const end = source.indexOf('\n}\n', start) + 2;
    const result = spawnSync(
      'bash',
      [
        '-c',
        `${source.slice(start, end)}
canonical_admission_producer_is_active() { return 0; }
fleet_hold_target_url() { echo https://github.com/JovieInc/Jovie/actions/runs/1; }
queue_reentry_receipt_is_recoverable() { lookup_finished=1; return ${reuse ? 0 : 1}; }
node() { [[ "$lookup_finished" == 1 ]] || return 0; printf '%s\\n' "$*" >&2; return 1; }
gh_mutate_retry() { echo STATUS_WRITE; }
record_queue_reentry_receipt 14359 "$EXPECTED_HEAD" "$EXPECTED_ENTRY" "2026-07-15T00:00:00Z"
`,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DRY_RUN: '0',
          DRAIN_PROMOTION_MODE: 'normal',
          FLEET_POLICY_MAIN_SHA: HEAD,
          EXPECTED_HEAD: HEAD,
          EXPECTED_ENTRY: ENTRY_ID,
        },
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      `prove-admission 14359 ${HEAD} ${ENTRY_ID}`
    );
    expect(result.stdout).not.toMatch(/STATUS_WRITE|already recorded/);
  });
  const queued = () =>
    prState({ isInMergeQueue: true, mergeQueueEntry: QUEUE_ENTRY });
  it.each([
    'existing',
    'racing',
  ])('rejects %s human membership despite an authenticated bot caller', async phase => {
    const payload = canonicalMembership(queued());
    Object.assign(payload.data.repository.pullRequest.timelineItems.nodes[0], {
      actor: { __typename: 'User', login: 'itstimwhite' },
      enqueuer: { login: 'itstimwhite' },
    });
    const runner = createNativeRunner({
      states: phase === 'existing' ? [queued()] : [prState(), queued()],
      membershipPayload: payload,
    });
    await expect(enroll(runner)).rejects.toMatchObject({
      code: 'noncanonical_queue_membership',
    });
    expect(invokedEnrollment(runner)).toBe(phase === 'racing');
  });
  it.each([
    'head',
    'entry',
    'entry-actor',
    'event-time',
    'event-missing',
    'removed',
    'malformed',
    'api-error',
  ])('refuses changed or uncertain %s before publication', async change => {
    const payload = canonicalMembership(queued());
    const pr = payload.data.repository.pullRequest;
    if (change === 'entry-actor')
      pr.mergeQueueEntry.enqueuer = {
        __typename: 'User',
        login: 'itstimwhite',
      };
    if (change === 'head') pr.headRefOid = OTHER_HEAD;
    if (change === 'entry')
      pr.mergeQueueEntry = { ...QUEUE_ENTRY, id: 'replacement-entry' };
    if (change === 'event-time')
      pr.timelineItems.nodes[0].createdAt = '2026-07-14T00:00:00Z';
    if (change === 'event-missing') pr.timelineItems.nodes = [];
    if (change === 'removed')
      pr.timelineItems.nodes[0].__typename = 'RemovedFromMergeQueueEvent';
    if (change === 'malformed') pr.timelineItems.pageInfo.hasNextPage = true;
    const runner = createNativeRunner({
      membershipPayload:
        change === 'api-error'
          ? { errors: [{ message: 'unavailable' }] }
          : payload,
    });
    const write = vi.fn();
    await expect(
      runCli(['prove-admission', '14359', HEAD, ENTRY_ID], {
        runner,
        env: {},
        write,
      })
    ).rejects.toThrow();
    expect(write).not.toHaveBeenCalled();
    expect(invokedNativeMutation(runner)).toBe(false);
  });
  it('certifies the fresh matching bot entry through the publication CLI', async () => {
    const runner = createNativeRunner({
      membershipPayload: canonicalMembership(queued()),
    });
    const write = vi.fn();
    await runCli(['prove-admission', '14359', HEAD, ENTRY_ID], {
      runner,
      env: {},
      write,
    });
    expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({
      entryId: ENTRY_ID,
      eventId: 'event-current',
      state: { headRefOid: HEAD },
    });
    expect(invokedNativeMutation(runner)).toBe(false);
  });
  it('requires an observed entry identity', async () => {
    await expect(
      proveCanonicalMembership({
        backend: 'native',
        number: 14359,
        expectedHeadOid: HEAD,
        expectedEntryId: '',
      })
    ).rejects.toMatchObject({ code: 'invalid_queue_entry' });
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

  it('preserves existing native intent across discovery without claiming queue membership', async () => {
    const runner = createNativeRunner({
      states: [
        prState({ autoMergeRequest: AUTO_MERGE }),
        prState({ autoMergeRequest: AUTO_MERGE }),
      ],
    });
    await expect(
      enroll(runner, { postconditionAttempts: 1 })
    ).resolves.toMatchObject({
      changed: false,
      disposition: 'auto-merge-pending',
      state: {
        autoMergeEnabled: true,
        mergeQueueEntry: null,
        queued: false,
      },
    });
    expect(invokedNativeMutation(runner)).toBe(false);
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
    ['missing enqueuedAt', { id: ENTRY_ID, state: 'QUEUED', position: 1 }],
    ['malformed enqueuedAt', { ...QUEUE_ENTRY, enqueuedAt: 'not-a-date' }],
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

  it('preserves new native intent pending checks after bounded membership reads', async () => {
    const wait = vi.fn(async () => {});
    const successOnly = prState({ autoMergeRequest: AUTO_MERGE });
    const runner = createNativeRunner({
      states: [prState(), successOnly, successOnly],
    });

    await expect(
      enroll(runner, {
        postconditionAttempts: 2,
        postconditionDelayMs: 2_000,
        wait,
      })
    ).resolves.toMatchObject({
      changed: true,
      disposition: 'auto-merge-pending',
      state: {
        autoMergeRequest: AUTO_MERGE,
        mergeQueueEntry: null,
        queued: false,
      },
    });
    expect(invokedEnrollment(runner)).toBe(true);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  it.each([
    {},
    { enabledAt: 'invalid' },
    { enabledAt: null },
  ])('rejects malformed native intent %j without claiming membership', async autoMergeRequest => {
    const runner = createNativeRunner({
      states: [prState(), prState({ autoMergeRequest })],
    });
    await expect(
      enroll(runner, { postconditionAttempts: 1 })
    ).rejects.toMatchObject({ code: 'enrollment_postcondition_failed' });
  });

  it.each([
    'hold',
    'gated',
    'incident',
    'queue-deferred',
  ])('rejects pending intent when %s appears after the mutation', async label => {
    const runner = createNativeRunner({
      states: [
        prState(),
        prState({
          autoMergeRequest: AUTO_MERGE,
          labels: { nodes: [{ name: label }] },
        }),
      ],
    });
    await expect(
      enroll(runner, { postconditionAttempts: 1 })
    ).rejects.toMatchObject({ code: 'held_pull_request' });
  });

  it('reconciles a transport error only when exact native intent is observed', async () => {
    const runner = createNativeRunner({
      states: [prState(), prState({ autoMergeRequest: AUTO_MERGE })],
      enableResult: ok({ errors: [{ message: 'request interrupted' }] }),
    });
    await expect(
      enroll(runner, { postconditionAttempts: 1 })
    ).resolves.toMatchObject({
      disposition: 'auto-merge-pending',
      reconciledAfterCommandError: true,
      state: { queued: false },
    });
  });
});

describe('native dequeue', () => {
  it('rejects guarded CLI dequeue without the sole-writer authorization', async () => {
    const runner = vi.fn();

    await expect(
      runCli(['dequeue-ineligible', '14359', HEAD], {
        env: {
          MERGE_QUEUE_BACKEND: 'native',
          GITHUB_REPOSITORY: REPOSITORY,
        },
        runner,
        write: vi.fn(),
      })
    ).rejects.toMatchObject({ code: 'native_mutation_unauthorized' });
    expect(runner).not.toHaveBeenCalled();
  });

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

  it('runs the guarded CLI through live entry revalidation and external mutations', async () => {
    const queued = prState({
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
      autoMergeRequest: AUTO_MERGE,
    });
    const readRunner = createNativeRunner({
      states: [
        queued,
        queued,
        prState({ autoMergeRequest: AUTO_MERGE }),
        prState(),
      ],
    });
    const mutationRunner = createNativeRunner();
    const write = vi.fn();

    await expect(
      runCli(['dequeue-ineligible', '14359', HEAD], {
        env: {
          MERGE_QUEUE_BACKEND: 'native',
          GITHUB_REPOSITORY: REPOSITORY,
          MERGE_QUEUE_NATIVE_AUTHORIZATION: 'merge-queue-autoenroll',
        },
        runner: readRunner,
        mutationRunner,
        write,
      })
    ).resolves.toMatchObject({
      changed: true,
      guardedQueueEntry: {
        id: ENTRY_ID,
        enqueuedAt: QUEUE_ENTRY.enqueuedAt,
      },
    });

    expect(
      readRunner.mock.calls.filter(([args]) =>
        queryText(args).includes('MergeQueuePullRequestState')
      )
    ).toHaveLength(4);
    expect(invokedNativeMutation(readRunner)).toBe(false);
    expect(invokedMutationActorCheck(mutationRunner)).toBe(true);
    expect(
      mutationRunner.mock.calls.some(([args]) =>
        queryText(args).includes('dequeuePullRequest')
      )
    ).toBe(true);
    expect(
      mutationRunner.mock.calls.some(([args]) =>
        queryText(args).includes('disablePullRequestAutoMerge')
      )
    ).toBe(true);
    expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({
      changed: true,
      state: { headRefOid: HEAD, isInMergeQueue: false },
    });
  });

  it('suppresses the guarded CLI when the exact head changed before mutation', async () => {
    const readRunner = createNativeRunner({
      states: [
        prState({
          headRefOid: OTHER_HEAD,
          isInMergeQueue: true,
          mergeQueueEntry: QUEUE_ENTRY,
        }),
      ],
    });
    const mutationRunner = createNativeRunner();

    await expect(
      runCli(['dequeue-ineligible', '14359', HEAD], {
        env: {
          MERGE_QUEUE_BACKEND: 'native',
          GITHUB_REPOSITORY: REPOSITORY,
          MERGE_QUEUE_NATIVE_AUTHORIZATION: 'merge-queue-autoenroll',
        },
        runner: readRunner,
        mutationRunner,
        write: vi.fn(),
      })
    ).resolves.toMatchObject({
      changed: false,
      skipped: true,
      reason: 'head-changed',
    });
    expect(invokedNativeMutation(mutationRunner)).toBe(false);
  });

  it.each([
    ['id', { id: 'MQE_kwDO_replacement_entry' }],
    ['enqueuedAt', { enqueuedAt: '2026-07-15T00:01:00Z' }],
  ])('suppresses mutation when the live queue entry %s changed after observation', async (_field, replacement) => {
    const queued = prState({
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
    });
    const replaced = prState({
      isInMergeQueue: true,
      mergeQueueEntry: {
        ...QUEUE_ENTRY,
        ...replacement,
      },
    });
    const readRunner = createNativeRunner({ states: [queued, replaced] });
    const mutationRunner = createNativeRunner();

    await expect(
      runCli(['dequeue-ineligible', '14359', HEAD], {
        env: {
          MERGE_QUEUE_BACKEND: 'native',
          GITHUB_REPOSITORY: REPOSITORY,
          MERGE_QUEUE_NATIVE_AUTHORIZATION: 'merge-queue-autoenroll',
        },
        runner: readRunner,
        mutationRunner,
        write: vi.fn(),
      })
    ).resolves.toMatchObject({
      changed: false,
      skipped: true,
      reason: 'queue-entry-changed',
      guardedQueueEntry: {
        id: ENTRY_ID,
        enqueuedAt: QUEUE_ENTRY.enqueuedAt,
      },
    });
    expect(invokedNativeMutation(mutationRunner)).toBe(false);
  });

  it('reports a head race after dequeue without mutating replacement auto-merge', async () => {
    const queued = prState({
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
    });
    const readRunner = createNativeRunner({
      states: [
        queued,
        queued,
        prState({ headRefOid: OTHER_HEAD, autoMergeRequest: AUTO_MERGE }),
      ],
    });
    const mutationRunner = createNativeRunner();

    await expect(
      runCli(['dequeue-ineligible', '14359', HEAD], {
        env: {
          MERGE_QUEUE_BACKEND: 'native',
          GITHUB_REPOSITORY: REPOSITORY,
          MERGE_QUEUE_NATIVE_AUTHORIZATION: 'merge-queue-autoenroll',
        },
        runner: readRunner,
        mutationRunner,
        write: vi.fn(),
      })
    ).rejects.toMatchObject({
      code: 'dequeue_head_raced',
      details: { expectedHeadOid: HEAD },
    });
    expect(
      mutationRunner.mock.calls.some(([args]) =>
        queryText(args).includes('dequeuePullRequest')
      )
    ).toBe(true);
    expect(
      mutationRunner.mock.calls.some(([args]) =>
        queryText(args).includes('disablePullRequestAutoMerge')
      )
    ).toBe(false);
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

  it('rejects auto-merge success without an authoritative native queue entry', async () => {
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
      queries.some(query =>
        query.includes('mergeQueueEntry { id state position enqueuedAt }')
      )
    ).toBe(true);
    expect(
      queries.some(query => query.includes('MergeQueueOpenPullRequestStates'))
    ).toBe(false);
  });
});

describe('canonical current-entry ownership and event ordering', () => {
  const observedAt = Date.parse('2026-07-15T00:00:02Z');
  const payload = () =>
    canonicalMembership(
      prState({ isInMergeQueue: true, mergeQueueEntry: QUEUE_ENTRY })
    );
  const prove = (value, now = () => observedAt) =>
    proveCanonicalMembership({
      ...nativeOptions(() => Promise.resolve(ok(value))),
      expectedHeadOid: HEAD,
      expectedEntryId: ENTRY_ID,
      now,
    });

  it('reports a stale removal identity without certifying current membership', async () => {
    const value = payload();
    value.data.repository.pullRequest.timelineItems.nodes[0] = {
      __typename: 'RemovedFromMergeQueueEvent',
      id: 'removed-old-entry',
      createdAt: '2026-07-14T00:00:00Z',
      actor: { __typename: 'User', login: 'itstimwhite' },
    };
    const runner = vi.fn(async args => {
      expect(queryText(args)).toContain(
        '... on RemovedFromMergeQueueEvent{id createdAt actor{__typename login}}'
      );
      return ok(value);
    });
    await expect(proveCanonicalMembership({
      ...nativeOptions(runner), expectedHeadOid: HEAD,
      expectedEntryId: ENTRY_ID, now: () => observedAt,
    })).rejects.toMatchObject({
      code: 'noncanonical_queue_membership',
      details: { membershipEvidence: {
        eventId: 'removed-old-entry', eventType: 'RemovedFromMergeQueueEvent',
        createdAt: '2026-07-14T00:00:00Z', eventActorLogin: 'itstimwhite',
        failedPredicates: expect.arrayContaining(['addedEvent', 'eventNotBeforeEntry']),
      } },
    });
  });

  it.each([
    '2026-07-15T00:00:00Z',
    '2026-07-15T00:00:01Z',
    '2026-07-15T00:00:02Z',
  ])('accepts canonical current ownership with independently created event %s', async createdAt => {
    const value = payload();
    value.data.repository.pullRequest.timelineItems.nodes[0].createdAt =
      createdAt;
    await expect(prove(value)).resolves.toMatchObject({
      entryId: ENTRY_ID,
      eventId: 'event-current',
    });
  });

  it('captures observation time after the read completes', async () => {
    let completed = false;
    const value = payload();
    value.data.repository.pullRequest.timelineItems.nodes[0].createdAt =
      '2026-07-15T00:00:01Z';
    await expect(
      proveCanonicalMembership({
        ...nativeOptions(async () => {
          completed = true;
          return ok(value);
        }),
        expectedHeadOid: HEAD,
        expectedEntryId: ENTRY_ID,
        now: () => {
          expect(completed).toBe(true);
          return observedAt;
        },
      })
    ).resolves.toMatchObject({ entryId: ENTRY_ID });
  });

  it.each([
    ['old-episode', 'eventNotBeforeEntry'],
    ['malformed-event', 'eventTimestamp'],
    ['wrong-owner', 'entryBotLogin'],
    ['wrong-owner-type', 'entryBotType'],
    ['wrong-event-actor', 'eventBotLogin'],
    ['wrong-event-type', 'eventBotType'],
    ['wrong-enqueuer', 'eventEnqueuer'],
    ['removed', 'addedEvent'],
    ['missing', 'singleEvent'],
    ['replacement', 'currentEntry'],
    ['head', 'eligibleHead'],
  ])('rejects %s with exact failed predicate %s', async (change, predicate) => {
    const value = payload();
    const pr = value.data.repository.pullRequest;
    const event = pr.timelineItems.nodes[0];
    // Each actor/entry counterexample also has a valid +1s event timestamp.
    event.createdAt = '2026-07-15T00:00:01Z';
    if (change === 'old-episode') event.createdAt = '2026-07-14T23:59:59Z';
    if (change === 'future-event') event.createdAt = '2026-07-15T00:00:03Z';
    if (change === 'malformed-event') event.createdAt = 'not-a-time';
    if (change === 'future-entry')
      pr.mergeQueueEntry.enqueuedAt = '2026-07-15T00:00:03Z';
    if (change === 'wrong-owner')
      pr.mergeQueueEntry.enqueuer.login = 'other-bot';
    if (change === 'wrong-owner-type')
      pr.mergeQueueEntry.enqueuer.__typename = 'User';
    if (change === 'wrong-event-actor') event.actor.login = 'other-bot';
    if (change === 'wrong-event-type') event.actor.__typename = 'User';
    if (change === 'wrong-enqueuer') event.enqueuer.login = 'itstimwhite';
    if (change === 'removed') event.__typename = 'RemovedFromMergeQueueEvent';
    if (change === 'missing') pr.timelineItems.nodes = [];
    if (change === 'replacement') pr.mergeQueueEntry.id = 'replacement-entry';
    if (change === 'head') pr.headRefOid = OTHER_HEAD;
    await expect(
      prove(value, () => (change === 'invalid-observation' ? NaN : observedAt))
    ).rejects.toMatchObject({
      details: {
        membershipEvidence: {
          failedPredicates: expect.arrayContaining([predicate]),
        },
      },
    });
  });

  it.each([
    0, 1000,
  ])('observes future timestamps without adding a delivery veto (offset=%s)', async offset => {
    const value = payload();
    value.data.repository.pullRequest.mergeQueueEntry.enqueuedAt =
      '2026-07-15T00:00:03Z';
    value.data.repository.pullRequest.timelineItems.nodes[0].createdAt =
      new Date(observedAt + 1000 + offset).toISOString();
    const observe = vi.fn();
    await expect(
      proveCanonicalMembership({
        ...nativeOptions(async () => ok(value)),
        expectedHeadOid: HEAD,
        expectedEntryId: ENTRY_ID,
        now: () => observedAt,
        observe,
      })
    ).resolves.toMatchObject({ entryId: ENTRY_ID });
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: 'jovie-canonical-membership-observation/v1',
        failedPredicates: [],
        observationIssues: ['entryNotFuture', 'eventNotFuture'],
      })
    );
  });
  it('invalid observation clock and failed observation sink cannot veto admission', async () => {
    const observe = vi.fn(() => {
      throw new Error('sink unavailable');
    });
    await expect(
      proveCanonicalMembership({
        ...nativeOptions(async () => ok(payload())),
        expectedHeadOid: HEAD,
        expectedEntryId: ENTRY_ID,
        now: () => NaN,
        observe,
      })
    ).resolves.toMatchObject({ entryId: ENTRY_ID });
    expect(observe).toHaveBeenCalledWith(
      expect.objectContaining({
        failedPredicates: [],
        observedAt: null,
        observationIssues: expect.arrayContaining(['observedTimestamp']),
      })
    );
  });

  it('does not treat equal-second timestamps as proof of a particular operation', async () => {
    const value = payload();
    value.data.repository.pullRequest.timelineItems.nodes[0].id =
      'opaque-event-not-an-entry-id';
    // API has no event-to-entry key; direct current entry identity is authority.
    await expect(prove(value)).resolves.toMatchObject({ entryId: ENTRY_ID });
    value.data.repository.pullRequest.mergeQueueEntry.id =
      'different-current-entry';
    await expect(prove(value)).rejects.toMatchObject({
      code: 'queue_membership_changed',
    });
  });

  it('formats bounded raw predicate fields without body, credentials or API payload', async () => {
    const value = payload();
    Object.assign(value.data.repository.pullRequest, {
      body: 'BODY_SECRET',
      title: 'TITLE_SECRET',
      token: 'TOKEN_SECRET',
    });
    value.data.repository.pullRequest.timelineItems.nodes[0].actor.login =
      'x'.repeat(1000);
    let failure;
    try {
      await prove(value);
    } catch (error) {
      failure = error;
    }
    const output = formatBackendFailure(failure);
    expect(output).toContain('eventBotLogin');
    expect(output).toContain('jovie-canonical-membership-failure/v1');
    expect(output).not.toMatch(/BODY_SECRET|TITLE_SECRET|TOKEN_SECRET/);
    const receipt = JSON.parse(output.trim().split('\n')[1]);
    expect(receipt.eventActorLogin).toHaveLength(256);
    expect(receipt).toMatchObject({
      expectedHead: HEAD,
      expectedEntryId: ENTRY_ID,
      entryId: ENTRY_ID,
      enqueuedAt: QUEUE_ENTRY.enqueuedAt,
      createdAt: QUEUE_ENTRY.enqueuedAt,
      observedAt,
    });
    expect(
      formatBackendFailure(
        Object.assign(new Error('ordinary failure'), {
          details: { token: 'TOKEN_SECRET' },
        })
      )
    ).toBe('merge-queue-backend: ordinary failure\n');
  });
});

it('real prove-admission CLI emits only the sanitized failed-predicate receipt', () => {
  const directory = mkdtempSync(join(tmpdir(), 'membership-failure-cli-'));
  const value = canonicalMembership(
    prState({ isInMergeQueue: true, mergeQueueEntry: QUEUE_ENTRY })
  );
  value.data.repository.pullRequest.timelineItems.nodes[0].createdAt =
    '2026-07-14T23:59:59Z';
  Object.assign(value.data.repository.pullRequest, {
    body: 'BODY_SECRET',
    token: 'TOKEN_SECRET',
  });
  writeFileSync(join(directory, 'payload.json'), JSON.stringify(value));
  writeFileSync(
    join(directory, 'gh'),
    '#!/bin/sh\ncat "$MEMBERSHIP_TEST_PAYLOAD"\n'
  );
  chmodSync(join(directory, 'gh'), 0o755);
  try {
    const result = spawnSync(
      process.execPath,
      [
        resolve(REPO_ROOT, 'scripts/merge-queue-backend.mjs'),
        'prove-admission',
        '14359',
        HEAD,
        ENTRY_ID,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          MEMBERSHIP_TEST_PAYLOAD: join(directory, 'payload.json'),
          MERGE_QUEUE_BACKEND: 'native',
          REPO: REPOSITORY,
        },
      }
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    const receipt = JSON.parse(result.stderr.trim().split('\n')[1]);
    expect(receipt.failedPredicates).toEqual(['eventNotBeforeEntry']);
    expect(receipt.predicates.currentEntry).toBe(true);
    expect(result.stderr).not.toMatch(/BODY_SECRET|TOKEN_SECRET/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
