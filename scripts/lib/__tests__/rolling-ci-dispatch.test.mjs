import { describe, expect, it } from 'vitest';
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
      mutate: false,
      incident: {
        type: 'non_progressing_failure_dispatch',
        attempts: MAX_NON_PROGRESS_DELIVERIES,
      },
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
