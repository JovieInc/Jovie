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
import { describe, expect, it } from 'vitest';
import {
  bindDispatchLiveHead,
  emptyRollingCiState,
  failureFingerprint,
  MAX_REPAIR_DELIVERIES,
  normalizeFailureEvents,
  parseMergeQueueFrontBranch,
  parseRollingCiState,
  planFailureDispatch,
  planGreenRecovery,
  ROLLING_CI_POLICY_VERSION,
  renderDispatchComment,
  resolveCiWorkflowRun,
  resolveDispatchPullRequest,
  runDispatch,
  TRUSTED_CI_WORKFLOW_PATH,
  TRUSTED_FAILURE_EVENTS,
  TRUSTED_PRODUCER_EVENTS,
  TRUSTED_REPOSITORY,
} from '../rolling-ci-dispatch.mjs';

const head = 'a'.repeat(40);
const nextHead = 'b'.repeat(40);
const policyHead = 'd'.repeat(40);
const CLI = resolve(import.meta.dirname, '..', '..', 'rolling-ci-dispatch.mjs');
const WORKFLOW = readFileSync(
  resolve(
    import.meta.dirname,
    '..',
    '..',
    '..',
    '.github/workflows/rolling-ci-dispatch.yml'
  ),
  'utf8'
);
const ACTIONLINT_CONFIG = readFileSync(
  resolve(import.meta.dirname, '..', '..', '..', '.github/actionlint.yaml'),
  'utf8'
);
const UPSERT_COMMENT = resolve(
  import.meta.dirname,
  '..',
  'upsert-pr-comment.sh'
);
const trustedSource = {
  eventName: 'workflow_run',
  workflow: 'CI',
  producerEvent: 'pull_request',
  trustedPolicyRef: 'main',
  workflowPath: TRUSTED_CI_WORKFLOW_PATH,
};
const matchingChecks = [
  { name: 'ci-fast', conclusion: 'failure', headSha: head, checkSuiteId: 44 },
];

const failureInput = {
  repository: 'JovieInc/Jovie',
  prNumber: 17,
  headSha: head,
  policySha: policyHead,
  workflowRunId: 9001,
  workflowRunAttempt: 1,
  failedJobs: [{ name: 'ci-fast', steps: ['Typecheck'] }],
  source: trustedSource,
  checkSuiteId: 44,
};

function event(overrides = {}) {
  return normalizeFailureEvents({ ...failureInput, ...overrides })[0];
}

function dispatchInput(overrides = {}) {
  return {
    ...failureInput,
    liveHead: head,
    checks: matchingChecks,
    writer: 'tim',
    priorCommentBody: '',
    conclusion: 'failure',
    ...overrides,
  };
}

function plan(eventValue = event(), extra = {}) {
  return planFailureDispatch({
    event: eventValue,
    liveHead: head,
    writer: 'tim',
    ...extra,
  });
}

