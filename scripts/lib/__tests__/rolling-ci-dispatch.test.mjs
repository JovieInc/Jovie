import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bindDispatchLiveHead,
  emptyRollingCiState,
  failureFingerprint,
  isCiFamilyCheckName,
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

  it('accepts authenticated check_suite and CI-family check_run sources', () => {
    expect(
      event({
        source: {
          eventName: 'check_suite',
          producerEvent: 'pull_request',
          trustedPolicyRef: 'main',
          checkSuiteAppSlug: 'github-actions',
        },
      }).source.eventName
    ).toBe('check_suite');
    expect(
      event({
        source: {
          eventName: 'check_run',
          producerEvent: 'pull_request',
          trustedPolicyRef: 'main',
          checkSuiteAppSlug: 'github-actions',
          checkRunName: 'Test',
        },
      }).source.eventName
    ).toBe('check_run');
    expect(isCiFamilyCheckName('ci-fast')).toBe(true);
    expect(isCiFamilyCheckName('Snyk')).toBe(false);
  });

  it('unifies workflow_run and check_run deliveries on the same suite and fingerprint', () => {
    const fromWorkflow = event();
    const fromCheck = event({
      workflowRunId: 7777,
      source: {
        eventName: 'check_run',
        producerEvent: 'pull_request',
        trustedPolicyRef: 'main',
        checkSuiteAppSlug: 'github-actions',
        checkRunName: 'ci-fast',
      },
    });
    expect(fromWorkflow.delivery).toBe(fromCheck.delivery);
    expect(fromWorkflow.delivery.startsWith('44:')).toBe(true);
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

  it('uses native workflow_run/check provenance with FX remediation', () => {
    for (const token of [
      "workflows: ['CI']",
      'check_suite:',
      'check_run:',
      "github.event.workflow_run.event == 'pull_request'",
      "github.event.workflow_run.event == 'merge_group'",
      "github.event.workflow_run.path == '.github/workflows/ci.yml'",
      'HEAD_BRANCH:',
      'resolveDispatchPullRequest',
      'bindDispatchLiveHead',
      'steps.plan.outputs.pr_number',
      '.event == "pull_request" or .event == "merge_group"',
      "github.event.workflow_run.conclusion == 'failure'",
      "github.event.workflow_run.conclusion == 'success'",
      "github.event.check_suite.conclusion == 'failure'",
      "github.event.check_run.conclusion == 'failure'",
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
      'Launch FX remediator',
      'runs-on: ubuntu-latest',
    ]) {
      expect(WORKFLOW, token).toContain(token);
    }
    expect(WORKFLOW).toMatch(/^permissions: \{\}$/m);
    expect(WORKFLOW).not.toContain('contents: write');
    expect(WORKFLOW).not.toContain('JOVIE_BOT_PRIVATE_KEY');
    expect(WORKFLOW).not.toContain(
      'ref: ${{ github.event.workflow_run.head_sha }}'
    );
    expect(WORKFLOW).not.toMatch(
      /github\.event\.workflow_run\.event == 'pull_request' &&\s*\n\s*github\.event\.workflow_run\.path == '\.github\/workflows\/ci\.yml'/
    );
  });
});
