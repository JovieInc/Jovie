import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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
  NO_AUTO_HOLD_LABELS,
  preflightMergeQueue,
  proveExactHeadQueueReceipt,
  resolveMergeQueueBackend,
  runCli,
  SELECTOR_BLOCKING_LABELS,
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
const QUEUE_ENTRY = { id: ENTRY_ID, state: 'QUEUED', position: 1 };
const AUTO_MERGE = { enabledAt: '2026-07-15T00:00:00Z' };
const VALID_REPOSITORY = Object.freeze(
  JSON.parse(
    '{"default_branch":"main","allow_auto_merge":true,"allow_squash_merge":true}'
  )
);
const VALID_RULESET = Object.freeze(
  JSON.parse(
    `{"id":${RULESET_ID},"enforcement":"active","target":"branch","conditions":{"ref_name":{"include":["refs/heads/main"],"exclude":[]}},"bypass_actors":[],"rules":[{"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"required_status_checks":[{"context":"PR Ready"},{"context":"Migration Guard"},{"context":"Fork PR Gate"},{"context":"PR Size Guard"}]}},{"type":"merge_queue","parameters":{"check_response_timeout_minutes":60,"grouping_strategy":"ALLGREEN","max_entries_to_build":3,"max_entries_to_merge":10,"merge_method":"SQUASH","min_entries_to_merge":5,"min_entries_to_merge_wait_minutes":10}}]}`
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
  checkResponseTimeout: 60,
  maximumEntriesToBuild: 3,
  maximumEntriesToMerge: 10,
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

function workflowStep(workflow, name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  if (start === -1) throw new Error(`Workflow step not found: ${name}`);
  const end = workflow.indexOf('\n      - name:', start + marker.length);
  return workflow.slice(start, end === -1 ? undefined : end);
}

function workflowJobCondition(workflow, name) {
  const job = extractWorkflowJobBlock(workflow, name);
  const lines = job.split('\n');
  const start = lines.findIndex(line => line === '    if: >-');
  if (start === -1)
    throw new Error(`Workflow job condition not found: ${name}`);
  const condition = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith('      ')) break;
    condition.push(line.slice(6));
  }
  return condition.join(' ').trim();
}

