import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  evaluatePresence,
  evaluateProbe,
  lastAlive,
  lastConsumerAlive,
  PROBE,
} from './presence.ts';

test('presence: silence after 2x heartbeat, one event per transition, dormant agents never alarm', () => {
  const base = {
    now: 1_000_000,
    heartbeatSec: 20,
    state: 'ok',
    lastSeenAt: null,
    connected: 1,
    lastPingAt: null,
    lastActivityAt: null,
  };
  assert.equal(lastAlive({ ...base, lastSeenAt: 5, lastPingAt: 9 }), 9);
  assert.equal(lastAlive(base), null);
  const silent = evaluatePresence({ ...base, lastPingAt: base.now - 41_000 });
  assert.deepEqual([silent.state, silent.event], ['silent', 'agent.silent']);
  const still = evaluatePresence({
    ...base,
    state: 'silent',
    lastPingAt: base.now - 90_000,
  });
  assert.equal(still.event, null, 'no repeat alarm while silent');
  const ok = evaluatePresence({ ...base, lastPingAt: base.now - 39_000 });
  assert.deepEqual(
    [ok.state, ok.event],
    ['ok', null],
    'one missed ping is not silence'
  );
  const back = evaluatePresence({
    ...base,
    state: 'silent',
    lastActivityAt: base.now,
  });
  assert.equal(back.event, 'agent.recovered');
  assert.equal(
    evaluatePresence({ ...base, heartbeatSec: null }).state,
    'unknown'
  );
  assert.equal(
    evaluatePresence({ ...base, heartbeatSec: null, lastSeenAt: 1 }).event,
    null
  );
  assert.equal(
    evaluatePresence({ ...base, state: 'unknown' }).event,
    'agent.silent',
    'an open socket without pings is not alive'
  );
});

test('presence: a newly registered heartbeat agent is not silent until 2x the heartbeat has passed', () => {
  const base = {
    now: 1_000_000,
    heartbeatSec: 20,
    state: 'unknown',
    lastSeenAt: null,
    connected: 0,
    lastPingAt: null,
    lastActivityAt: null,
  };
  const fresh = evaluatePresence({ ...base, registeredAt: base.now - 10_000 });
  assert.deepEqual([fresh.state, fresh.event], ['ok', null]);
  const overdue = evaluatePresence({
    ...base,
    registeredAt: base.now - 41_000,
  });
  assert.deepEqual([overdue.state, overdue.event], ['silent', 'agent.silent']);
});

test('probe: first probe, ack with RTT, misses alarm once at the threshold, recovery event', () => {
  assert.deepEqual(
    evaluateProbe({
      now: 0,
      lastProbeAt: null,
      lastProbeAckAt: null,
      misses: 0,
    }),
    { misses: 0, rttMs: null, sendNew: true, event: null }
  );
  const acked = evaluateProbe({
    now: PROBE.intervalMs + 10,
    lastProbeAt: 10,
    lastProbeAckAt: 260,
    misses: 0,
  });
  assert.deepEqual(acked, {
    misses: 0,
    rttMs: 250,
    sendNew: true,
    event: null,
  });
  assert.equal(
    evaluateProbe({
      now: 1_000,
      lastProbeAt: 10,
      lastProbeAckAt: 260,
      misses: 0,
    }).sendNew,
    false
  );
  assert.equal(
    evaluateProbe({
      now: 1_000,
      lastProbeAt: 10,
      lastProbeAckAt: null,
      misses: 0,
    }).sendNew,
    false,
    'inside the miss window'
  );
  const miss1 = evaluateProbe({
    now: PROBE.missAfterMs + 20,
    lastProbeAt: 10,
    lastProbeAckAt: null,
    misses: 0,
  });
  assert.deepEqual([miss1.misses, miss1.event, miss1.sendNew], [1, null, true]);
  const miss2 = evaluateProbe({
    now: PROBE.missAfterMs + 20,
    lastProbeAt: 10,
    lastProbeAckAt: 5,
    misses: 1,
  });
  assert.deepEqual([miss2.misses, miss2.event], [2, 'agent.unreachable']);
  assert.equal(
    evaluateProbe({
      now: PROBE.missAfterMs + 20,
      lastProbeAt: 10,
      lastProbeAckAt: null,
      misses: 2,
    }).event,
    null,
    'alarm fires once'
  );
  assert.equal(
    evaluateProbe({ now: 100, lastProbeAt: 10, lastProbeAckAt: 50, misses: 3 })
      .event,
    'agent.reachable'
  );
});

