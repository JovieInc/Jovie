import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planRollingCiDispatch } from '../../rolling-ci-dispatch.mjs';
import {
  dispatchStateMarker,
  failureFingerprint,
  MAX_NON_PROGRESS_DELIVERIES,
  normalizeFailureEvents,
  normalizeGreenEvent,
  parseDispatchState,
  planFailureDispatch,
  planGreenRecovery,
} from '../rolling-ci-dispatch.mjs';

const head = 'a'.repeat(40);
const nextHead = 'b'.repeat(40);
const policySha = 'c'.repeat(40);
const agentPipeline = readFileSync(
  new URL('../../../.github/workflows/agent-pipeline.yml', import.meta.url),
  'utf8'
);

function workflowJob(name, nextName) {
  const start = agentPipeline.indexOf(`\n  ${name}:\n`);
  const end = agentPipeline.indexOf(`\n  ${nextName}:\n`, start + 1);
  if (start < 0 || end < 0) throw new Error(`workflow job ${name} not found`);
  return agentPipeline.slice(start, end);
}

function trustedSource(conclusion = 'failure', overrides = {}) {
  return {
    eventName: 'workflow_run',
    action: 'completed',
    workflowName: 'CI',
    workflowPath: '.github/workflows/ci.yml',
    producerEvent: 'pull_request',
    status: 'completed',
    conclusion,
    repository: 'JovieInc/Jovie',
    headRepository: 'JovieInc/Jovie',
    policyRef: 'refs/heads/main',
    policySha,
    ...overrides,
  };
}

function failure(overrides = {}) {
  const input = {
    repository: 'JovieInc/Jovie',
    prNumber: 17,
    headSha: head,
    workflowRunId: 9001,
    workflowRunAttempt: 1,
    failedJobs: [{ name: 'ci-fast', steps: ['Typecheck'] }],
    source: trustedSource(),
    ...overrides,
  };
  return normalizeFailureEvents(input)[0];
}

function green(overrides = {}) {
  return normalizeGreenEvent({
    repository: 'JovieInc/Jovie',
    prNumber: 17,
    headSha: head,
    workflowRunId: 9010,
    workflowRunAttempt: 2,
    source: trustedSource('success'),
    ...overrides,
  });
}

describe('trusted rolling CI event contract', () => {
  it('normalizes repository, PR, exact head, check, attempt, and fingerprint', () => {
    const event = failure();
    expect(event).toMatchObject({
      repository: 'JovieInc/Jovie',
      pr: 17,
      head,
      check: 'ci-fast',
      attempt: 1,
      fingerprint: failureFingerprint({
        check: 'ci-fast',
        failedSteps: ['Typecheck'],
      }),
    });
    expect(event.failureKey).toBe(
      `JovieInc/Jovie:pr-17:${head}:ci-fast:${event.fingerprint}`
    );
  });

  it('keeps fingerprints stable across step order and duplicate step names', () => {
    const left = failureFingerprint({
      check: 'ci-fast',
      failedSteps: ['Unit', 'Typecheck', 'Unit'],
    });
    const right = failureFingerprint({
      check: 'ci-fast',
      failedSteps: ['Typecheck', 'Unit'],
    });
    expect(left).toBe(right);
  });

  it.each([
    ['event type', { eventName: 'pull_request_target' }],
    ['completion action', { action: 'requested' }],
    ['workflow name', { workflowName: 'Attacker CI' }],
    ['workflow path', { workflowPath: '.github/workflows/untrusted.yml' }],
    ['producer event', { producerEvent: 'push' }],
    ['policy ref', { policyRef: 'refs/pull/17/merge' }],
    ['source repository', { repository: 'attacker/fork' }],
    ['head repository', { headRepository: 'attacker/fork' }],
  ])('deliberate red: rejects untrusted %s provenance', (_name, sourcePatch) => {
    expect(() =>
      failure({ source: trustedSource('failure', sourcePatch) })
    ).toThrow('authenticated same-repository CI workflow_run');
  });
});