function evaluateWorkflowJobCondition(condition, event) {
  const expression = condition
    .replaceAll('github.event_name', JSON.stringify(event.eventName))
    .replaceAll(
      'github.event.workflow_run.conclusion',
      JSON.stringify(event.conclusion ?? null)
    )
    .replaceAll(
      'github.event.workflow_run.path',
      JSON.stringify(event.path ?? null)
    )
    .replaceAll(
      'github.event.workflow_run.event',
      JSON.stringify(event.workflowEvent ?? null)
    );
  if (!/^[\s(),"'@/a-z0-9_!=|&.-]+$/i.test(expression)) {
    throw new Error(`Unsupported workflow condition: ${condition}`);
  }
  return Boolean(
    Function(
      'startsWith',
      `"use strict"; return (${expression});`
    )((value, prefix) => value?.startsWith(prefix) ?? false)
  );
}

function workflowRunScript(workflow, name) {
  const step = workflowStep(workflow, name);
  const marker = '        run: |\n';
  const start = step.indexOf(marker);
  if (start === -1) throw new Error(`Workflow run script not found: ${name}`);
  return step
    .slice(start + marker.length)
    .split('\n')
    .map(line => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');
}

function executeAdmissionScope({
  path = null,
  conclusion = null,
  name = null,
  workflowEvent = 'pull_request',
  pullRequests = [],
  pullRequestEvent = null,
}) {
  const workflow = readRepoFile('.github/workflows/merge-queue-autoenroll.yml');
  const script = workflowRunScript(workflow, 'Resolve exact admission scope');
  const directory = mkdtempSync(join(tmpdir(), 'merge-queue-admission-'));
  const eventPath = join(directory, 'event.json');
  const outputPath = join(directory, 'output.txt');
  const binPath = join(directory, 'bin');
  const ghPath = join(binPath, 'gh');
  mkdirSync(binPath);
  writeFileSync(
    ghPath,
    '#!/usr/bin/env bash\nprintf \'%s\\n\' "$MOCK_PULL_REQUESTS"\n'
  );
  chmodSync(ghPath, 0o755);
  writeFileSync(
    eventPath,
    JSON.stringify(
      pullRequestEvent ?? {
        workflow_run: {
          path,
          conclusion,
          name,
          event: workflowEvent,
          head_sha: HEAD,
        },
      }
    )
  );
  writeFileSync(outputPath, '');
  try {
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          EVENT_NAME: pullRequestEvent ? 'pull_request' : 'workflow_run',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_OUTPUT: outputPath,
          MANUAL_PR: '',
          MANUAL_HEAD: '',
          MOCK_PULL_REQUESTS: JSON.stringify(pullRequests),
          PATH: `${binPath}:${process.env.PATH}`,
          REPO: REPOSITORY,
        },
      }
    );
    if (result.status !== 0) {
      throw new Error(
        `Admission scope failed (${result.status}): ${result.stderr || result.stdout}`
      );
    }
    return Object.fromEntries(
      readFileSync(outputPath, 'utf8')
        .trim()
        .split('\n')
        .map(line => line.split('=', 2))
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function executeHoldIntakePreflight({
  closureIntakeAllowed,
  cohortIntakeAllowed,
}) {
  const receipt = {
    schema: 'jovie-fleet-gate/v1',
    observedAt: new Date().toISOString(),
    state: 'AMBER',
    promotionMode: 'hold-intake',
    signals: {
      main: { status: 'green' },
      production: { status: 'green' },
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
      status: closureIntakeAllowed ? 'healthy' : 'red',
      newIssueIntakeAllowed: closureIntakeAllowed,
      newImplementationAllowed: closureIntakeAllowed,
      fallbackPrGenerationAllowed: closureIntakeAllowed,
      promotionContinues: true,
      remediationContinues: true,
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

  it.each([
    ['success', '.github/workflows/production-controller.yml', true, '1'],
    [
      'success',
      '.github/workflows/production-controller.yml@refs/heads/main',
      true,
      '1',
    ],
    ['failure', '.github/workflows/production-controller.yml', true, '0'],
    [
      'failure',
      '.github/workflows/production-controller.yml@refs/heads/main',
      true,
      '0',
    ],
    ['cancelled', '.github/workflows/production-controller.yml', false, '0'],
    [
      'cancelled',
      '.github/workflows/production-controller.yml@refs/heads/main',
      false,
      '0',
    ],
  ])('classifies a %s Production Controller run at %s', (conclusion, path, admitted, recoverHolds) => {
    const workflow = readRepoFile(
      '.github/workflows/merge-queue-autoenroll.yml'
    );
    const condition = workflowJobCondition(workflow, 'enroll');
    const scope = workflowStep(workflow, 'Resolve exact admission scope');
    const dynamicRunName = `Production Controller ${HEAD} from CI 31699642425 attempt 1`;
    const outputs = executeAdmissionScope({
      path,
      conclusion,
      name: dynamicRunName,
    });

    expect(dynamicRunName).not.toBe('Production Controller');
    expect(workflow).not.toContain('github.event.workflow_run.name');
    expect(scope).not.toContain('.workflow_run.name');
    expect(
      evaluateWorkflowJobCondition(condition, {
        eventName: 'workflow_run',
        conclusion,
        path,
        workflowEvent: 'workflow_run',
      })
    ).toBe(admitted);
    expect(outputs).toEqual(
      expect.objectContaining({
        pr_number: '',
        head_sha: '',
        recover_holds: recoverHolds,
      })
    );
    expect(scope).toContain('workflow_path="${workflow_path%%@*}"');
    expect(scope).toContain(
      '[[ "$workflow_path" == ".github/workflows/production-controller.yml" ]]'
    );
    expect(scope).toContain(
      '[[ "$workflow_conclusion" == "success" ]] && recover_holds=1'
    );
  });

  it('scopes each new admission to the triggering PR and exact published head', () => {
    const workflow = readRepoFile(
      '.github/workflows/merge-queue-autoenroll.yml'
    );
    const scope = workflowStep(workflow, 'Resolve exact admission scope');
    const enroll = workflowStep(workflow, 'Enroll clean PRs');
    const fleetPolicy = workflowStep(workflow, 'Evaluate fresh fleet policy');
    const drain = readRepoFile('scripts/drain-pr-queue.sh');

    expect(workflow).toContain(
      'types: [reopened, labeled, unlabeled, enqueued]'
    );
    expect(workflow).not.toContain('ready_for_review, reopened');

    expect(fleetPolicy).toContain('github-token: ${{ github.token }}');
    expect(scope).toContain('case "$EVENT_NAME" in');
    expect(scope).toContain('GH_TOKEN: ${{ github.token }}');
    expect(enroll).toContain('GH_TOKEN: ${{ github.token }}');
    expect(enroll).toContain(
      'GH_MUTATION_TOKEN: ${{ steps.app-token.outputs.token }}'
    );
    expect(scope).toContain('pull_request)');
    expect(scope).toContain('workflow_run)');
    expect(scope).toContain('workflow_dispatch)');
    expect(scope).toContain('push)');
    expect(scope).toContain('.pull_request.head.sha');
    expect(scope).toContain('.pull_request.base.ref');
    expect(scope).toContain('.workflow_run.head_sha');
    expect(scope).toContain('--json number,headRefOid,baseRefName,isDraft');
    expect(scope).toContain('select(.baseRefName == "main")');
    expect(scope).toContain('No unique open main PR owns workflow_run head');
    expect(scope).toContain(
      'Untargeted manual dispatch; no primary target (bounded reconciliation remains enabled)'
    );
    expect(scope).toContain(
      'Main push; no primary target (bounded reconciliation remains enabled)'
    );
    expect(enroll).toContain(
      "DRAIN_ADMISSION_PR: ${{ steps.admission.outputs.disposition == 'candidate' && steps.admission.outputs.pr_number || '' }}"
    );
    expect(enroll).toContain(
      "DRAIN_ADMISSION_HEAD: ${{ steps.admission.outputs.disposition == 'candidate' && steps.admission.outputs.head_sha || '' }}"
    );
    expect(enroll).toContain("DRAIN_RECONCILE_QUEUE_DEFERRED: '0'");
    expect(enroll).not.toContain("github.event_name == 'push' && '1' || '0'");
    expect(drain).toContain(
      'admission scope: maintenance-only (no new enrollment)'
    );
    expect(drain).toContain(
      'admission scope: no primary target (bounded missed-admission recovery enabled)'
    );
    expect(drain).toContain(
      'no typed pressure-deferral provenance; owner release required'
    );
    expect(drain).toContain('"$n" != "$authorized_pr"');
    expect(drain).toContain('"$expected_head" != "$authorized_head"');
    expect(drain).toContain('select((.n | tostring) == $admission_pr)');
    expect(drain).toContain(
      'enrollment_receipt="$(node scripts/merge-queue-backend.mjs enroll "$n" "$head_oid")"'
    );
    expect(drain).toContain(
      '.state.mergeQueueEntry.state | IN("QUEUED", "AWAITING_CHECKS", "MERGEABLE", "UNMERGEABLE", "LOCKED")'
    );
    expect(drain).toContain('DEQUEUE (UNMERGEABLE native entry → typed eject)');
    expect(drain).toContain(
      'UNMERGEABLE_EJECT_CONTEXT="jovie-native-unmergeable/v1"'
    );
    expect(drain).toContain(
      'qs: ($states[(.n | tostring)].mergeQueueEntry.state // null)'
    );
    expect(drain).toContain('unmergeable-eject');
    expect(drain).toContain('changelog-collision');
    expect(drain).toContain('changelog-inventory');
    expect(drain).toContain('changelog-drain');
    expect(drain).toContain('pre-land-changelog');
    expect(drain).toContain('INVENTORY (pre-land CHANGELOG.md)');
    expect(drain).toContain(
      'DEQUEUE (pre-land CHANGELOG.md → drain without CI bypass)'
    );
    expect(drain).toContain(
      'queue-noop: classified-skip: exact admission #$DRAIN_ADMISSION_PR at $DRAIN_ADMISSION_HEAD'
    );
    expect(drain).toContain(
      '.state.mergeQueueEntry.position | type == "number" and floor == . and . > 0'
    );
    expect(drain).toContain('could not compensate unproven native enrollment');
    expect(drain).toContain(
      'could not compensate malformed native enrollment receipt'
    );
    expect(drain).toContain(
      'node scripts/merge-queue-backend.mjs explain-selector'
    );
    expect(drain).toContain(
      'node scripts/merge-queue-backend.mjs prove-receipt'
    );
    expect(drain).toContain('.state.isInMergeQueue == true');
    expect(drain).toContain(
      'NO_AUTO_HOLD_JQ=\'. == "no-auto" or . == "no-auto-merge" or . == "no-automerge"\''
    );
    expect(drain).toContain(
      '(.state.labels.nodes // []) | map(.name) | any(. == "needs-human" or . == "hold" or . == "gated" or . == "queue-deferred" or . == "needs-conflict-resolution" or . == "fast" or \'"$NO_AUTO_HOLD_JQ"\') | not'
    );
    expect(drain).toContain(
      'queue-noop: missing receipt: exact admission #$DRAIN_ADMISSION_PR at $DRAIN_ADMISSION_HEAD'
    );
    expect(drain).toContain(
      'queue-noop: selector: exact admission #$DRAIN_ADMISSION_PR at $DRAIN_ADMISSION_HEAD'
    );
    expect(drain).toContain('exit 3');
  });

  it.each([
    ['draft', 'success', true, 'draft-ineligible'],
    ['failed', 'failure', false, 'ci-not-successful'],
    ['pending', 'pending', false, 'ci-not-successful'],
    ['incomplete', null, false, 'ci-not-successful'],
  ])('treats a %s CI completion as typed neutral', (_kind, conclusion, isDraft, reason) => {
    const outputs = executeAdmissionScope({
      path: '.github/workflows/ci.yml',
      conclusion,
      name: 'CI',
      pullRequests: [
        {
          number: 16510,
          headRefOid: HEAD,
          baseRefName: 'main',
          isDraft,
        },
      ],
    });

    expect(outputs).toEqual(
      expect.objectContaining({
        disposition: 'neutral',
        reason,
        pr_number: '',
        head_sha: '',
        reconcile_queue_reentry: '0',
      })
    );
  });

  it('treats successful CI for a superseded source ref as typed neutral', () => {
    const outputs = executeAdmissionScope({
      path: '.github/workflows/ci.yml',
      conclusion: 'success',
      name: 'CI',
      pullRequests: [
        {
          number: 16546,
          headRefOid: OTHER_HEAD,
          baseRefName: 'main',
          isDraft: false,
        },
      ],
    });

    expect(outputs).toEqual(
      expect.objectContaining({
        disposition: 'neutral',
        reason: 'superseded-ref',
        pr_number: '',
        head_sha: '',
        reconcile_queue_reentry: '0',
      })
    );
  });

  it('treats a native enqueued event as an exact-head continuation candidate', () => {
    const outputs = executeAdmissionScope({
      pullRequestEvent: {
        action: 'enqueued',
        pull_request: {
          number: 16762,
          base: { ref: 'main' },
          head: { sha: HEAD },
        },
      },
    });

    expect(outputs).toEqual(
      expect.objectContaining({
        disposition: 'candidate',
        reason: 'pull-request-exact-head',
        pr_number: '16762',
        head_sha: HEAD,
      })
    );
  });

  it('selects a unique live non-draft main PR after successful CI', () => {
    const outputs = executeAdmissionScope({
      path: '.github/workflows/ci.yml',
      conclusion: 'success',
      name: 'CI',
      pullRequests: [
        {
          number: 16546,
          headRefOid: HEAD,
          baseRefName: 'main',
          isDraft: false,
        },
      ],
    });

    expect(outputs).toEqual(
      expect.objectContaining({
        disposition: 'candidate',
        reason: 'ci-success-exact-head',
        pr_number: '16546',
        head_sha: HEAD,
        reconcile_queue_reentry: '0',
      })
    );
  });

  it('reconciles only native exact-head receipts after an unattributable successful composite CI run', () => {
    const workflow = readRepoFile(
      '.github/workflows/merge-queue-autoenroll.yml'
    );
    const scope = workflowStep(workflow, 'Resolve exact admission scope');
    const enroll = workflowStep(workflow, 'Enroll clean PRs');
    const drain = readRepoFile('scripts/drain-pr-queue.sh');
    const outputs = executeAdmissionScope({
      path: '.github/workflows/ci.yml',
      conclusion: 'success',
      name: 'CI',
      workflowEvent: 'merge_group',
    });

    expect(outputs).toEqual(
      expect.objectContaining({
        disposition: 'neutral',
        reason: 'composite-merge-group',
        pr_number: '',
        head_sha: '',
        reconcile_queue_reentry: '1',
      })
    );
    expect(scope).toContain('"$workflow_path" == ".github/workflows/ci.yml"');
    expect(scope).toContain('.workflow_run.event // empty');
    expect(scope).toContain('== "merge_group"');
    expect(enroll).toContain('DRAIN_RECONCILE_QUEUE_REENTRY:');
    expect(enroll).toContain('DRAIN_RECONCILE_MISSED_ADMISSION:');
    expect(enroll).toContain("steps.admission.outputs.deferred_release != '1'");
    expect(enroll).toContain(
      "needs.fleet-policy.outputs.mode == 'hold-intake'"
    );
    expect(enroll).toContain("needs.fleet-policy.outputs.mode == 'draft-only'");
    expect(enroll).toContain("DRAIN_QUEUE_REENTRY_MAX_PER_RUN: '2'");
    expect(drain).toContain('QUEUE_REENTRY_CONTEXT="jovie-queue-reentry/v1"');
    expect(drain).toContain('bounded exact-head native admission');
    expect(drain).toContain('DRAIN_QUEUE_REENTRY_MAX_PER_RUN > 2');
    expect(drain).toContain('queue_reentry_receipt_is_recoverable "$head_oid"');
    expect(drain).toContain('check_failures_for_pr "$n"');
    expect(drain).toContain(
      '[[ "$ENROLLED_THIS_RUN" -ge "$DRAIN_QUEUE_REENTRY_MAX_PER_RUN" ]]'
    );
    expect(drain).toContain('select((.n | tostring) != $admission_pr)');
    expect(drain).toContain('enroll_if_still_eligible "$n" "$n" "$head_oid"');
  });

  it('excludes stacked non-main PRs from admission and live eligibility', () => {
    const workflow = readRepoFile(
      '.github/workflows/merge-queue-autoenroll.yml'
    );
    const scope = workflowStep(workflow, 'Resolve exact admission scope');
    const drain = readRepoFile('scripts/drain-pr-queue.sh');

    expect(scope).toContain('PR targets $base_ref, not main; maintenance-only');
    expect(scope).toContain('select(.baseRefName == "main")');
    expect(drain).toContain('baseRefName,baseRefOid');
    expect(drain).toContain(
      'json_fields="state,isDraft,mergeable,labels,headRefOid,baseRefName,body"'
    );
    expect(drain).toContain('.baseRefName == "main"');
    expect(drain).toContain('and (.base == "main")');
    expect(drain).toContain('select(.base=="main")');
    expect(drain).toContain('def main_target: .base == "main"');
    expect(drain).toContain('select(main_target and hard_gated)');
    expect(drain).toContain('select(main_target | not)');
  });

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
    const remediator = readRepoFile('scripts/drain-pr-remediate.mjs');
    const drain = readRepoFile('scripts/drain-pr-queue.sh');
    const tokenAction =
      'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1';

    expect(workflow).toContain(
      'MERGE_QUEUE_BACKEND: ${{ vars.MERGE_QUEUE_BACKEND }}'
    );
    expect(workflow).not.toContain("MERGE_QUEUE_BACKEND || 'graphite'");
    expect(drain).toContain(
      'MERGE_QUEUE_BACKEND="${MERGE_QUEUE_BACKEND:-native}"'
    );
    expect(drain).not.toContain('MERGE_QUEUE_BACKEND:-graphite');
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
      expect(step).not.toContain('secrets.GITHUB_TOKEN');
    }
    expect(enroll).toContain('GH_TOKEN: ${{ github.token }}');
    expect(enroll).toContain(
      'GH_MUTATION_TOKEN: ${{ steps.app-token.outputs.token }}'
    );
    expect(rebasePreflight).toContain('GH_TOKEN: ${{ github.token }}');
    expect(rebaseMutation).toContain(
      'GH_TOKEN: ${{ steps.app-token.outputs.token }}'
    );
    expect(enroll).toContain('if [[ "$MERGE_QUEUE_BACKEND" != "native" ]]');
    expect(enroll).toContain('bash scripts/drain-pr-queue.sh');
    expect(enroll).toContain('EVENT_NAME: ${{ github.event_name }}');
    expect(enroll).toContain(
      "WORKFLOW_RUN_EVENT: ${{ github.event.workflow_run.event || '' }}"
    );
    expect(enroll).toContain('set +e');
    expect(enroll).toContain('drain_rc=$?');
    expect(enroll).toContain('product_pr_check=0');
    expect(enroll).toContain('[[ "$EVENT_NAME" == "pull_request" ]]');
    expect(enroll).toContain(
      '[[ "$EVENT_NAME" == "workflow_run" && "$WORKFLOW_RUN_EVENT" == "pull_request" ]]'
    );
    expect(enroll).toContain(
      'queue-noop is a controller disposition, not a product-quality failure'
    );
    expect(enroll).toContain("failure='dropped-controller-event'");
    expect(enroll).toContain("failure='queue-noop'");
    expect(enroll).toContain('[[ "$drain_rc" -eq 3 ]]');
    expect(enroll).toContain('--arg failure "$failure"');
    expect(enroll).toContain(
      'delivery-control-failure dispatched for $failure'
    );
    expect(enroll).not.toContain("--arg failure 'queue-noop'");
    expect(enroll).toContain(
      'Cannot emit delivery-control-failure without exact PR/head'
    );
    expect(enroll).toContain(
      'gh api --method POST "repos/$REPO/dispatches" --input -'
    );
    expect(enroll).toContain('event_type: "delivery-control-failure"');
    expect(enroll).toContain('source: $source');
    expect(enroll).toContain('failure: $failure');
    expect(enroll).toContain('pr_number: ($pr_number | tonumber)');
    expect(enroll).toContain('head_sha: $head_sha');
    expect(enroll).toContain('not failing the product PR check');
    expect(enroll.indexOf('gh api --method POST')).toBeLessThan(
      enroll.indexOf('not failing the product PR check')
    );
    expect(enroll).toContain('exit "$drain_rc"');
    expect(rebasePreflight).toContain(
      'if [[ "$MERGE_QUEUE_BACKEND" != "native" ]]'
    );
    expect(rebasePreflight).toContain(
      'node scripts/merge-queue-backend.mjs preflight'
    );
    expect(rebasePreflight).toContain(
      'MERGE_QUEUE_NATIVE_AUTHORIZATION: merge-queue-autoenroll'
    );
    expect(
      drain.indexOf('node scripts/merge-queue-backend.mjs preflight')
    ).toBeLessThan(
      drain.indexOf('node scripts/merge-queue-backend.mjs list-state')
    );
    expect(rebaseMutation).toContain("DRAIN_REMEDIATE_MAX_PER_RUN: '24'");
    expect(remediator).toContain("DRAIN_REMEDIATE_MAX_PER_RUN ?? '24'");
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
                max_entries_to_build: 1,
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
      observed: { max_entries_to_build: 3 },
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
      observed: { max_entries_to_build: 3 },
    });
    const liveConfigCall = runner.mock.calls.find(([args]) =>
      queryText(args).includes('MergeQueueLiveConfiguration')
    )?.[0];
    expect(liveConfigCall).toEqual(
      expect.arrayContaining(['-f', 'branch=main'])
    );
    expect(queryText(liveConfigCall)).toContain('maximumEntriesToBuild');
  });

  it('does not fail enroll preflight when GraphQL checkResponseTimeout is seconds for a 60-minute lock', () => {
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
        checkResponseTimeout: 3600,
        minimumEntriesToMerge: 1,
        minimumEntriesToMergeWaitTime: 0,
      },
    });
    expect(falseDrift.ok).toBe(true);
    expect(
      falseDrift.policyReadback.observed.check_response_timeout_minutes
    ).toBe(60);
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
                max_entries_to_build: 1,
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
        observed: { max_entries_to_build: 3 },
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

  it('refuses a held exact head before invoking the enrollment mutation', async () => {
    const runner = createNativeRunner({
      states: [prState({ labels: { nodes: [{ name: 'queue-deferred' }] } })],
    });
    await expect(enroll(runner)).rejects.toMatchObject({
      code: 'held_pull_request',
      details: { labels: ['queue-deferred'] },
    });
    expect(invokedEnrollment(runner)).toBe(false);
  });

  it.each([
    ...NO_AUTO_HOLD_LABELS,
  ])('refuses a %s tombstone before invoking the enrollment mutation', async label => {
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
    ...NO_AUTO_HOLD_LABELS,
  ])('refuses a delayed queue entry when a %s tombstone appears after SNAP', async label => {
    const queuedAndHeld = prState({
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
      autoMergeRequest: AUTO_MERGE,
      labels: { nodes: [{ name: label }] },
    });
    const runner = createNativeRunner({
      states: [prState(), queuedAndHeld],
    });
    await expect(
      enroll(runner, { postconditionAttempts: 2, wait: async () => {} })
    ).rejects.toMatchObject({
      code: 'held_pull_request',
      details: { labels: [label] },
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
      labels: { nodes: [{ name: 'needs-human' }] },
    });
    expect(hasAuthoritativeExactHeadQueueReceipt(queuedAndHeld, HEAD)).toBe(
      true
    );
    expect(canAcceptExactHeadQueueReceipt(queuedAndHeld, HEAD)).toBe(false);
    expect(explainExactHeadQueueReceipt(queuedAndHeld, HEAD)).toEqual({
      ok: false,
      reason: 'held-by=needs-human',
    });

    const runner = createNativeRunner({ states: [queuedAndHeld] });
    await expect(
      proveExactHeadQueueReceipt(
        nativeOptions(runner, { expectedHeadOid: HEAD })
      )
    ).resolves.toMatchObject({
      ok: false,
      attempts: 1,
      explanation: { ok: false, reason: 'held-by=needs-human' },
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

  it('treats the no-auto tombstone family as a durable selector hard hold', () => {
    const preRepairSelectorBlockingLabels = new Set([
      'needs-human',
      'hold',
      'gated',
      'needs-conflict-resolution',
      'fast',
    ]);
    expect([...NO_AUTO_HOLD_LABELS]).toEqual([
      'no-auto',
      'no-auto-merge',
      'no-automerge',
    ]);
    for (const label of NO_AUTO_HOLD_LABELS) {
      expect(preRepairSelectorBlockingLabels.has(label)).toBe(false);
      expect(SELECTOR_BLOCKING_LABELS.has(label)).toBe(true);
      expect(HARD_HOLD_LABELS.has(label)).toBe(true);

      const snapshot = [{ ...selectorRow, L: [label] }];
      expect(
        snapshot[0].L.some(name => preRepairSelectorBlockingLabels.has(name))
      ).toBe(false);

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
          eligible: false,
          reason: `held-by=${label}`,
        });
      }
    }
  });

  it.each([
    ...NO_AUTO_HOLD_LABELS,
  ])('does not treat a delayed native entry as a receipt when %s is live', async label => {
    const queuedAndHeld = prState({
      isInMergeQueue: true,
      mergeQueueEntry: QUEUE_ENTRY,
      labels: { nodes: [{ name: label }] },
    });
    expect(hasAuthoritativeExactHeadQueueReceipt(queuedAndHeld, HEAD)).toBe(
      true
    );
    expect(canAcceptExactHeadQueueReceipt(queuedAndHeld, HEAD)).toBe(false);
    expect(explainExactHeadQueueReceipt(queuedAndHeld, HEAD)).toEqual({
      ok: false,
      reason: `held-by=${label}`,
    });

    const runner = createNativeRunner({ states: [queuedAndHeld] });
    await expect(
      proveExactHeadQueueReceipt(
        nativeOptions(runner, { expectedHeadOid: HEAD })
      )
    ).resolves.toMatchObject({
      ok: false,
      attempts: 1,
      explanation: { ok: false, reason: `held-by=${label}` },
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
});
