import { Worker } from 'node:worker_threads';

// JOV-6192: prove the packaged app's main process is responsive, with
// detection authority on a scheduler that is NOT the main event loop.
//
// A liveness timer scheduled on the main loop cannot prove prompt detection:
// if the loop is blocked, the timer that would detect it never fires. So the
// design here splits responsibility:
//
// - The probe (a `node:worker_threads` Worker) owns detection. It sends pings
//   and decides on ITS OWN timers whether the main loop answered inside the
//   budget. A blocked main loop cannot delay the probe's deadline.
// - The main side owns only a responder (ping → pong) plus a loop-lag meter
//   for bounded diagnostics. The lag meter is evidence, not detection.
//
// Budgets below are detection parameters for the JOV-6192 harness — proposed
// desktop limits recorded in docs/performance/performance-invariants-v1.md
// under "Known holes", not a certified perf budget.

export const MAIN_LIVENESS_PROBE_INTERVAL_MS = 1_000;
export const MAIN_LIVENESS_PONG_BUDGET_MS = 2_000;
export const MAIN_LIVENESS_LAG_SAMPLE_INTERVAL_MS = 1_000;
export const MAIN_LIVENESS_MAX_LAG_SAMPLES = 60;

export type MainLivenessVerdict = 'responsive' | 'blocked';

export interface MainLivenessVerdictDetail {
  readonly verdict: MainLivenessVerdict;
  /** ms between ping send and pong arrival; null when the deadline expired. */
  readonly pongLagMs: number | null;
}

export type MainLivenessPing = {
  readonly type: 'jovie-main-liveness-ping';
  readonly id: number;
  readonly sentAt: number;
};

export type MainLivenessPong = {
  readonly type: 'jovie-main-liveness-pong';
  readonly id: number;
  readonly sentAt: number;
  /** Main-loop lag sample at answer time; diagnostics only. */
  readonly loopLagMs: number | null;
};

export function isMainLivenessPing(value: unknown): value is MainLivenessPing {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'jovie-main-liveness-ping' &&
    typeof (value as { id?: unknown }).id === 'number'
  );
}

export function isMainLivenessPong(value: unknown): value is MainLivenessPong {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'jovie-main-liveness-pong' &&
    typeof (value as { id?: unknown }).id === 'number'
  );
}

/**
 * Classify one ping round-trip. A pong that arrives AFTER the deadline still
 * means the loop was blocked during the budget window — late is not healthy.
 */
export function decideMainLivenessVerdict(input: {
  readonly pongLagMs: number | null;
  readonly budgetMs: number;
}): MainLivenessVerdict {
  if (input.pongLagMs === null) return 'blocked';
  return input.pongLagMs <= input.budgetMs ? 'responsive' : 'blocked';
}

type NowFn = () => number;
type SetTimerFn = (fn: () => void, ms: number) => unknown;
type ClearTimerFn = (handle: unknown) => void;

const defaultNow: NowFn = () => Date.now();
const defaultSetInterval: SetTimerFn = (fn, ms) => setInterval(fn, ms);
const defaultSetTimeout: SetTimerFn = (fn, ms) => setTimeout(fn, ms);
const defaultClearTimer: ClearTimerFn = handle => {
  clearTimeout(handle as NodeJS.Timeout);
  clearInterval(handle as NodeJS.Timeout);
};

/**
 * Main-side loop-lag sampler. Compares expected vs actual fire time of a
 * self-scheduled timer. Diagnostics only — a sample that never runs is not a
 * missed-deadline signal; blocked-loop detection belongs to the probe.
 */
export function createMainLoopLagMeter(options?: {
  readonly intervalMs?: number;
  readonly maxSamples?: number;
  readonly now?: NowFn;
  readonly setTimer?: SetTimerFn;
  readonly clearTimer?: ClearTimerFn;
}): {
  readonly latestLagMs: () => number | null;
  readonly samples: () => readonly number[];
  readonly dispose: () => void;
} {
  const intervalMs =
    options?.intervalMs ?? MAIN_LIVENESS_LAG_SAMPLE_INTERVAL_MS;
  const maxSamples = options?.maxSamples ?? MAIN_LIVENESS_MAX_LAG_SAMPLES;
  const now = options?.now ?? defaultNow;
  const setTimer = options?.setTimer ?? defaultSetInterval;
  const clearTimer = options?.clearTimer ?? defaultClearTimer;

  const samples: number[] = [];
  let expectedAt = now() + intervalMs;
  const handle = setTimer(() => {
    const lag = Math.max(0, now() - expectedAt);
    samples.push(lag);
    if (samples.length > maxSamples) samples.shift();
    expectedAt = now() + intervalMs;
  }, intervalMs);

  return {
    latestLagMs: () =>
      samples.length > 0 ? samples[samples.length - 1] : null,
    samples: () => [...samples],
    dispose: () => clearTimer(handle),
  };
}

/**
 * Main-side responder. Answers a ping immediately with the current lag
 * sample. Contains no timers: if the loop is blocked this simply never runs,
 * which is exactly what the probe is looking for.
 */