test('probe is adaptive: traffic that proves the agent replaces the probe', () => {
  const quiet = PROBE.intervalMs;
  // Busy agent: recent proof, no probe sent even though the last probe is old.
  assert.equal(
    evaluateProbe({
      now: 10 * quiet,
      lastProbeAt: 0,
      lastProbeAckAt: 100,
      misses: 0,
      lastAliveAt: 10 * quiet - 1_000,
    }).sendNew,
    false
  );
  // Quiet agent: same cadence as before.
  assert.equal(
    evaluateProbe({
      now: 10 * quiet,
      lastProbeAt: 0,
      lastProbeAckAt: 100,
      misses: 0,
      lastAliveAt: 100,
    }).sendNew,
    true
  );
  // Never probed but recently active: wait until it has been quiet.
  assert.equal(
    evaluateProbe({
      now: 1_000,
      lastProbeAt: null,
      lastProbeAckAt: null,
      misses: 0,
      lastAliveAt: 500,
    }).sendNew,
    false
  );
  // Proof after an unanswered probe clears the misses and fires recovery.
  const recovered = evaluateProbe({
    now: PROBE.missAfterMs + 20,
    lastProbeAt: 10,
    lastProbeAckAt: null,
    misses: PROBE.missesToAlarm,
    lastAliveAt: 50_000,
  });
  assert.deepEqual([recovered.misses, recovered.event], [0, 'agent.reachable']);
  // Socket pings alone are not consumer proof.
  assert.equal(lastConsumerAlive({ lastConsumerActivityAt: null }), null);
});

test('negative control: a dead agent is detected no later than with the fixed probe', () => {
  const MIN = 60_000;
  // Simulate the minute sweep. The agent answers until `diesAt`, then is silent.
  // `adaptive` also consumes mail every 90 s until it dies.
  const detect = (diesAt, adaptive) => {
    let lastProbeAt = null;
    let lastAck = null;
    let misses = 0;
    let lastTraffic = 0;
    for (let now = MIN; now <= diesAt + 30 * MIN; now += MIN) {
      if (now <= diesAt && adaptive && now % 90_000 === 0) lastTraffic = now;
      const r = evaluateProbe({
        now,
        lastProbeAt,
        lastProbeAckAt: lastAck,
        misses,
        lastAliveAt: adaptive ? lastTraffic || null : null,
      });
      misses = r.misses;
      if (r.event === 'agent.unreachable') return now - diesAt;
      if (r.sendNew) {
        lastProbeAt = now;
        if (now <= diesAt) lastAck = now;
      }
    }
    return Infinity;
  };
  // Documented bound: the worst case is unchanged. Adaptive may be slower for
  // one death time (it waits out a quiet interval after the last proof), but
  // never slower than the fixed probe's own worst case over a full cycle.
  let fixedWorst = 0;
  let adaptiveWorst = 0;
  for (let diesAt = 10 * MIN; diesAt < 20 * MIN; diesAt += MIN) {
    const fixed = detect(diesAt, false);
    const adaptive = detect(diesAt, true);
    assert.ok(Number.isFinite(fixed), 'fixed probe must detect a dead agent');
    assert.ok(Number.isFinite(adaptive), 'dead agent must be detected');
    fixedWorst = Math.max(fixedWorst, fixed);
    adaptiveWorst = Math.max(adaptiveWorst, adaptive);
  }
  assert.ok(
    adaptiveWorst <= fixedWorst,
    `adaptive worst ${adaptiveWorst} vs fixed worst ${fixedWorst}`
  );
});

test('a continuously consuming agent needs zero probes per day instead of 288', () => {
  const count = adaptive => {
    let probes = 0;
    let lastProbeAt = null;
    for (let now = 60_000; now <= 86_400_000; now += 60_000) {
      const result = evaluateProbe({
        now,
        lastProbeAt,
        lastProbeAckAt: lastProbeAt,
        misses: 0,
        lastAliveAt: adaptive ? now : null,
      });
      if (result.sendNew) {
        probes++;
        lastProbeAt = now;
      }
    }
    return probes;
  };
  assert.equal(count(false), 288);
  assert.equal(count(true), 0);
});
