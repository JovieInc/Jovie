import { describe, expect, it } from 'vitest';
import {
  buildLivenessEvent,
  classifyPrLiveness,
  DEFAULT_MAX_REMEDIATION_ATTEMPTS,
  DEFAULT_PR_LIVENESS_THRESHOLDS,
  HEARTBEAT_TYPES,
  livenessIdempotencyKey,
  nextRemediationAction,
  PR_LIVENESS_EVENT_SCHEMA,
  PR_LIVENESS_STATES,
} from '../pr-liveness.mjs';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const SHA = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);

function snap(overrides = {}) {
  return {
    repository: 'JovieInc/Jovie',
    prNumber: 1234,
    headSha: SHA,
    isDraft: true,
    readyForReview: false,
    source: {
      issueId: 'JOV-7513',
      attemptId: 'attempt-1',
      lane: 'devin',
      provider: 'devin',
      retryCount: 0,
    },
    heartbeats: {},
    worker: { active: true },
    ...overrides,
  };
}

const ago = ms => new Date(NOW - ms).toISOString();

describe('pr-liveness model', () => {
  it('defines the canonical states and typed heartbeats', () => {
    for (const state of [
      'ACTIVE_IMPLEMENTATION',
      'ACTIVE_CI',
      'WAITING_FOR_CI',
      'WAITING_FOR_REVIEW',
      'WAITING_FOR_DEPENDENCY',
      'BLOCKED_EXPLICIT',
      'READY_TO_MERGE',
      'MERGE_QUEUE_ACTIVE',
      'STALE_SUSPECTED',
      'STALE_CONFIRMED',
      'REMEDIATING',
      'RECOVERED',
      'ORPHANED',
      'TERMINAL_ESCALATION',
    ])
      expect(PR_LIVENESS_STATES).toContain(state);
    expect(HEARTBEAT_TYPES).not.toContain('comment');
    expect(HEARTBEAT_TYPES).not.toContain('updated_at');
  });

  it('requires a valid snapshot identity', () => {
    expect(() => classifyPrLiveness({})).toThrow();
    expect(() => classifyPrLiveness(snap({ headSha: 'not-a-sha' }))).toThrow(
      /headSha/
    );
  });

  it('does not flag an old draft with a fresh worker heartbeat', () => {
    const c = classifyPrLiveness(
      snap({
        heartbeats: {
          prCreatedAt: ago(72 * 60 * 60_000),
          workerHeartbeatAt: ago(5 * 60_000),
        },
      }),
      { now: NOW }
    );
    expect(c.state).toBe('ACTIVE_IMPLEMENTATION');
    expect(c.breach).toBe('none');
  });

  it('flags stale implementation when heartbeat ages out', () => {
    const stale = DEFAULT_PR_LIVENESS_THRESHOLDS.ACTIVE_IMPLEMENTATION.staleMs;
    const c = classifyPrLiveness(
      snap({ heartbeats: { workerHeartbeatAt: ago(stale + 1000) } }),
      { now: NOW }
    );
    expect(c.state).toBe('STALE_CONFIRMED');
    expect(c.baseState).toBe('ACTIVE_IMPLEMENTATION');
    expect(c.breachedThreshold.name).toBe('staleMs');
  });

  it('emits STALE_SUSPECTED at the warning threshold', () => {
    const warn = DEFAULT_PR_LIVENESS_THRESHOLDS.ACTIVE_IMPLEMENTATION.warnMs;
    const c = classifyPrLiveness(
      snap({ heartbeats: { workerHeartbeatAt: ago(warn + 1000) } }),
      { now: NOW }
    );
    expect(c.state).toBe('STALE_SUSPECTED');
  });

  it('classifies waiting-for-ci on its own clock', () => {
    const c = classifyPrLiveness(
      snap({
        ciStatus: 'pending',
        heartbeats: { headShaChangedAt: ago(10 * 60_000) },
      }),
      { now: NOW }
    );
    expect(c.state).toBe('WAITING_FOR_CI');
    const stale = classifyPrLiveness(
      snap({
        ciStatus: 'pending',
        heartbeats: { headShaChangedAt: ago(2 * 60 * 60_000) },
      }),
      { now: NOW }
    );
    expect(stale.state).toBe('STALE_CONFIRMED');
    expect(stale.heartbeat.type).toBe('ci_transition');
  });

  it('running CI reads ACTIVE_CI, not stale, while fresh', () => {
    const c = classifyPrLiveness(
      snap({
        ciStatus: 'in_progress',
        heartbeats: { ciTransitionAt: ago(10 * 60_000) },
      }),
      { now: NOW }
    );
    expect(c.state).toBe('ACTIVE_CI');
    expect(c.breach).toBe('none');
  });

  it('classifies review, blocked, dependency, queue, ready states', () => {
    const cases = [
      [
        snap({ isDraft: false, heartbeats: { readyForReviewAt: ago(60_000) } }),
        'WAITING_FOR_REVIEW',
      ],
      [
        snap({
          blocked: {
            declaredAt: ago(60_000),
            reason: 'needs-decision',
            owner: 'tim',
          },
        }),
        'BLOCKED_EXPLICIT',
      ],
      [
        snap({
          waitingOnDependency: { declaredAt: ago(60_000), reason: 'JOV-1' },
        }),
        'WAITING_FOR_DEPENDENCY',
      ],
      [
        snap({ mergeQueue: { state: 'enqueued', enrolledAt: ago(60_000) } }),
        'MERGE_QUEUE_ACTIVE',
      ],
      [
        snap({
          isDraft: false,
          readyForReview: true,
          requiredChecksGreen: true,
          heartbeats: { readyForReviewAt: ago(60_000) },
        }),
        'READY_TO_MERGE',
      ],
      [
        snap({ worker: { active: false, orphanedAt: ago(60_000) } }),
        'ORPHANED',
      ],
      [
        snap({
          repair: { inProgress: true },
          heartbeats: { repairAttemptStartedAt: ago(60_000) },
        }),
        'REMEDIATING',
      ],
    ];
    for (const [snapshot, expected] of cases) {
      expect(classifyPrLiveness(snapshot, { now: NOW }).state).toBe(expected);
    }
  });

  it('reports RECOVERED when a previously stale PR shows fresh evidence', () => {
    const c = classifyPrLiveness(
      snap({ heartbeats: { workerHeartbeatAt: ago(60_000) } }),
      { now: NOW, previousState: 'STALE_CONFIRMED', previousBreach: 'stale' }
    );
    expect(c.state).toBe('RECOVERED');
  });

  it('thresholds are configurable per state', () => {
    const c = classifyPrLiveness(
      snap({ heartbeats: { workerHeartbeatAt: ago(10 * 60_000) } }),
      {
        now: NOW,
        thresholds: {
          ACTIVE_IMPLEMENTATION: { warnMs: 60_000, staleMs: 5 * 60_000 },
        },
      }
    );
    expect(c.state).toBe('STALE_CONFIRMED');
  });
});