export function createMainLivenessResponder(input: {
  readonly latestLagMs: () => number | null;
}): {
  readonly handlePing: (ping: MainLivenessPing) => MainLivenessPong;
} {
  return {
    handlePing: ping => ({
      type: 'jovie-main-liveness-pong',
      id: ping.id,
      sentAt: ping.sentAt,
      loopLagMs: input.latestLagMs(),
    }),
  };
}

/**
 * Probe-side controller. Detection lives on `setIndependentTimer` — injected
 * so tests can prove the verdict fires while the "main loop" never does, and
 * so production binds it to the worker's own timers, not main's.
 *
 * State machine per ping: send → wait `budgetMs` → on-time pong flips a
 * blocked streak back to `responsive`; a missed deadline (or late pong, where
 * measured lag exceeded budget) reports `blocked` once per episode.
 */
export function createMainLivenessProbe(options: {
  readonly sendPing: (ping: MainLivenessPing) => void;
  readonly onVerdict: (detail: MainLivenessVerdictDetail) => void;
  readonly intervalMs?: number;
  readonly budgetMs?: number;
  readonly now?: NowFn;
  /** Recurring tick scheduler on the probe's own loop (default setInterval). */
  readonly setIndependentInterval?: SetTimerFn;
  /** One-shot ping deadline on the probe's own loop (default setTimeout). */
  readonly setIndependentTimeout?: SetTimerFn;
  readonly clearIndependentTimer?: ClearTimerFn;
}): {
  readonly start: () => void;
  readonly onPong: (pong: MainLivenessPong) => void;
  readonly dispose: () => void;
} {
  const intervalMs = options.intervalMs ?? MAIN_LIVENESS_PROBE_INTERVAL_MS;
  const budgetMs = options.budgetMs ?? MAIN_LIVENESS_PONG_BUDGET_MS;
  const now = options.now ?? defaultNow;
  const setTickInterval = options.setIndependentInterval ?? defaultSetInterval;
  const setDeadline = options.setIndependentTimeout ?? defaultSetTimeout;
  const clearTimer = options.clearIndependentTimer ?? defaultClearTimer;

  let nextId = 0;
  let pending: { readonly id: number; readonly sentAt: number } | null = null;
  let deadlineHandle: unknown = null;
  let intervalHandle: unknown = null;
  let blocked = false;
  let disposed = false;

  const clearDeadline = () => {
    if (deadlineHandle !== null) {
      clearTimer(deadlineHandle);
      deadlineHandle = null;
    }
  };

  const emit = (detail: MainLivenessVerdictDetail) => {
    if (detail.verdict === 'blocked') {
      if (blocked) return;
      blocked = true;
    } else {
      if (!blocked) return;
      blocked = false;
    }
    options.onVerdict(detail);
  };

  const expirePending = () => {
    deadlineHandle = null;
    if (pending === null || disposed) return;
    pending = null;
    emit({ verdict: 'blocked', pongLagMs: null });
  };

  const tick = () => {
    if (disposed) return;
    // One outstanding ping at a time. If it is still inside its budget, keep
    // waiting; its own deadline timer owns the miss. Only expire here when
    // the budget already elapsed — a defensive path for a lost deadline.
    if (pending !== null) {
      if (now() - pending.sentAt >= budgetMs) {
        expirePending();
      }
      return;
    }
    const ping: MainLivenessPing = {
      type: 'jovie-main-liveness-ping',
      id: nextId,
      sentAt: now(),
    };
    nextId += 1;
    pending = { id: ping.id, sentAt: ping.sentAt };
    deadlineHandle = setDeadline(expirePending, budgetMs);
    options.sendPing(ping);
  };

  return {
    start: () => {
      if (disposed || intervalHandle !== null) return;
      intervalHandle = setTickInterval(tick, intervalMs);
    },
    onPong: pong => {
      if (disposed || pending === null || pong.id !== pending.id) return;
      const lag = Math.max(0, now() - pending.sentAt);
      clearDeadline();
      pending = null;
      emit({
        verdict: decideMainLivenessVerdict({
          pongLagMs: lag,
          budgetMs,
        }),
        pongLagMs: lag,
      });
    },
    dispose: () => {
      disposed = true;
      clearDeadline();
      if (intervalHandle !== null) {
        clearTimer(intervalHandle);
        intervalHandle = null;
      }
      pending = null;
    },
  };
}

/**
 * Worker-side detection loop, run via `new Worker(source, { eval: true })`.
 * Plain CommonJS-free JS: worker_threads provides `parentPort` inside eval
 * source via require('node:worker_threads'). The worker's timers are on the
 * worker's own libuv loop, so a blocked main loop cannot postpone detection.
 */
