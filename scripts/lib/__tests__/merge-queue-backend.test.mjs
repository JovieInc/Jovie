import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MERGE_QUEUE_BACKEND,
  dequeuePullRequest,
  enrollPullRequest,
  listPullRequestQueueStates,
  preflightMergeQueue,
  resolveMergeQueueBackend,
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
  states = [],
  listPages = null,
  enableResult = ok({ data: {} }),
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
  path,
  conclusion,
  name,
  workflowEvent = 'pull_request',
}) {
  const workflow = readRepoFile('.github/workflows/merge-queue-autoenroll.yml');
  const script = workflowRunScript(workflow, 'Resolve exact admission scope');
  const directory = mkdtempSync(join(tmpdir(), 'merge-queue-admission-'));
  const eventPath = join(directory, 'event.json');
  const outputPath = join(directory, 'output.txt');
  writeFileSync(
    eventPath,
    JSON.stringify({
      workflow_run: {
        path,
        conclusion,
        name,
        event: workflowEvent,
        head_sha: HEAD,
      },
    })
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
          EVENT_NAME: 'workflow_run',
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_OUTPUT: outputPath,
          MANUAL_PR: '',
          MANUAL_HEAD: '',
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
});

describe('queue workflow mutation safety', () => {
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
    const drain = readRepoFile('scripts/drain-pr-queue.sh');

    expect(workflow).toContain('types: [reopened, labeled, unlabeled]');
    expect(workflow).not.toContain('ready_for_review, reopened');

    expect(scope).toContain('case "$EVENT_NAME" in');
    expect(scope).toContain('pull_request)');
    expect(scope).toContain('workflow_run)');
    expect(scope).toContain('workflow_dispatch)');
    expect(scope).toContain('push)');
    expect(scope).toContain('.pull_request.head.sha');
    expect(scope).toContain('.pull_request.base.ref');
    expect(scope).toContain('.workflow_run.head_sha');
    expect(scope).toContain('--json number,headRefOid,baseRefName');
    expect(scope).toContain('select(.baseRefName == "main")');
    expect(scope).toContain('No unique open main PR owns workflow_run head');
    expect(scope).toContain('Untargeted manual dispatch; maintenance-only');
    expect(scope).toContain('Main push; maintenance-only');
    expect(enroll).toContain(
      'DRAIN_ADMISSION_PR: ${{ steps.admission.outputs.pr_number }}'
    );
    expect(enroll).toContain(
      'DRAIN_ADMISSION_HEAD: ${{ steps.admission.outputs.head_sha }}'
    );
    expect(enroll).toContain("DRAIN_RECONCILE_QUEUE_DEFERRED: '0'");
    expect(enroll).not.toContain("github.event_name == 'push' && '1' || '0'");
    expect(drain).toContain(
      'admission scope: maintenance-only (no new enrollment)'
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
    expect(drain).toContain(
      '.state.mergeQueueEntry.position | type == "number" and floor == . and . > 0'
    );
    expect(drain).toContain('could not compensate unproven native enrollment');
    expect(drain).toContain(
      'could not compensate malformed native enrollment receipt'
    );
    expect(drain).toContain(
      'exact admission #$DRAIN_ADMISSION_PR at $DRAIN_ADMISSION_HEAD has no native queue receipt'
    );
    expect(drain).toContain('exit 3');
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
        pr_number: '',
        head_sha: '',
        reconcile_queue_reentry: '1',
      })
    );
    expect(scope).toContain('"$workflow_path" == ".github/workflows/ci.yml"');
    expect(scope).toContain('.workflow_run.event // empty');
    expect(scope).toContain('== "merge_group"');
    expect(enroll).toContain('DRAIN_RECONCILE_QUEUE_REENTRY:');
    expect(enroll).toContain("DRAIN_QUEUE_REENTRY_MAX_PER_RUN: '2'");
    expect(drain).toContain('QUEUE_REENTRY_CONTEXT="jovie-queue-reentry/v1"');
    expect(drain).toContain(
      'bounded exact-head native re-entry after composite CI'
    );
    expect(drain).toContain('DRAIN_QUEUE_REENTRY_MAX_PER_RUN > 3');
    expect(drain).toContain('queue_reentry_receipt_is_recoverable "$head_oid"');
    expect(drain).toContain('check_failures_for_pr "$n"');
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
    expect(rebasePreflight).toContain(
      'MERGE_QUEUE_NATIVE_AUTHORIZATION: merge-queue-autoenroll'
    );
    expect(rebasePreflight).toContain(
      'GH_TOKEN: ${{ steps.app-token.outputs.token }}'
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
    expect(result).toMatchObject({ backend: 'native', changed: true });
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