describe('rolling CI failure dispatch', () => {
  it('normalizes repository, PR, exact head, check, attempt, and fingerprint', () => {
    expect(event()).toMatchObject({
      policyVersion: ROLLING_CI_POLICY_VERSION,
      repository: 'JovieInc/Jovie',
      pr: 17,
      head,
      policySha: policyHead,
      check: 'ci-fast',
      attempt: 1,
      checkSuiteId: '44',
      fingerprint: failureFingerprint({
        check: 'ci-fast',
        failedSteps: ['Typecheck'],
      }),
    });
  });

  it('accepts only the authoritative CI workflow_run source', () => {
    expect(TRUSTED_FAILURE_EVENTS).toEqual(['workflow_run']);
    for (const eventName of ['check_suite', 'check_run']) {
      expect(() =>
        event({
          source: {
            eventName,
            producerEvent: 'pull_request',
            trustedPolicyRef: 'main',
            checkSuiteAppSlug: 'github-actions',
          },
        })
      ).toThrow('failure source is not an authenticated CI workflow_run');
    }
  });

  it('resolves the authenticated CI workflow_run for a check suite', () => {
    const run = resolveCiWorkflowRun({
      headSha: head,
      checkSuiteId: 44,
      runs: [
        {
          id: 11,
          name: 'CI',
          path: TRUSTED_CI_WORKFLOW_PATH,
          event: 'pull_request',
          head_sha: head,
          check_suite_id: 44,
          run_attempt: 1,
        },
        {
          id: 12,
          name: 'Agent Pipeline',
          path: '.github/workflows/agent-pipeline.yml',
          event: 'pull_request',
          head_sha: head,
          check_suite_id: 44,
          run_attempt: 1,
        },
      ],
    });
    expect(run?.id).toBe(11);

    const newestRun = resolveCiWorkflowRun({
      headSha: head,
      runs: [
        {
          id: 100,
          name: 'CI',
          path: TRUSTED_CI_WORKFLOW_PATH,
          event: 'pull_request',
          head_sha: head,
          check_suite_id: 50,
          run_attempt: 2,
        },
        {
          id: 101,
          name: 'CI',
          path: TRUSTED_CI_WORKFLOW_PATH,
          event: 'pull_request',
          head_sha: head,
          check_suite_id: 51,
          run_attempt: 1,
        },
      ],
    });
    expect(newestRun).toMatchObject({ id: 101, run_attempt: 1 });
  });

  it('accepts authenticated merge_group CI for diagnostic dispatch', () => {
    const result = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(
        dispatchInput({
          writer: 'fx-hosted',
          source: { ...trustedSource, producerEvent: 'merge_group' },
        })
      ),
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      mutate: true,
      action: 'dispatch_implementer',
    });
  });

  it('authenticates native merge_group CI as a diagnostic producer', () => {
    expect(TRUSTED_PRODUCER_EVENTS).toEqual(['pull_request', 'merge_group']);
    expect(
      event({
        source: { ...trustedSource, producerEvent: 'merge_group' },
      }).source.producerEvent
    ).toBe('merge_group');
    expect(
      resolveCiWorkflowRun({
        headSha: head,
        checkSuiteId: 44,
        runs: [
          {
            id: 13,
            name: 'CI',
            path: TRUSTED_CI_WORKFLOW_PATH,
            event: 'merge_group',
            head_sha: head,
            check_suite_id: 44,
            run_attempt: 1,
          },
        ],
      })
    ).toMatchObject({ id: 13, event: 'merge_group' });
  });

  it('binds a merge-queue front PR to its exact synthetic head', () => {
    const baseSha = 'c'.repeat(40);
    expect(
      parseMergeQueueFrontBranch(`gh-readonly-queue/main/pr-16180-${baseSha}`)
    ).toEqual({ prNumber: 16180, baseSha });
    expect(
      resolveDispatchPullRequest({
        producerEvent: 'merge_group',
        headBranch: `refs/heads/gh-readonly-queue/main/pr-16180-${baseSha}`,
      })
    ).toEqual({
      prNumber: 16180,
      source: 'merge_queue_front_ref',
      baseSha,
    });
    expect(
      resolveDispatchPullRequest({
        producerEvent: 'pull_request',
        headBranch: `gh-readonly-queue/main/pr-16180-${baseSha}`,
      })
    ).toBeNull();
    expect(
      bindDispatchLiveHead({
        producerEvent: 'merge_group',
        liveHead: nextHead,
        expectedHead: head,
      })
    ).toEqual({ liveHead: head, reason: 'merge_group_synthetic_head' });
    expect(
      bindDispatchLiveHead({
        producerEvent: 'pull_request',
        liveHead: nextHead,
        expectedHead: head,
      })
    ).toBeNull();
  });

  it('rejects every producer except pull_request and merge_group', () => {
    expect(TRUSTED_PRODUCER_EVENTS).toEqual(['pull_request', 'merge_group']);
    expect(() =>
      event({
        source: { ...trustedSource, producerEvent: 'push' },
      })
    ).toThrow('failure source is not an authenticated CI workflow_run');
    expect(() =>
      event({
        source: { ...trustedSource, producerEvent: 'workflow_dispatch' },
      })
    ).toThrow('failure source is not an authenticated CI workflow_run');
    expect(
      runDispatch(
        dispatchInput({
          source: { ...trustedSource, producerEvent: 'merge_group' },
        })
      ).mutate
    ).toBe(true);
  });

  it('deliberate red: rejects unauthenticated or PR-controlled events', () => {
    expect(() =>
      event({
        source: {
          eventName: 'pull_request_target',
          workflow: 'CI',
          producerEvent: 'pull_request',
          trustedPolicyRef: 'feature-branch',
        },
      })
    ).toThrow('failure source is not an authenticated CI workflow_run');
    expect(() =>
      event({
        source: {
          ...trustedSource,
          workflowPath: '.github/workflows/agent-pipeline.yml',
        },
      })
    ).toThrow('failure source is not an authenticated CI workflow_run');
    expect(() =>
      event({
        source: {
          eventName: 'check_run',
          producerEvent: 'pull_request',
          trustedPolicyRef: 'main',
          checkSuiteAppSlug: 'github-actions',
          checkRunName: 'Snyk',
        },
      })
    ).toThrow('failure source is not an authenticated CI workflow_run');
  });

  it.each([
    ['event name', { eventName: undefined }],
    ['workflow name', { workflow: undefined }],
    ['workflow path', { workflowPath: undefined }],
    ['null workflow path', { workflowPath: null }],
    ['wrong workflow path', { workflowPath: '.github/workflows/other.yml' }],
    ['producer event', { producerEvent: undefined }],
    ['trusted policy ref', { trustedPolicyRef: undefined }],
  ])('deliberate red: rejects a missing or invalid %s', (_name, override) => {
    expect(() =>
      event({
        source: { ...trustedSource, ...override },
      })
    ).toThrow('failure source is not an authenticated CI workflow_run');
  });

  it('deliberate red: rejects checks that do not attest the exact head and suite', () => {
    expect(() =>
      runDispatch(
        dispatchInput({
          checks: [{ ...matchingChecks[0], headSha: nextHead }],
        })
      )
    ).toThrow('no authenticated checks match the exact head and suite');
  });

  it('deliberate red: rejects an event for a stale head', () => {
    expect(plan(event(), { liveHead: nextHead })).toMatchObject({
      action: 'reject_stale_head',
      mutate: false,
    });
  });

  it('deliberate red: deduplicates repeated delivery', () => {
    const first = plan();
    expect(plan(event(), { priorState: first.state })).toMatchObject({
      action: 'deduplicate_delivery',
      mutate: false,
    });
    expect(
      runDispatch(
        dispatchInput({
          priorCommentBody: renderDispatchComment({
            event: event(),
            plan: first,
          }),
        })
      )
    ).toMatchObject({
      action: 'deduplicate_delivery',
      mutate: false,
      body: '',
    });
  });

  it('deliberate red: rejects a competing remediation writer', () => {
    expect(
      plan(event({ workflowRunId: 9002, workflowRunAttempt: 2 }), {
        writer: 'fx',
        priorState: plan(event(), { writer: 'implementer' }).state,
      })
    ).toMatchObject({ action: 'reject_competing_writer', mutate: false });
  });

  it('supersedes obsolete repair state when a new commit fails', () => {
    const nextEvent = event({ headSha: nextHead, workflowRunId: 9002 });
    const next = plan(nextEvent, {
      liveHead: nextHead,
      priorState: plan().state,
    });
    expect(next.action).toBe('dispatch_superseding_head');
    expect(next.state.head).toBe(nextHead);
    expect(next.state.deliveries).toEqual([nextEvent.delivery]);
  });

  it('reopens the same failure when current-main policy supersedes its receipt', () => {
    const first = plan();
    const currentPolicyEvent = event({ policySha: 'e'.repeat(40) });
    const next = plan(currentPolicyEvent, { priorState: first.state });
    expect(next).toMatchObject({
      action: 'dispatch_superseding_policy',
      mutate: true,
      state: {
        policySha: 'e'.repeat(40),
        claim: { policySha: 'e'.repeat(40) },
      },
    });
    expect(
      next.state.failures[currentPolicyEvent.fingerprint].deliveryCount
    ).toBe(1);
  });

  it('deliberate red: bounds repeated repair deliveries', () => {
    let state = emptyRollingCiState(head, policyHead);
    expect(MAX_REPAIR_DELIVERIES).toBe(1);
    const first = plan(event(), { priorState: state });
    expect(first.mutate).toBe(true);
    state = first.state;
    expect(
      plan(event({ workflowRunId: 9010, workflowRunAttempt: 2 }), {
        priorState: state,
      })
    ).toMatchObject({
      action: 'terminal_configuration_incident',
      mutate: false,
      incident: { type: 'non_progressing_policy_cycle' },
    });
  });

  it('deliberate red: preserves a new actionable failure when a later fingerprint is exhausted', () => {
    const exhausted = runDispatch(
      dispatchInput({
        failedJobs: [{ name: 'z-exhausted', steps: ['Retry'] }],
        checks: [
          {
            name: 'z-exhausted',
            conclusion: 'failure',
            headSha: head,
            checkSuiteId: 44,
          },
        ],
      })
    );
    const actionableFingerprint = failureFingerprint({
      check: 'a-actionable',
      failedSteps: ['Typecheck'],
    });
    const next = runDispatch(
      dispatchInput({
        workflowRunId: 9010,
        workflowRunAttempt: 2,
        failedJobs: [
          { name: 'a-actionable', steps: ['Typecheck'] },
          { name: 'z-exhausted', steps: ['Retry'] },
        ],
        checks: [
          {
            name: 'a-actionable',
            conclusion: 'failure',
            headSha: head,
            checkSuiteId: 44,
          },
          {
            name: 'z-exhausted',
            conclusion: 'failure',
            headSha: head,
            checkSuiteId: 44,
          },
        ],
        priorCommentBody: exhausted.body,
      })
    );

    expect(next).toMatchObject({
      action: 'dispatch_implementer',
      mutate: true,
      state: {
        claim: { fingerprint: actionableFingerprint },
      },
    });
    expect(next.body).toContain(
      `- Failure fingerprint: \`${actionableFingerprint}\``
    );
  });

  it('admits only one new failure per controller lease without consuming siblings', () => {
    const firstFingerprint = failureFingerprint({
      check: 'a-first',
      failedSteps: ['Typecheck'],
    });
    const secondFingerprint = failureFingerprint({
      check: 'b-second',
      failedSteps: ['Unit tests'],
    });
    const next = runDispatch(
      dispatchInput({
        failedJobs: [
          { name: 'a-first', steps: ['Typecheck'] },
          { name: 'b-second', steps: ['Unit tests'] },
        ],
        checks: [
          {
            name: 'a-first',
            conclusion: 'failure',
            headSha: head,
            checkSuiteId: 44,
          },
          {
            name: 'b-second',
            conclusion: 'failure',
            headSha: head,
            checkSuiteId: 44,
          },
        ],
      })
    );

    expect(next).toMatchObject({
      action: 'dispatch_implementer',
      mutate: true,
      state: { claim: { fingerprint: firstFingerprint } },
    });
    expect(next.state.failures[firstFingerprint]?.deliveryCount).toBe(1);
    expect(next.state.failures[secondFingerprint]).toBeUndefined();
    expect(next.state.deliveries).toHaveLength(1);
    expect(next.body).toContain(
      `- Failure fingerprint: \`${next.state.claim.fingerprint}\``
    );
  });

  it('successful current-head rerun supersedes active repairs', () => {
    const recovered = planGreenRecovery({
      headSha: head,
      liveHead: head,
      priorState: plan().state,
    });
    expect(recovered).toMatchObject({
      action: 'supersede_repairs_green',
      mutate: true,
      state: { claim: null, failures: {} },
    });
    expect(
      planGreenRecovery({
        headSha: head,
        liveHead: head,
        priorState: recovered.state,
      })
    ).toMatchObject({ action: 'deduplicate_green', mutate: false });
  });

  it('persists a machine-readable lease in the PR status comment', () => {
    const failure = event();
    const planned = plan(failure);
    const body = renderDispatchComment({ event: failure, plan: planned });
    expect(body).toContain('@tim (active implementer)');
    expect(planned.state.claim.key).toBe(
      `JovieInc/Jovie:pr-17:${head}:${failure.fingerprint}:${policyHead}:${ROLLING_CI_POLICY_VERSION}`
    );
    expect(planned.state.claim.policyVersion).toBe(ROLLING_CI_POLICY_VERSION);
    expect(parseRollingCiState(body)).toEqual(planned.state);
    expect(
      renderDispatchComment({
        event: failure,
        plan: {
          ...planned,
          state: {
            ...planned.state,
            claim: { ...planned.state.claim, writer: 'fx-hosted' },
          },
        },
      })
    ).toContain('@fx-hosted (FX backstop)');
  });

  it('deliberate red: rejects LogYourBody even though the Cursor App is installed there', () => {
    expect(TRUSTED_REPOSITORY).toBe('JovieInc/Jovie');
    expect(() => event({ repository: 'JovieInc/LogYourBody' })).toThrow(
      'repository must be JovieInc/Jovie'
    );
  });

  it('supersedes the claim on a green rerun of the same head', () => {
    const green = runDispatch(
      dispatchInput({
        conclusion: 'success',
        failedJobs: [],
        checks: [{ ...matchingChecks[0], conclusion: 'success' }],
        priorCommentBody: runDispatch(dispatchInput()).body,
      })
    );
    expect(green).toMatchObject({
      action: 'supersede_repairs_green',
      mutate: true,
      state: { claim: null, failures: {} },
    });
  });
});