export const MAIN_LIVENESS_PROBE_WORKER_SOURCE = `
'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const intervalMs = workerData.intervalMs;
const budgetMs = workerData.budgetMs;
let nextId = 0;
let pending = null;
let deadline = null;
let blocked = false;
function emit(detail) {
  if (detail.verdict === 'blocked') {
    if (blocked) return;
    blocked = true;
  } else if (!blocked) {
    return;
  } else {
    blocked = false;
  }
  parentPort.postMessage({ type: 'jovie-main-liveness-verdict', ...detail });
}
function expire() {
  deadline = null;
  if (!pending) return;
  pending = null;
  emit({ verdict: 'blocked', pongLagMs: null });
}
function tick() {
  if (pending && Date.now() - pending.sentAt >= budgetMs) expire();
  if (pending) return;
  const ping = { type: 'jovie-main-liveness-ping', id: nextId, sentAt: Date.now() };
  nextId += 1;
  pending = { id: ping.id, sentAt: ping.sentAt };
  deadline = setTimeout(expire, budgetMs);
  parentPort.postMessage(ping);
}
parentPort.on('message', msg => {
  if (!msg || msg.type !== 'jovie-main-liveness-pong' || !pending) return;
  if (msg.id !== pending.id) return;
  const lag = Math.max(0, Date.now() - pending.sentAt);
  clearTimeout(deadline);
  deadline = null;
  pending = null;
  emit({ verdict: lag <= budgetMs ? 'responsive' : 'blocked', pongLagMs: lag });
});
setInterval(tick, intervalMs).unref();
`;

export interface MainLivenessMonitor {
  readonly dispose: () => void;
}

export type MainLivenessProbeChannel = {
  readonly postMessage: (value: unknown) => void;
  readonly onMessage: (listener: (value: unknown) => void) => void;
  readonly terminate: () => void;
};

export interface MainLivenessVerdictMessage {
  readonly type: 'jovie-main-liveness-verdict';
  readonly verdict: MainLivenessVerdict;
  readonly pongLagMs: number | null;
}

export function isMainLivenessVerdictMessage(
  value: unknown
): value is MainLivenessVerdictMessage {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'jovie-main-liveness-verdict' &&
    ((value as { verdict?: unknown }).verdict === 'responsive' ||
      (value as { verdict?: unknown }).verdict === 'blocked')
  );
}

/**
 * Main-side monitor wiring: spawn the probe channel (a Worker in production,
 * a fake in tests), answer its pings, and forward verdicts. The monitor adds
 * no detection of its own — by construction the verdict can only come from
 * the probe's independent scheduler.
 */
export function createMainLivenessMonitor(options: {
  readonly spawnProbe: () => MainLivenessProbeChannel;
  readonly onVerdict: (message: MainLivenessVerdictMessage) => void;
  readonly onProbeError?: (error: unknown) => void;
  readonly lagMeter?: {
    readonly latestLagMs: () => number | null;
    readonly dispose?: () => void;
  };
}): MainLivenessMonitor {
  const meter = options.lagMeter ?? createMainLoopLagMeter();
  const responder = createMainLivenessResponder({
    latestLagMs: meter.latestLagMs,
  });

  let channel: MainLivenessProbeChannel;
  try {
    channel = options.spawnProbe();
  } catch (error) {
    options.onProbeError?.(error);
    meter.dispose?.();
    return { dispose: () => undefined };
  }

  channel.onMessage(value => {
    if (isMainLivenessPing(value)) {
      channel.postMessage(responder.handlePing(value));
      return;
    }
    if (isMainLivenessVerdictMessage(value)) {
      options.onVerdict(value);
    }
  });

  return {
    dispose: () => {
      meter.dispose?.();
      channel.terminate();
    },
  };
}

/**
 * Default probe channel backed by a real worker_threads Worker.
 */
export function spawnMainLivenessWorker(options?: {
  readonly intervalMs?: number;
  readonly budgetMs?: number;
}): MainLivenessProbeChannel {
  const worker = new Worker(MAIN_LIVENESS_PROBE_WORKER_SOURCE, {
    eval: true,
    workerData: {
      intervalMs: options?.intervalMs ?? MAIN_LIVENESS_PROBE_INTERVAL_MS,
      budgetMs: options?.budgetMs ?? MAIN_LIVENESS_PONG_BUDGET_MS,
    },
  });
  worker.unref();
  return {
    postMessage: value => {
      worker.postMessage(value);
    },
    onMessage: listener => {
      worker.on('message', listener);
    },
    terminate: () => {
      void worker.terminate();
    },
  };
}

/**
 * Bounded, redacted summary of an unhandled rejection for diagnostics.
 * Never includes stack payloads beyond the message's first line, strips
 * common token shapes, and caps length so a hostile rejection cannot flood
 * the log. The process is never kept alive on the strength of this handler —
 * observing is not suppressing.
 */
export const UNHANDLED_REJECTION_MESSAGE_MAX_CHARS = 200;

export function summarizeUnhandledRejection(reason: unknown): string {
  let text: string;
  if (reason instanceof Error) {
    const firstLine = (reason.message || reason.name).split('\n')[0];
    text = `${reason.name}: ${firstLine}`;
  } else {
    text = String(reason);
  }
  return text
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(
      /([?&](?:token|key|secret|signature|code)=)[^&\s]+/gi,
      '$1[redacted]'
    )
    .slice(0, UNHANDLED_REJECTION_MESSAGE_MAX_CHARS);
}