describe('rolling CI dispatch idempotency and supersession', () => {
  it('deliberate red: rejects a stale failure head', () => {
    expect(
      planFailureDispatch({ event: failure(), liveHead: nextHead })
    ).toMatchObject({ action: 'reject_stale_head', mutate: false });
  });

  it('deliberate red: deduplicates duplicate delivery', () => {
    const event = failure();
    const first = planFailureDispatch({ event, liveHead: head });
    const duplicate = planFailureDispatch({
      event,
      liveHead: head,
      priorState: first.state,
    });
    expect(duplicate).toMatchObject({
      action: 'deduplicate_delivery',
      mutate: false,
    });
  });

  it('deliberate red: emits a terminal incident after bounded non-progress', () => {
    let state = null;
    for (
      let attempt = 1;
      attempt <= MAX_NON_PROGRESS_DELIVERIES;
      attempt += 1
    ) {
      const event = failure({
        workflowRunId: 9000 + attempt,
        workflowRunAttempt: attempt,
      });
      const plan = planFailureDispatch({
        event,
        liveHead: head,
        priorState: state,
      });
      expect(plan.mutate).toBe(true);
      state = plan.state;
    }

    const blocked = planFailureDispatch({
      event: failure({ workflowRunId: 9010, workflowRunAttempt: 4 }),
      liveHead: head,
      priorState: state,
    });
    expect(blocked).toMatchObject({
      action: 'terminal_configuration_incident',
      mutate: true,
      dispatch: false,
      incident: {
        type: 'non_progressing_failure_dispatch',
        attempts: MAX_NON_PROGRESS_DELIVERIES,
      },
    });

    const duplicateIncident = planFailureDispatch({
      event: failure({ workflowRunId: 9011, workflowRunAttempt: 5 }),
      liveHead: head,
      priorState: blocked.state,
    });
    expect(duplicateIncident).toMatchObject({
      action: 'deduplicate_terminal_incident',
      mutate: false,
      dispatch: false,
    });
  });

  it('a superseding commit discards obsolete failure state', () => {
    const first = planFailureDispatch({ event: failure(), liveHead: head });
    const nextEvent = failure({
      headSha: nextHead,
      workflowRunId: 9002,
      source: trustedSource(),
    });
    const next = planFailureDispatch({
      event: nextEvent,
      liveHead: nextHead,
      priorState: first.state,
    });
    expect(next.action).toBe('dispatch_superseding_head');
    expect(next.state.head).toBe(nextHead);
    expect(next.state.deliveries).toEqual([nextEvent.deliveryKey]);
  });

  it('a current-head green rerun supersedes active repairs', () => {
    const failed = planFailureDispatch({ event: failure(), liveHead: head });
    const recovered = planGreenRecovery({
      event: green(),
      liveHead: head,
      priorState: failed.state,
    });
    expect(recovered).toMatchObject({
      action: 'supersede_repairs_green',
      mutate: true,
      state: { head, failures: {}, deliveries: [] },
    });
  });

  it('deliberate red: rejects a stale green rerun', () => {
    expect(
      planGreenRecovery({ event: green(), liveHead: nextHead })
    ).toMatchObject({ action: 'reject_stale_green', mutate: false });
  });

  it('round-trips durable state and rejects a malformed marker', () => {
    const plan = planFailureDispatch({ event: failure(), liveHead: head });
    expect(parseDispatchState(dispatchStateMarker(plan.state))).toEqual(
      plan.state
    );
    expect(
      parseDispatchState('<!-- jovie-rolling-ci-dispatch-state:not-json -->')
    ).toBeNull();
  });
});

