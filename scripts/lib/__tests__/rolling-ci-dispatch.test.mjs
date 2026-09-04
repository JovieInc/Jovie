import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  });

  it('deliberate red: dispatch CLI rejects merge_group even with a writer', () => {
    const result = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(
        dispatchInput({
          writer: 'fx-hosted',
          source: { ...trustedSource, producerEvent: 'merge_group' },
        })
      ),
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'failure source is not an authenticated CI workflow_run'
    );
  });

  it('rejects native merge_group CI as a synthetic producer', () => {
    expect(TRUSTED_PRODUCER_EVENTS).toEqual(['pull_request']);
    expect(() =>
      event({
        source: { ...trustedSource, producerEvent: 'merge_group' },
      })
    ).toThrow('failure source is not an authenticated CI workflow_run');
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
    ).toBeNull();
  });

  it('recognizes but never admits a merge-queue synthetic ref', () => {
    const baseSha = 'c'.repeat(40);
    expect(
      parseMergeQueueFrontBranch(`gh-readonly-queue/main/pr-16180-${baseSha}`)
    ).toEqual({ prNumber: 16180, baseSha });
    expect(
      resolveDispatchPullRequest({
        producerEvent: 'merge_group',
        headBranch: `refs/heads/gh-readonly-queue/main/pr-16180-${baseSha}`,
      })
    ).toBeNull();
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
    ).toBeNull();
    expect(
      bindDispatchLiveHead({
        producerEvent: 'pull_request',
        liveHead: nextHead,
        expectedHead: head,
      })
    ).toBeNull();
  });

  it('deliberate red: rejects every producer except pull_request', () => {
    expect(TRUSTED_PRODUCER_EVENTS).toEqual(['pull_request']);
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
    expect(() =>
      runDispatch(
        dispatchInput({
          source: { ...trustedSource, producerEvent: 'merge_group' },
        })
      )
    ).toThrow('failure source is not an authenticated CI workflow_run');
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

  it('deliberate red: bounds repeated repair deliveries', () => {
    let state = emptyRollingCiState(head);
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

  it('preserves an actionable failure when a later fingerprint is exhausted', () => {
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
      state: { claim: { fingerprint: actionableFingerprint } },
    });
    expect(next.body).toContain(
      `- Failure fingerprint: \`${actionableFingerprint}\``
    );
  });

  it('admits one failure per lease without consuming siblings', () => {
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
      `JovieInc/Jovie:pr-17:${head}:${failure.fingerprint}:${ROLLING_CI_POLICY_VERSION}`
    );
    expect(planned.state.claim.policyVersion).toBe(ROLLING_CI_POLICY_VERSION);
    expect(parseRollingCiState(body)).toEqual(planned.state);
  });

  it('rejects LogYourBody even though the Cursor App is installed there', () => {
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
    expect(WORKFLOW).not.toContain("event == 'merge_group'");
    expect(WORKFLOW).not.toContain('remoteMutationAllowed');
    expect(WORKFLOW).not.toContain('workflow_dispatch:');
    expect(WORKFLOW).not.toContain('gh workflow run');
    expect(WORKFLOW).not.toContain('gh run rerun');
    expect(WORKFLOW).not.toContain('gh pr merge');
    expect(WORKFLOW).not.toContain('gh pr ready');
    expect(WORKFLOW).not.toContain('gh pr edit');
  });

  it('binds every jq payload value into the exact planner input', () => {
    const payloadFilter = WORKFLOW.match(
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
    expect(WORKFLOW).toContain(
      'actions/runs/$WORKFLOW_RUN_ID/attempts/$WORKFLOW_RUN_ATTEMPT/jobs?per_page=100'
    );

    const failedJobsFilter = WORKFLOW.match(
      /FAILED_JOBS=\$\(gh api [\s\S]*?--jq '([^']+)'\)/
    )?.[1];
    expect(failedJobsFilter).toBeDefined();

    const jobs = Array.from({ length: 60 }, (_, index) => ({
      name: `job-${index + 1}`,
      conclusion: index === 59 ? 'failure' : 'success',
      steps: [
        {
          name: index === 59 ? 'Late failing step' : 'Passing step',
          conclusion: index === 59 ? 'failure' : 'success',
        },
      ],
    }));
    const result = spawnSync('jq', [failedJobsFilter], {
      input: JSON.stringify({ jobs }),
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual([
      {
        name: 'job-60',
        conclusion: 'failure',
        steps: ['Late failing step'],
      },
    ]);
  });
});