describe('rolling CI dispatch CLI and workflow', () => {
  it('deliberate red: CLI fails closed on unauthenticated source', () => {
    const ok = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(dispatchInput()),
      encoding: 'utf8',
    });
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout).action).toBe('dispatch_implementer');
    const result = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(
        dispatchInput({
          source: { ...trustedSource, eventName: 'workflow_dispatch' },
        })
      ),
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'failure source is not an authenticated CI workflow_run'
    );
  });

  it('uses authenticated workflow_run provenance and a bounded hosted writer', () => {
    for (const token of [
      'workflows: ["CI"]',
      "github.repository == 'JovieInc/Jovie'",
      "github.event.workflow_run.event == 'pull_request'",
      "github.event.workflow_run.path == '.github/workflows/ci.yml'",
      'steps.plan.outputs.pr_number',
      "github.event.workflow_run.conclusion == 'failure'",
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.workflow_run.conclusion == 'timed_out'",
      'EVENT_NAME: ${{ github.event_name }}',
      'WORKFLOW_PATH: ${{ github.event.workflow_run.path',
      'CHECK_SUITE_ID: ${{ github.event.workflow_run.check_suite_id',
      'EXPECTED_HEAD: ${{ github.event.workflow_run.head_sha',
      'ref: ${{ github.sha }}',
      'persist-credentials: false',
      'actions: read',
      'checks: read',
      'contents: read',
      'pull-requests: write',
      'GH_TOKEN: ${{ github.token }}',
      'secrets.CURSOR_API_KEY',
      'node scripts/lib/rolling-ci-fx.mjs',
      'scripts/lib/rolling-ci-handoff.mjs',
      'group: rolling-ci-remediation-global-v1',
      'cancel-in-progress: false',
      'Cursor patch artifact without GitHub authority',
      'Upload prelaunch receipt before model execution',
      'Create typed acceptance receipt after tests',
      'Publish typed terminal receipt',
      'runs-on: ubuntu-24.04',
      'runs-on: [self-hosted, Linux, X64, jovie-fixed]',
      'permission-contents: write',
      'repositories: Jovie',
      'hosted-commit',
      'hosted-validate-candidate',
      'hosted-apply-proposal',
      'hosted-verify-tree',
      'Shell(*)',
      'WebFetch(*)',
      'Mcp(*:*)',
      'startup_failure',
    ]) {
      expect(WORKFLOW, token).toContain(token);
    }
    expect(WORKFLOW).toMatch(/^permissions: \{\}$/m);
    expect(WORKFLOW).not.toMatch(/^\s+contents:\s+write\s*$/m);
    expect(WORKFLOW).not.toMatch(/^\s{2}check_suite:\s*$/m);
    expect(WORKFLOW).not.toMatch(/^\s{2}check_run:\s*$/m);
    expect(WORKFLOW).toContain('JOVIE_BOT_PRIVATE_KEY');
    expect(WORKFLOW).not.toContain(
      'ref: ${{ github.event.workflow_run.head_sha }}'
    );
    expect(WORKFLOW).not.toContain('Read(**/*)');
    expect(WORKFLOW).toContain('map("Read(" + . + ")")');
    expect(WORKFLOW).toContain('Write(**/*)');
    expect(WORKFLOW).not.toContain('--force');
    expect(WORKFLOW).not.toContain('--yolo');
    expect(WORKFLOW).toContain('--mode=ask --sandbox enabled');
    expect(WORKFLOW.indexOf('hosted-validate-candidate')).toBeLessThan(
      WORKFLOW.indexOf(
        '"$CURSOR_AGENT_PATH" --disable-auto-update -p --mode=ask'
      )
    );
    expect(WORKFLOW).toContain("event == 'merge_group'");
    expect(
      WORKFLOW.match(/github\.event\.workflow_run\.conclusion == 'timed_out'/g)
    ).toHaveLength(2);
    expect(WORKFLOW).toContain(
      `if [[ "$CONCLUSION" == 'failure' || "$CONCLUSION" == 'timed_out' ]]; then`
    );
    const mergeGroupJob = WORKFLOW.slice(
      WORKFLOW.indexOf('  merge_group_diagnostic:'),
      WORKFLOW.indexOf('\n  plan:')
    );
    const commitJob = WORKFLOW.slice(
      WORKFLOW.indexOf('  commit:'),
      WORKFLOW.indexOf('\n  terminal:')
    );
    expect(mergeGroupJob).toContain('remoteMutationAllowed:true');
    expect(mergeGroupJob).toContain(
      `if [[ "$CONCLUSION" == 'failure' || "$CONCLUSION" == 'timed_out' ]]; then`
    );
    expect(mergeGroupJob).toContain('listCursorAgents:false');
    expect(mergeGroupJob).not.toContain('create-github-app-token');
    expect(mergeGroupJob).not.toContain('hosted-commit');
    expect(mergeGroupJob).not.toContain('JOVIE_BOT_PRIVATE_KEY');
    expect(commitJob).toContain(
      "github.event.workflow_run.event == 'pull_request'"
    );
    expect(commitJob).toContain(
      'terminal_b64: ${{ steps.policy.outputs.terminal_b64 || steps.commit.outputs.terminal_b64 }}'
    );
    expect(commitJob).toContain("if: steps.policy.outputs.accepted == 'true'");
    expect(commitJob).toContain('--outcome stale_policy_base');
    expect(commitJob).toContain(
      'Block stale writer policy after publishing its terminal receipt'
    );
    expect(commitJob).toContain(
      'echo "outcome=$COMMIT_OUTCOME" >> "$GITHUB_OUTPUT"'
    );
    expect(commitJob).toContain(
      "if: steps.commit.outputs.outcome == 'stale_policy_base'"
    );
    expect(commitJob).toContain(
      'Block atomic writer policy race after publishing its terminal receipt'
    );
    expect(WORKFLOW).not.toContain('workflow_dispatch:');
    expect(WORKFLOW).not.toContain('gh workflow run');
    expect(WORKFLOW).not.toContain('gh run rerun');
    expect(WORKFLOW).not.toContain('gh pr merge');
    expect(WORKFLOW).not.toContain('gh pr ready');
    expect(WORKFLOW).not.toContain('gh pr edit');
  });

  it('binds every jq payload value into the exact planner input', () => {
    const planJob = WORKFLOW.slice(
      WORKFLOW.indexOf('  plan:'),
      WORKFLOW.indexOf('\n  prelaunch_gate:')
    );
    const payloadFilter = planJob.match(
      /^\s+'(\{repository:[^']+\})' \\$/m
    )?.[1];
    expect(payloadFilter).toBeDefined();

    const failedJobs = [
      { name: 'ci-fast', conclusion: 'failure', steps: ['Typecheck'] },
    ];
    const checks = [
      {
        name: 'ci-fast',
        conclusion: 'failure',
        headSha: head,
        checkSuiteId: 44,
      },
    ];
    const values = {
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      policySha: policyHead,
      liveHead: head,
      workflowRunId: '9001',
      workflowRunAttempt: 1,
      failedJobs,
      writer: 'tim',
      priorCommentBody: '',
      conclusion: 'failure',
      checkSuiteId: 44,
      checks,
      source: {
        eventName: 'workflow_run',
        workflow: 'CI',
        workflowPath: TRUSTED_CI_WORKFLOW_PATH,
        producerEvent: 'pull_request',
        trustedPolicyRef: 'main',
      },
    };
    const jqArgs = [
      '-n',
      '--arg',
      'repository',
      values.repository,
      '--argjson',
      'prNumber',
      String(values.prNumber),
      '--arg',
      'headSha',
      values.headSha,
      '--arg',
      'policySha',
      values.policySha,
      '--arg',
      'liveHead',
      values.liveHead,
      '--arg',
      'workflowRunId',
      values.workflowRunId,
      '--argjson',
      'workflowRunAttempt',
      String(values.workflowRunAttempt),
      '--argjson',
      'failedJobs',
      JSON.stringify(values.failedJobs),
      '--arg',
      'writer',
      values.writer,
      '--arg',
      'priorCommentBody',
      values.priorCommentBody,
      '--arg',
      'conclusion',
      values.conclusion,
      '--argjson',
      'checkSuiteId',
      String(values.checkSuiteId),
      '--argjson',
      'checks',
      JSON.stringify(values.checks),
      '--arg',
      'eventName',
      values.source.eventName,
      '--arg',
      'workflow',
      values.source.workflow,
      '--arg',
      'workflowPath',
      values.source.workflowPath,
      '--arg',
      'producerEvent',
      values.source.producerEvent,
      '--arg',
      'trustedPolicyRef',
      values.source.trustedPolicyRef,
      payloadFilter,
    ];
    const result = spawnSync('jq', jqArgs, { encoding: 'utf8' });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(values);
  });

  it('reads every job from the exact workflow run attempt', () => {
    expect(WORKFLOW).toMatch(/concurrency:\n(?:  .+\n)+?  queue: max/);
    expect(ACTIONLINT_CONFIG).toContain(
      '.github/workflows/rolling-ci-dispatch.yml:'
    );
    expect(WORKFLOW).toContain(
      'actions/runs/$WORKFLOW_RUN_ID/attempts/$WORKFLOW_RUN_ATTEMPT/jobs?per_page=100'
    );
    expect(WORKFLOW).toMatch(
      /gh api --paginate "repos\/\$REPOSITORY\/actions\/runs\/\$WORKFLOW_RUN_ID\/attempts\/\$WORKFLOW_RUN_ATTEMPT\/jobs\?per_page=100"/
    );
    expect(WORKFLOW).toMatch(
      /FAILED_JOBS=\$\(gh api --paginate[\s\S]*?--jq '\.jobs\[\][\s\S]*?\| jq -s '\.'\)/
    );
    expect(WORKFLOW).toContain(
      'actions/runs?head_sha=$EXPECTED_HEAD&per_page=100'
    );
    expect(WORKFLOW).toContain('resolveCiWorkflowRun');
    expect(WORKFLOW).toContain(
      'Event is not the latest canonical CI run for this exact head.'
    );
    expect(WORKFLOW).toContain(
      '^dispatch_(implementer|superseding_head|superseding_policy)$'
    );
    expect(WORKFLOW).toContain('pulls/$PR_NUMBER_EVENT/files?per_page=100');
    expect(WORKFLOW).toContain(
      "--jq '[.[] | {filename, status, previous_filename}]'"
    );
    expect(WORKFLOW).toContain('--argjson fileRecords "$PR_FILE_RECORDS"');
    expect(WORKFLOW).toContain(
      "'{dispatch:$dispatch[0],headRefName:$headRefName,fileRecords:$fileRecords,policySha:$policySha}'"
    );
    expect(WORKFLOW).toContain('hosted-promote-green');
    expect(WORKFLOW).toContain(
      'Candidate receipt matched green head without mutable repair state.'
    );
    expect(WORKFLOW).toContain('jovie-hosted-ci-terminal-receipt:%s');
    expect(WORKFLOW).toContain(
      '--slurpfile plan "$RUNNER_TEMP/hosted-repair/plan.json"'
    );
    expect(WORKFLOW).toContain(
      '$plan[0].allowedPaths | map("Read(" + . + ")")'
    );
    expect(WORKFLOW).toContain('--plan "$RUNNER_TEMP/hosted-repair/plan.json"');
    expect(WORKFLOW).not.toContain('https://cursor.com/install');
    expect(WORKFLOW).not.toContain('$HOME/.cursor/bin');
    expect(WORKFLOW).toContain(
      'https://downloads.cursor.com/lab/2026.08.25-3e8eec8/linux/x64/agent-cli-package.tar.gz'
    );
    expect(WORKFLOW).toContain(
      '7a212e5a17ff9316f5acc78808e33c536940d5455645022e6388d99ba48c8425'
    );
    expect(WORKFLOW).toContain('--disable-auto-update');
    expect(WORKFLOW).toMatch(/sha256sum --check --strict[\s\S]*?tar -x/);
    expect(WORKFLOW.match(/hosted-gate/g)).toHaveLength(3);
    expect(WORKFLOW.match(/rolling-ci-fx\.mjs hosted-policy/g)).toHaveLength(5);
    const prepareJob = WORKFLOW.slice(
      WORKFLOW.indexOf('  prepare:'),
      WORKFLOW.indexOf('\n  test:')
    );
    expect(prepareJob.indexOf('hosted-gate')).toBeLessThan(
      prepareJob.indexOf(
        '"$CURSOR_AGENT_PATH" --disable-auto-update -p --mode=ask'
      )
    );
    expect(prepareJob.indexOf('hosted-policy')).toBeLessThan(
      prepareJob.indexOf(
        '"$CURSOR_AGENT_PATH" --disable-auto-update -p --mode=ask'
      )
    );
    expect(
      prepareJob.indexOf(
        '"$CURSOR_AGENT_PATH" --disable-auto-update -p --mode=ask'
      )
    ).toBeLessThan(prepareJob.indexOf('hosted-apply-proposal'));
    const testJob = WORKFLOW.slice(
      WORKFLOW.indexOf('  test:'),
      WORKFLOW.indexOf('\n  write_gate:')
    );
    expect(testJob.indexOf('hosted-policy')).toBeLessThan(
      testJob.indexOf('git apply --check')
    );
    expect(
      WORKFLOW.indexOf('Invalidate receipts if trusted policy main advanced')
    ).toBeLessThan(
      WORKFLOW.indexOf('Generate Jovie-only short-lived writer token')
    );

    const failedJobsFilter = WORKFLOW.match(
      /FAILED_JOBS=\$\(gh api --paginate "[^"\n]*jobs\?per_page=100" \\\n+\s+--jq '([^']+)' \| jq -s '\.'\)/
    )?.[1];
    expect(failedJobsFilter).toBeDefined();

    const firstPageJobs = Array.from({ length: 100 }, (_, index) => ({
      name: `job-${index + 1}`,
      conclusion: 'success',
      steps: [
        {
          name: 'Passing step',
          conclusion: 'success',
        },
      ],
    }));
    const secondPageJobs = [
      {
        name: 'job-101',
        conclusion: 'failure',
        steps: [{ name: 'Late failing step', conclusion: 'failure' }],
      },
    ];
    const firstPage = spawnSync('jq', [failedJobsFilter], {
      input: JSON.stringify({ jobs: firstPageJobs }),
      encoding: 'utf8',
    });
    const secondPage = spawnSync('jq', [failedJobsFilter], {
      input: JSON.stringify({ jobs: secondPageJobs }),
      encoding: 'utf8',
    });
    expect(firstPage.status, firstPage.stderr).toBe(0);
    expect(secondPage.status, secondPage.stderr).toBe(0);
    const result = spawnSync('jq', ['-s', '.'], {
      input: `${firstPage.stdout}${secondPage.stdout}`,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        name: 'job-101',
        conclusion: 'failure',
        steps: ['Late failing step'],
      },
    ]);
  });

  function runUpsert(comments) {
    const root = mkdtempSync(join(tmpdir(), 'jovie-comment-boundary-'));
    try {
      const bin = join(root, 'bin');
      const log = join(root, 'gh.log');
      mkdirSync(bin);
      const gh = join(bin, 'gh');
      writeFileSync(
        gh,
        `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$GH_LOG"
if [[ "$*" == *'issues/17/comments'* ]]; then
  if [[ "$*" == *'select(.body'* ]]; then
    printf '%s\\n' "$LEGACY_IDS"
  else
    printf '%s\\n' "$COMMENTS"
  fi
fi
`
      );
      chmodSync(gh, 0o755);
      const result = spawnSync(
        'bash',
        [UPSERT_COMMENT, '17', 'rolling-ci-dispatch', 'trusted body'],
        {
          encoding: 'utf8',
          env: {
            ...process.env,
            BOT_COMMENT_AUTHOR: 'github-actions[bot]',
            COMMENTS: comments
              .map(comment => JSON.stringify(comment))
              .join('\n'),
            GH_LOG: log,
            LEGACY_IDS: comments.map(comment => comment.id).join('\n'),
            PATH: `${bin}:${process.env.PATH}`,
          },
        }
      );
      return { result, log: readFileSync(log, 'utf8') };
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }

  it('ignores an attacker marker and edits the one trusted bot comment', () => {
    const hidden = '<!-- bot-comment:rolling-ci-dispatch -->';
    const { result, log } = runUpsert([
      { id: 101, user: { login: 'attacker' }, body: hidden },
      { id: 202, user: { login: 'github-actions[bot]' }, body: hidden },
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(log).toContain('issues/comments/202');
    expect(log).not.toContain('issues/comments/101');
  });

  it('creates a trusted comment when only an attacker forged the marker', () => {
    const hidden = '<!-- bot-comment:rolling-ci-dispatch -->';
    const { result, log } = runUpsert([
      { id: 101, user: { login: 'attacker' }, body: hidden },
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(log).toContain('pr comment 17');
    expect(log).not.toContain('issues/comments/101');
  });
});
