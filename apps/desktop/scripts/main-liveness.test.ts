import { expect, test, vi } from 'vitest';
import {
  createMainLivenessMonitor,
  createMainLivenessProbe,
  createMainLivenessResponder,
  createMainLoopLagMeter,
  decideMainLivenessVerdict,
  isMainLivenessPing,
  isMainLivenessVerdictMessage,
  MAIN_LIVENESS_PROBE_WORKER_SOURCE,
  type MainLivenessProbeChannel,
  type MainLivenessVerdictMessage,
  spawnMainLivenessWorker,
  summarizeUnhandledRejection,
} from '../src/main-liveness.ts';

test('a pong inside the budget is responsive; a miss or late pong is blocked', () => {
  expect(decideMainLivenessVerdict({ pongLagMs: 500, budgetMs: 2_000 })).toBe(
    'responsive'
  );
  expect(decideMainLivenessVerdict({ pongLagMs: 2_000, budgetMs: 2_000 })).toBe(
    'responsive'
  );
  expect(decideMainLivenessVerdict({ pongLagMs: 2_001, budgetMs: 2_000 })).toBe(
    'blocked'
  );
  expect(decideMainLivenessVerdict({ pongLagMs: null, budgetMs: 2_000 })).toBe(
    'blocked'
  );
});

test('probe detects a blocked main loop without ever running on it', () => {
  vi.useFakeTimers();
  try {
    const verdicts: { verdict: string; pongLagMs: number | null }[] = [];
    const sent: unknown[] = [];
    const probe = createMainLivenessProbe({
      intervalMs: 100,
      budgetMs: 200,
      // The ping goes out, but the responder is "blocked": onPong is never
      // called. Detection must still fire — its timers are independent.
      sendPing: ping => {
        sent.push(ping);
      },
      onVerdict: d => {
        verdicts.push(d);
      },
    });

    probe.start();
    vi.advanceTimersByTime(1_000);
    probe.dispose();

    expect(verdicts).toEqual([{ verdict: 'blocked', pongLagMs: null }]);
    // Detection is not suppressed while blocked — keep probing.
    expect(sent.length).toBeGreaterThanOrEqual(5);
  } finally {
    vi.useRealTimers();
  }
});