describe('liveness events', () => {
  const staleSnap = () =>
    snap({ heartbeats: { workerHeartbeatAt: ago(26 * 60 * 60_000) } });

  it('emits one structured event per transition with idempotency key', () => {
    const c = classifyPrLiveness(staleSnap(), { now: NOW });
    const event = buildLivenessEvent(c, { emittedAt: NOW });
    expect(event.schema).toBe(PR_LIVENESS_EVENT_SCHEMA);
    expect(event.repository).toBe('JovieInc/Jovie');
    expect(event.prNumber).toBe(1234);
    expect(event.headSha).toBe(SHA);
    expect(event.sourceIssue).toBe('JOV-7513');
    expect(event.owner.lane).toBe('devin');
    expect(event.state).toBe('STALE_CONFIRMED');
    expect(event.heartbeat.type).toBe('worker_heartbeat');
    expect(event.recommendedAction).toBe('retry_attempt');
    expect(event.idempotencyKey).toBe(livenessIdempotencyKey(c));
  });

  it('is idempotent: unchanged state/head emits no duplicate event', () => {
    const first = classifyPrLiveness(staleSnap(), { now: NOW });
    const second = classifyPrLiveness(staleSnap(), {
      now: NOW + 60_000,
      previousState: first.state,
      previousBreach: first.breach,
      previousHeadSha: first.headSha,
    });
    expect(second.transitioned).toBe(false);
    expect(buildLivenessEvent(second)).toBeNull();
  });

  it('a head SHA change re-keys the event and re-evaluates', () => {
    const first = classifyPrLiveness(staleSnap(), { now: NOW });
    const moved = classifyPrLiveness(
      { ...staleSnap(), headSha: SHA2 },
      {
        now: NOW + 60_000,
        previousState: first.state,
        previousBreach: first.breach,
        previousHeadSha: first.headSha,
      }
    );
    expect(moved.transitioned).toBe(true);
    expect(livenessIdempotencyKey(moved)).not.toBe(
      livenessIdempotencyKey(first)
    );
  });
});

describe('bounded remediation', () => {
  it('maps states to safe deterministic actions', () => {
    expect(nextRemediationAction({ state: 'ORPHANED' }).action).toBe(
      'reclaim_ownership'
    );
    expect(nextRemediationAction({ state: 'WAITING_FOR_CI' }).action).toBe(
      'rerun_failed_checks'
    );
    expect(nextRemediationAction({ state: 'MERGE_QUEUE_ACTIVE' }).action).toBe(
      're_enroll_merge_queue'
    );
    expect(
      nextRemediationAction({
        state: 'STALE_CONFIRMED',
        baseState: 'ACTIVE_IMPLEMENTATION',
      }).action
    ).toBe('retry_attempt');
    expect(
      nextRemediationAction({
        state: 'ACTIVE_IMPLEMENTATION',
        providerAvailable: false,
      }).action
    ).toBe('reroute_provider');
  });

  it('escalates deterministically after the attempt bound', () => {
    const r = nextRemediationAction({
      state: 'STALE_CONFIRMED',
      baseState: 'ACTIVE_IMPLEMENTATION',
      remediationAttempts: DEFAULT_MAX_REMEDIATION_ATTEMPTS,
    });
    expect(r.action).toBe('escalate');
    expect(r.escalatedState).toBe('TERMINAL_ESCALATION');
  });
});
