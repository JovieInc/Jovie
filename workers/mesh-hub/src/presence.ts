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
  const silent =
    aliveAt === null || input.now - aliveAt > 2 * input.heartbeatSec * 1000;
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
};

export type ProbeResult = {
  misses: number;
  /** RTT of the previous probe when it was acked. */
  rttMs: number | null;
  sendNew: boolean;
  event: 'agent.unreachable' | 'agent.reachable' | null;
};

export function evaluateProbe(input: ProbeInput): ProbeResult {
  const { now, lastProbeAt, lastProbeAckAt } = input;
  if (lastProbeAt === null)
    return { misses: 0, rttMs: null, sendNew: true, event: null };
  const acked = lastProbeAckAt !== null && lastProbeAckAt >= lastProbeAt;
  if (acked) {
    const due = now - lastProbeAt >= PROBE.intervalMs;
    return {
      misses: 0,
      rttMs: lastProbeAckAt - lastProbeAt,
      sendNew: due,
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
