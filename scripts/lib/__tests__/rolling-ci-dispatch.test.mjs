import { describe, expect, it } from 'vitest';
import {
  emptyRollingCiState,
  failureFingerprint,
  normalizeFailureEvents,
  parseRollingCiState,
  planFailureDispatch,
  planGreenRecovery,
  renderDispatchComment,
} from '../rolling-ci-dispatch.mjs';

const head = 'a'.repeat(40);
const nextHead = 'b'.repeat(40);

function event(overrides = {}) {
  return normalizeFailureEvents({
    repository: 'JovieInc/Jovie',
    prNumber: 17,
    headSha: head,
    workflowRunId: 9001,
    workflowRunAttempt: 1,
    failedJobs: [{ name: 'ci-fast', steps: ['Typecheck'] }],
    ...overrides,
  })[0];
}

describe('rolling CI failure dispatch', () => {
  it('normalizes exact-head failures with stable fingerprints', () => {
    const normalized = event();
    expect(normalized).toMatchObject({
      pr: 17,
      head,
      check: 'ci-fast',
      attempt: 1,
      fingerprint: failureFingerprint({
        check: 'ci-fast',
        failedSteps: ['Typecheck'],
      }),
    });
  });

  it('deliberate red: rejects an event for a stale head', () => {
    expect(
      planFailureDispatch({ event: event(), liveHead: nextHead, writer: 'tim' })
    ).toMatchObject({ action: 'reject_stale_head', mutate: false });
  });

  it('deliberate red: deduplicates repeated delivery', () => {
    const first = planFailureDispatch({
      event: event(),
      liveHead: head,
      writer: 'tim',
    });
    const repeated = planFailureDispatch({
      event: event(),
      liveHead: head,
      writer: 'tim',
      priorState: first.state,
    });
    expect(repeated).toMatchObject({
      action: 'deduplicate_delivery',
      mutate: false,
    });
  });

  it('deliberate red: rejects a competing remediation writer', () => {
    const first = planFailureDispatch({
      event: event(),
      liveHead: head,
      writer: 'implementer',
    });
    const competing = planFailureDispatch({
      event: event({ workflowRunId: 9002 }),
      liveHead: head,
      writer: 'fx',
      priorState: first.state,
    });
    expect(competing).toMatchObject({
      action: 'reject_competing_writer',
      mutate: false,
    });
  });

  it('supersedes obsolete repair state when a new commit fails', () => {
    const first = planFailureDispatch({
      event: event(),
      liveHead: head,
      writer: 'tim',
    });
    const nextEvent = event({
      headSha: nextHead,
      workflowRunId: 9002,
    });
    const next = planFailureDispatch({
      event: nextEvent,
      liveHead: nextHead,
      writer: 'tim',
      priorState: first.state,
    });
    expect(next.action).toBe('dispatch_superseding_head');
    expect(next.state.head).toBe(nextHead);
    expect(next.state.deliveries).toEqual([nextEvent.delivery]);
  });

  it('deliberate red: bounds repeated repair deliveries', () => {
    let state = emptyRollingCiState(head);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const next = planFailureDispatch({
        event: event({
          workflowRunId: 9000 + attempt,
          workflowRunAttempt: attempt,
        }),
        liveHead: head,
        writer: 'tim',
        priorState: state,
      });
      expect(next.mutate).toBe(true);
      state = next.state;
    }
    expect(
      planFailureDispatch({
        event: event({ workflowRunId: 9010, workflowRunAttempt: 4 }),
        liveHead: head,
        writer: 'tim',
        priorState: state,
      })
    ).toMatchObject({
      action: 'terminal_configuration_incident',
      mutate: false,
      incident: { type: 'non_progressing_policy_cycle' },
    });
  });

  it('successful current-head rerun supersedes active repairs', () => {
    const failed = planFailureDispatch({
      event: event(),
      liveHead: head,
      writer: 'tim',
    });
    const recovered = planGreenRecovery({
      headSha: head,
      liveHead: head,
      priorState: failed.state,
    });
    expect(recovered).toMatchObject({
      action: 'supersede_repairs_green',
      mutate: true,
      state: { claim: null, failures: {} },
    });
  });

  it('persists a machine-readable lease in the PR status comment', () => {
    const failure = event();
    const plan = planFailureDispatch({
      event: failure,
      liveHead: head,
      writer: 'tim',
    });
    const body = renderDispatchComment({ event: failure, plan });
    expect(body).toContain('@tim (active implementer)');
    expect(plan.state.claim.key).toBe(
      `JovieInc/Jovie:pr-17:${head}:ci-fast:${failure.fingerprint}`
    );
    expect(parseRollingCiState(body)).toEqual(plan.state);
  });
});
