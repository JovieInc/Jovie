/**
 * Presence, silence and probe state machine. Pure, so alarm handlers stay
 * idempotent (Durable Object alarms are at-least-once): a re-run with the
 * same inputs yields the same state and emits no new event.
 */

export const PROBE = {
  intervalMs: 5 * 60_000,
  /** A probe unacked this long counts as a miss. */
  missAfterMs: 2 * 60_000,
  /** Consecutive misses before `agent.unreachable`. */
  missesToAlarm: 2,
} as const;

export const SWEEP_INTERVAL_MS = 60_000;

export type AgentState = 'unknown' | 'ok' | 'silent';

export type PresenceInput = {
  now: number;
  heartbeatSec: number | null;
  state: AgentState;
  lastSeenAt: number | null;
  /** From the mailbox: open sockets, last auto-response ping, last ack/poll. */
  connected: number;
  lastPingAt: number | null;
  lastActivityAt: number | null;
  /**
   * When the agent was registered. A new agent with a heartbeat contract has
   * no proof of life yet; it gets 2x the heartbeat from registration before
   * it can be declared silent instead of alarming on the first sweep.
   */
  registeredAt?: number | null;
};

export type PresenceResult = {
  state: AgentState;
  lastAliveAt: number | null;
  event: 'agent.silent' | 'agent.recovered' | null;
};

export function lastAlive(input: PresenceInput): number | null {
  const candidates = [
    input.lastSeenAt,
    input.lastPingAt,
    input.lastActivityAt,
  ].filter((value): value is number => typeof value === 'number' && value > 0);
  // An open socket is alive only while its pings are fresh; a half-open TCP
  // connection must not mask silence, so `connected` alone never counts.
  return candidates.length ? Math.max(...candidates) : null;
}

/**
 * Agents without a heartbeat contract (dormant) are never alarmed on silence;
 * their undelivered mail is covered by the DLQ instead. Silence is declared
 * after 2x the heartbeat, so one lost ping cannot raise a false alarm.
 */
export function evaluatePresence(input: PresenceInput): PresenceResult {
  const aliveAt = lastAlive(input);
  if (!input.heartbeatSec)
    return {
      state: aliveAt ? 'ok' : 'unknown',
      lastAliveAt: aliveAt,
      event: null,
    };
  const baseline = aliveAt ?? input.registeredAt ?? null;
  const silent =
    baseline === null || input.now - baseline > 2 * input.heartbeatSec * 1000;
  const next: AgentState = silent ? 'silent' : 'ok';
  let event: PresenceResult['event'] = null;
  if (next === 'silent' && input.state !== 'silent') event = 'agent.silent';
  if (next === 'ok' && input.state === 'silent') event = 'agent.recovered';
  return { state: next, lastAliveAt: aliveAt, event };
}

export type ProbeInput = {
  now: number;
  lastProbeAt: number | null;
  lastProbeAckAt: number | null;
  misses: number;
  /**
   * Last event that proves the agent consumes mail (authenticated traffic, an
   * ack or a poll). Omitted/null keeps the fixed cadence. Socket pings never
   * count: a wedged consumer behind a healthy socket is what the probe is for.
   */
  lastAliveAt?: number | null;
};

/** Last sign that the agent itself (not just its socket) is working. */
export function lastConsumerAlive(input: {
  lastSeenAt: number | null;
  lastActivityAt: number | null;
}): number | null {
  const candidates = [input.lastSeenAt, input.lastActivityAt].filter(
    (value): value is number => typeof value === 'number' && value > 0
  );
  return candidates.length ? Math.max(...candidates) : null;
}

export type ProbeResult = {
  misses: number;
  /** RTT of the previous probe when it was acked. */
  rttMs: number | null;
  sendNew: boolean;
  event: 'agent.unreachable' | 'agent.reachable' | null;
};

/**
 * Adaptive, last-seen based. A probe exists to prove an agent is reachable, so
 * traffic that already proves it replaces the probe: one is sent only after
 * `intervalMs` without any proof (previous probe included). Worst-case time to
 * detect a dead agent is unchanged (it dies right after its last proof, the
 * next probe is due `intervalMs` later, then the same miss window applies); the
 * best case is faster and a busy agent costs zero probe messages.
 */
export function evaluateProbe(input: ProbeInput): ProbeResult {
  const { now, lastProbeAt, lastProbeAckAt } = input;
  const aliveAt = input.lastAliveAt ?? null;
  if (lastProbeAt === null) {
    const quiet = aliveAt === null || now - aliveAt >= PROBE.intervalMs;
    return { misses: 0, rttMs: null, sendNew: quiet, event: null };
  }
  const acked = lastProbeAckAt !== null && lastProbeAckAt >= lastProbeAt;
  // Proof after the probe went out answers it, whether or not the ack arrived.
  const provenSince = aliveAt !== null && aliveAt > lastProbeAt;
  if (acked || provenSince) {
    const proofAt = Math.max(lastProbeAt, aliveAt ?? 0);
    return {
      misses: 0,
      rttMs: acked ? (lastProbeAckAt as number) - lastProbeAt : null,
      sendNew: now - proofAt >= PROBE.intervalMs,
      event: input.misses >= PROBE.missesToAlarm ? 'agent.reachable' : null,
    };
  }
  if (now - lastProbeAt < PROBE.missAfterMs)
    return { misses: input.misses, rttMs: null, sendNew: false, event: null };
  const misses = input.misses + 1;
  return {
    misses,
    rttMs: null,
    sendNew: true,
    event: misses === PROBE.missesToAlarm ? 'agent.unreachable' : null,
  };
}