describe('rolling CI workflow adapter', () => {
  function workflowInput(overrides = {}) {
    return {
      repository: 'JovieInc/Jovie',
      prNumber: 17,
      headSha: head,
      liveHead: head,
      workflowRunId: 9001,
      workflowRunAttempt: 1,
      conclusion: 'failure',
      failedJobs: [
        { name: 'ci-fast', steps: ['Typecheck'] },
        { name: 'Unit Tests', steps: ['Run affected tests'] },
      ],
      source: trustedSource(),
      priorCommentBody: '',
      ...overrides,
    };
  }

  it('renders all normalized failures into one durable dispatch state', () => {
    const result = planRollingCiDispatch(workflowInput());
    expect(result).toMatchObject({
      action: 'dispatch_exact_head_failure',
      mutate: true,
      shouldDispatch: true,
      shouldComment: true,
    });
    expect(result.events).toHaveLength(2);
    expect(result.body).toContain('`ci-fast`');
    expect(result.body).toContain('`Unit Tests`');
    expect(parseDispatchState(result.body)).toEqual(result.state);
  });

  it('does not comment or dispatch a duplicate workflow delivery', () => {
    const first = planRollingCiDispatch(workflowInput());
    const duplicate = planRollingCiDispatch(
      workflowInput({ priorCommentBody: first.body })
    );
    expect(duplicate).toMatchObject({
      action: 'deduplicate_delivery',
      mutate: false,
      shouldDispatch: false,
      shouldComment: false,
      body: '',
    });
  });

  it('clears durable repair state after a current-head green rerun', () => {
    const failed = planRollingCiDispatch(workflowInput());
    const recovered = planRollingCiDispatch(
      workflowInput({
        conclusion: 'success',
        source: trustedSource('success'),
        workflowRunId: 9002,
        workflowRunAttempt: 2,
        failedJobs: undefined,
        priorCommentBody: failed.body,
      })
    );
    expect(recovered).toMatchObject({
      action: 'supersede_repairs_green',
      mutate: true,
      shouldDispatch: false,
      shouldComment: true,
      state: { failures: {}, deliveries: [] },
    });
  });
});

describe('trusted dispatch workflow contract', () => {
  const dispatchJob = workflowJob('trusted-dispatch', 'fix');

  it('runs default-branch policy with minimal permissions and no PR code', () => {
    expect(dispatchJob).toContain('ref: main');
    expect(dispatchJob).toContain('persist-credentials: false');
    expect(dispatchJob).toContain('actions: read');
    expect(dispatchJob).toContain('contents: read');
    expect(dispatchJob).toContain('issues: write');
    expect(dispatchJob).toContain('pull-requests: read');
    expect(dispatchJob).not.toContain('contents: write');
    expect(dispatchJob).not.toContain('id-token: write');
    expect(dispatchJob).not.toContain('secrets.');
    expect(dispatchJob).not.toContain('github.event.pull_request.head.sha');
  });

  it('deliberate red: re-fetches native provenance and rejects stale heads', () => {
    expect(dispatchJob).toContain('actions/runs/$RUN_ID');
    expect(dispatchJob).toContain('.head_repository.full_name');
    expect(dispatchJob).toContain('CANONICAL_HEAD');
    expect(dispatchJob).toContain('CANONICAL_HEAD" != "$EXPECTED_HEAD');
    expect(dispatchJob).toContain('LIVE_HEAD" != "$EXPECTED_HEAD');
    expect(dispatchJob).toContain('github.workflow_sha');
    expect(dispatchJob).toContain('github.event.action');
  });

  it('deduplicates per PR and cancels superseded dispatch runs', () => {
    expect(dispatchJob).toContain(
      'group: rolling-ci-dispatch-${{ github.repository }}-${{ needs.guard.outputs.pr_number }}'
    );
    expect(dispatchJob).toContain('cancel-in-progress: true');
    expect(dispatchJob).toContain('github-actions[bot]');
    expect(dispatchJob).toContain('jovie-rolling-ci-dispatch-state:');
  });

  it('reconciles both draft failures and current-head green reruns', () => {
    expect(agentPipeline).toContain(
      'should_reconcile: ${{ steps.evaluate.outputs.should_reconcile }}'
    );
    expect(agentPipeline).toContain('SHOULD_RECONCILE="true"');
    expect(dispatchJob).toContain('CONCLUSION');
    expect(dispatchJob).toContain('scripts/rolling-ci-dispatch.mjs');
  });
});