test('probe reports a single blocked episode then one recovery verdict', () => {
  vi.useFakeTimers();
  try {
    const verdicts: MainLivenessVerdictMessage['verdict'][] = [];
    const pings: { id: number; sentAt: number }[] = [];
    let now = 0;
    const probe = createMainLivenessProbe({
      intervalMs: 100,
      budgetMs: 200,
      now: () => now,
      sendPing: ping => {
        pings.push(ping);
      },
      onVerdict: d => {
        verdicts.push(d.verdict);
      },
    });
    const responder = createMainLivenessResponder({ latestLagMs: () => 5 });

    probe.start();

    // Episode 1: two missed pings, one blocked verdict.
    vi.advanceTimersByTime(100); // ping 0 sent
    vi.advanceTimersByTime(200); // deadline expires → blocked
    vi.advanceTimersByTime(300); // ping 1 sent, then missed: still blocked

    // Recovery: the newest outstanding ping answered inside budget.
    now += 50;
    probe.onPong(responder.handlePing(pings[pings.length - 1]));

    probe.dispose();

    expect(verdicts).toEqual(['blocked', 'responsive']);
    expect(isMainLivenessPing(pings[0])).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

test('a late pong is recorded as blocked, not silently dropped', () => {
  vi.useFakeTimers();
  try {
    const verdicts: { verdict: string; pongLagMs: number | null }[] = [];
    const pings: { id: number; sentAt: number }[] = [];
    let now = 0;
    const probe = createMainLivenessProbe({
      intervalMs: 100,
      budgetMs: 200,
      now: () => now,
      sendPing: ping => {
        pings.push(ping);
      },
      onVerdict: d => {
        verdicts.push(d);
      },
    });
    const responder = createMainLivenessResponder({ latestLagMs: () => 1 });

    probe.start();
    vi.advanceTimersByTime(100); // ping sent
    now += 150; // main loop "wakes" at lag 150 — inside budget
    probe.onPong(responder.handlePing(pings[0]));
    // within budget and no prior block: no verdict emitted yet
    expect(verdicts).toEqual([]);

    vi.advanceTimersByTime(100); // ping 1
    now += 400; // pong arrives after the deadline window already closed
    vi.advanceTimersByTime(200); // deadline fires first → blocked
    probe.onPong(responder.handlePing(pings[1])); // stale, ignored
    probe.dispose();

    expect(verdicts).toEqual([{ verdict: 'blocked', pongLagMs: null }]);
  } finally {
    vi.useRealTimers();
  }
});

test('loop lag meter is bounded and reports observed lag', () => {
  vi.useFakeTimers();
  try {
    let now = 1_000;
    const meter = createMainLoopLagMeter({
      intervalMs: 100,
      maxSamples: 3,
      now: () => now,
    });
    for (let i = 0; i < 6; i += 1) {
      now += 160; // each tick fires 60ms late
      vi.advanceTimersByTime(100);
    }
    expect(meter.latestLagMs()).toBe(60);
    expect(meter.samples().length).toBe(3);
    meter.dispose();
  } finally {
    vi.useRealTimers();
  }
});

test('monitor answers pings and forwards verdicts from the channel', () => {
  const delivered: MainLivenessVerdictMessage[] = [];
  const sent: unknown[] = [];
  let listener: ((value: unknown) => void) | null = null;
  const channel: MainLivenessProbeChannel = {
    postMessage: v => {
      sent.push(v);
    },
    onMessage: l => {
      listener = l;
    },
    terminate: () => undefined,
  };

  const monitor = createMainLivenessMonitor({
    spawnProbe: () => channel,
    onVerdict: m => {
      delivered.push(m);
    },
    lagMeter: { latestLagMs: () => 7 },
  });

  listener!({
    type: 'jovie-main-liveness-ping',
    id: 3,
    sentAt: 1234,
  });
  expect(sent).toEqual([
    {
      type: 'jovie-main-liveness-pong',
      id: 3,
      sentAt: 1234,
      loopLagMs: 7,
    },
  ]);

  listener!({
    type: 'jovie-main-liveness-verdict',
    verdict: 'blocked',
    pongLagMs: null,
  });
  expect(delivered).toEqual([
    {
      type: 'jovie-main-liveness-verdict',
      verdict: 'blocked',
      pongLagMs: null,
    },
  ]);
  expect(isMainLivenessVerdictMessage({ type: 'nope' })).toBe(false);

  monitor.dispose();
});

test('probe spawn failure is surfaced, never silent', () => {
  const errors: unknown[] = [];
  const monitor = createMainLivenessMonitor({
    spawnProbe: () => {
      throw new Error('worker unsupported');
    },
    onVerdict: () => undefined,
    onProbeError: e => {
      errors.push(e);
    },
  });
  expect(errors).toHaveLength(1);
  monitor.dispose();
});

test('worker source is valid JS and keeps detection off the main loop', () => {
  // Compiles as a standalone script; throws on a syntax error.
  expect(() => new Function(MAIN_LIVENESS_PROBE_WORKER_SOURCE)).not.toThrow();
  // The deadline lives on the worker's timers, not the responder's loop.
  expect(MAIN_LIVENESS_PROBE_WORKER_SOURCE).toContain('setTimeout(expire');
});

test('real worker flags a main loop that never answers', async () => {
  const worker = spawnMainLivenessWorker({ intervalMs: 20, budgetMs: 60 });
  try {
    const verdict = await new Promise<MainLivenessVerdictMessage>(resolve => {
      worker.onMessage(value => {
        if (isMainLivenessVerdictMessage(value)) resolve(value);
      });
      // Deliberately never answer pings: this simulates a blocked main loop.
    });
    expect(verdict.verdict).toBe('blocked');
    expect(verdict.pongLagMs).toBeNull();
  } finally {
    worker.terminate();
  }
}, 10_000);

test('real worker reports responsive then blocked across a freeze', async () => {
  const worker = spawnMainLivenessWorker({ intervalMs: 20, budgetMs: 60 });
  const verdicts: MainLivenessVerdictMessage[] = [];
  let answer = true;
  worker.onMessage(value => {
    if (isMainLivenessPing(value) && answer) {
      worker.postMessage({
        type: 'jovie-main-liveness-pong',
        id: value.id,
        sentAt: value.sentAt,
        loopLagMs: 0,
      });
    }
    if (isMainLivenessVerdictMessage(value)) verdicts.push(value);
  });

  // Simulate a freeze by stopping replies after ~150ms.
  await new Promise(r => setTimeout(r, 150));
  answer = false;
  const deadline = Date.now() + 2_000;
  while (verdicts.length === 0 && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 20));
  }
  worker.terminate();
  expect(verdicts[0]?.verdict).toBe('blocked');
}, 10_000);

test('rejection summaries are bounded and redact tokens', () => {
  expect(summarizeUnhandledRejection(new Error('plain failure'))).toBe(
    'Error: plain failure'
  );
  expect(summarizeUnhandledRejection('string reason')).toBe('string reason');
  expect(summarizeUnhandledRejection(undefined)).toBe('undefined');

  const leaked = summarizeUnhandledRejection(
    new Error('GET https://x.test/a?token=sekrit123&ok=1 failed Bearer abc.def')
  );
  expect(leaked).not.toContain('sekrit123');
  expect(leaked).not.toContain('abc.def');
  expect(leaked).toContain('[redacted]');

  const long = summarizeUnhandledRejection(new Error('x'.repeat(500)));
  expect(long.length).toBeLessThanOrEqual(200);
});
