import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bindDispatchLiveHead,
  emptyRollingCiState,
  failureFingerprint,
  normalizeFailureEvents,
  parseMergeQueueFrontBranch,
  parseRollingCiState,
  planFailureDispatch,
  planGreenRecovery,
  renderDispatchComment,
  resolveCiWorkflowRun,
  resolveDispatchPullRequest,
  runDispatch,
  TRUSTED_CI_WORKFLOW_PATH,
  TRUSTED_FAILURE_EVENTS,
  TRUSTED_PRODUCER_EVENTS,
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
  it('serializes same-PR remediation without cancelling a prepared writer', () => {
    expect(WORKFLOW).toContain('cancel-in-progress: false');
  });

  it('fits the bounded FX retry contract inside the dispatch budget', () => {
    expect(WORKFLOW).toContain('timeout-minutes: 30');
    expect(WORKFLOW).toContain('--timeout 600');
    expect(WORKFLOW).not.toContain('--timeout 1800');
  });

  it('requires a clean install baseline and independent repair verification', () => {
    expect(WORKFLOW).toContain('Require a clean dependency baseline');
    expect(WORKFLOW).toContain('git status --porcelain --untracked-files=all');
    expect(WORKFLOW).toContain('Independently verify the guarded FX repair');
    expect(WORKFLOW).toContain('run: pnpm ci:control:test');
  });

  it('does not report a guard or upload failure as merely launched', () => {
    expect(WORKFLOW).toContain("outcome='failed_after_launch'");
  });

  it('normalizes repository, PR, exact head, check, attempt, and fingerprint', () => {
    expect(event()).toMatchObject({
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

  it('deliberate red: dispatch CLI still requires a writer on merge_group', () => {
    const result = spawnSync(process.execPath, [CLI], {
      input: JSON.stringify(
        dispatchInput({
          writer: '',
          source: { ...trustedSource, producerEvent: 'merge_group' },
        })
      ),
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('writer is required');
  });

  it('accepts native merge_group CI as an authenticated producer', () => {
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
      })?.id
    ).toBe(13);
  });

  it('resolves the merge-queue front PR when workflow_run leaves pull_requests empty', () => {
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

  it('deliberate red: rejects the old pull_request-only producer gate', () => {
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
    const queueSha = 'c'.repeat(40);
    const bound = bindDispatchLiveHead({
      producerEvent: 'merge_group',
      liveHead: nextHead,
      expectedHead: queueSha,
    });
    expect(bound).toEqual({
      liveHead: queueSha,
      reason: 'merge_group_synthetic_head',
    });
    expect(
      runDispatch(
        dispatchInput({
          source: { ...trustedSource, producerEvent: 'merge_group' },
          liveHead: bound?.liveHead,
          headSha: queueSha,
          checks: [
            {
              name: 'ci-fast',
              conclusion: 'failure',
              headSha: queueSha,
              checkSuiteId: 44,
            },
          ],
        })
      )
    ).toMatchObject({
      action: 'dispatch_implementer',
      mutate: true,
    });
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
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const next = plan(
        event({ workflowRunId: 9000 + attempt, workflowRunAttempt: attempt }),
        { priorState: state }
      );
      expect(next.mutate).toBe(true);
      state = next.state;
    }
    expect(
      plan(event({ workflowRunId: 9010, workflowRunAttempt: 4 }), {
        priorState: state,
      })
    ).toMatchObject({
      action: 'terminal_configuration_incident',
      mutate: false,
      incident: { type: 'non_progressing_policy_cycle' },
    });
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
      `JovieInc/Jovie:pr-17:${head}:ci-fast:${failure.fingerprint}`
    );
    expect(parseRollingCiState(body)).toEqual(planned.state);
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

  it('uses authoritative workflow_run provenance with FX remediation', () => {
    for (const token of [
      "workflows: ['CI']",
      "github.event.workflow_run.event == 'pull_request'",
      "github.event.workflow_run.event == 'merge_group'",
      "github.event.workflow_run.path == '.github/workflows/ci.yml'",
      'HEAD_BRANCH:',
      'resolveDispatchPullRequest',
      'bindDispatchLiveHead',
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
      'secrets.AI_GATEWAY_API_KEY',
      'node scripts/lib/rolling-ci-fx.mjs',
      'scripts/lib/rolling-ci-handoff.mjs',
      'Install pinned FX',
      'Run FX on the exact source head',
      'Guard FX diff',
      'Push guarded FX repair',
      'FX_VERSION: v0.0.7',
      'fx-linux-x86_64.tar.gz',
      'c5787ea041d3b5521ec675f1ada78f30cf1b11021ffcac48b4969cf5beb65c45',
      'fx ask --auto --json --no-save',
      'git diff --cached --check',
      'REMOTE_HEAD',
      'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1',
      'steps.app-token.outputs.token',
      'secrets.JOVIE_BOT_PRIVATE_KEY',
      'pnpm install --frozen-lockfile',
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
      'actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
      'git diff --cached --binary --full-index',
      'jovie-fx-repair-artifact/v1',
      'Record FX outcome',
      'fx_outcome',
      '::notice::FX outcome=',
      'startup_failure',
      'runs-on: ubuntu-latest',
    ]) {
      expect(WORKFLOW, token).toContain(token);
    }
    expect(WORKFLOW).toMatch(/^permissions: \{\}$/m);
    expect(WORKFLOW).not.toMatch(/^\s{6}contents: write$/m);
    expect(WORKFLOW).not.toContain('secrets.CURSOR_API_KEY');
    expect(WORKFLOW).not.toContain('launchCursorAgent');
    expect(WORKFLOW).not.toContain(
      'GH_TOKEN: ${{ github.token }}\n        run: fx ask'
    );
    expect(WORKFLOW).toContain('persist-credentials: false');
    expect(WORKFLOW).not.toMatch(/^\s{2}check_suite:\s*$/m);
    expect(WORKFLOW).not.toMatch(/^\s{2}check_run:\s*$/m);
    expect(WORKFLOW.indexOf('Run FX on the exact source head')).toBeLessThan(
      WORKFLOW.indexOf('Generate short-lived Jovie App writer token')
    );
    expect(WORKFLOW).not.toContain(
      'ref: ${{ github.event.workflow_run.head_sha }}'
    );
    expect(WORKFLOW).not.toMatch(
      /github\.event\.workflow_run\.event == 'pull_request' &&\s*\n\s*github\.event\.workflow_run\.path == '\.github\/workflows\/ci\.yml'/
    );
  });

  it('isolates every exact-source repair step from trusted sparse policy', () => {
    const dispatchStart = WORKFLOW.indexOf('\n  dispatch:\n');
    const writerStart = WORKFLOW.indexOf('\n  writer:\n');
    expect(dispatchStart).toBeGreaterThan(-1);
    expect(writerStart).toBeGreaterThan(dispatchStart);
    const dispatchJob = WORKFLOW.slice(dispatchStart, writerStart);

    const dispatchStep = name => {
      const marker = `      - name: ${name}\n`;
      expect(dispatchJob.split(marker), name).toHaveLength(2);
      const start = dispatchJob.indexOf(marker);
      const end = dispatchJob.indexOf('\n      - name:', start + marker.length);
      expect(end, name).toBeGreaterThan(start);
      return dispatchJob.slice(start, end);
    };

    const checkout = dispatchStep('Checkout exact source PR head');
    expect(checkout).toContain('ref: ${{ steps.plan.outputs.source_head }}');
    expect(checkout).toMatch(/^          path: source$/m);
    expect(checkout).toMatch(/^          persist-credentials: false$/m);

    const checkoutGuard = dispatchStep('Require full exact-source checkout');
    expect(checkoutGuard).toContain('test -f package.json');
    expect(checkoutGuard).toContain('test -f pnpm-lock.yaml');
    expect(checkoutGuard).toContain(
      'test "$(git rev-parse HEAD)" = "$SOURCE_HEAD"'
    );

    for (const stepName of [
      'Require full exact-source checkout',
      'Capture exact failed-run evidence',
      'Restore source dependencies without model credentials',
      'Require a clean dependency baseline',
      'Run FX on the exact source head',
      'Guard FX diff',
      'Independently verify the guarded FX repair',
      'Create immutable FX repair artifact',
    ]) {
      expect(dispatchStep(stepName), stepName).toMatch(
        /^        working-directory: source$/m
      );
    }
  });

  it('keeps all repository write credentials outside the FX execution step', () => {
    const fxStart = WORKFLOW.indexOf('Run FX on the exact source head');
    const fxEnd = WORKFLOW.indexOf('Guard FX diff');
    const writerStart = WORKFLOW.indexOf(
      'Generate short-lived Jovie App writer token'
    );
    const writerJobStart = WORKFLOW.indexOf('\n  writer:\n');
    expect(fxStart).toBeGreaterThan(-1);
    expect(fxEnd).toBeGreaterThan(fxStart);
    expect(writerStart).toBeGreaterThan(fxEnd);
    expect(writerJobStart).toBeGreaterThan(fxEnd);
    expect(writerStart).toBeGreaterThan(writerJobStart);

    const fxStep = WORKFLOW.slice(fxStart, fxEnd);
    expect(fxStep).toContain('secrets.AI_GATEWAY_API_KEY');
    expect(fxStep).not.toContain('GH_TOKEN');
    expect(fxStep).not.toContain('JOVIE_BOT_PRIVATE_KEY');
    expect(fxStep).not.toContain('github.token');

    const dispatchJob = WORKFLOW.slice(0, writerJobStart);
    expect(dispatchJob).not.toContain('JOVIE_BOT_PRIVATE_KEY');
    expect(dispatchJob).not.toContain('permission-contents: write');

    const writerSteps = WORKFLOW.slice(writerStart);
    expect(writerSteps).toContain('JOVIE_BOT_PRIVATE_KEY');
    expect(writerSteps).toContain('steps.app-token.outputs.token');
    expect(writerSteps).toContain('REMOTE_HEAD');
    expect(writerSteps).toContain('HEAD:refs/heads/$HEAD_REF');
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
      sourceHead: head,
      headRef: 'codex/jov-5377-rolling-ci-payload',
      workflowRunId: '9001',
      workflowRunAttempt: 1,
      failedJobs,
      writer: 'tim',
      priorCommentBody: '',
      handoffCommentBody: '',
      conclusion: 'failure',
      checkSuiteId: 44,
      checks,
      fxAuthConfigured: true,
      runnerLocalAvailable: true,
      remoteMutationAllowed: false,
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
      'sourceHead',
      values.sourceHead,
      '--arg',
      'headRef',
      values.headRef,
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
      'handoffCommentBody',
      values.handoffCommentBody,
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
      '--argjson',
      'fxAuthConfigured',
      String(values.fxAuthConfigured),
      '--argjson',
      'runnerLocalAvailable',
      String(values.runnerLocalAvailable),
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
