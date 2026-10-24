/**
 * Pure admission, budget and breaker decisions over one credential's ledger
 * state. Callers run these inside a store transaction, so every process on a
 * host sees the same budget. scripts/apiclient/policy.py mirrors this file.
 */
import {
  type BreakerDefaults,
  CONTRACT,
  type PriorityName,
  priorityPolicy,
} from './contract.ts';
import type { Failure, Observation } from './headers.ts';

export const LEDGER_SCHEMA = 'jovie-api-ledger/v1';
const HOUR_MS = 3_600_000;
const USAGE_HOURS = 24;
/** An observation without a reset time is trusted this long. */
const UNTIMED_OBSERVATION_MS = 60_000;

export interface Bucket {
  limit: number | null;
  remaining: number;
  resetAt: number | null;
  observedAt: number;
}

export interface Breaker {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  windowStart: number;
  openUntil: number;
  opens: number;
  probeUntil: number;
  reason: string;
}

export const USAGE_FIELDS = [
  'attempts',
  'ok',
  'errors',
  'rateLimited',
  'shed',
  'waited',
  'retries',
  'cacheHits',
  'notModified',
] as const;
export type UsageField = (typeof USAGE_FIELDS)[number];
export type Usage = Record<UsageField, number>;

export interface CredentialState {
  buckets: Record<string, Bucket>;
  pace: Record<string, { tokens: number; updatedAt: number }>;
  breaker: Breaker;
  lastWriteAt: number;
  lastSeenAt: number;
  usage: Record<string, Partial<Record<PriorityName, Usage>>>;
  /** Money spent today (UTC) on priced calls; absent until the first one. */
  spend?: Spend;
}

export interface Spend {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  usd: number;
}

export type SpendDecision =
  | { readonly ok: true; readonly spentUsd: number }
  | {
      readonly ok: false;
      readonly spentUsd: number;
      readonly capUsd: number | null;
      readonly retryAt: number;
    };

export interface ProviderLedger {
  schema: typeof LEDGER_SCHEMA;
  provider: string;
  credentials: Record<string, CredentialState>;
}

export interface AdmissionRequest {
  readonly priority: PriorityName;
  /** Cost per budget resource, e.g. { core: 1 } or { requests: 1, complexity: 50 }. */
  readonly costs: Readonly<Record<string, number>>;
  readonly write: boolean;
  readonly minWriteIntervalMs?: number;
}

export interface Decision {
  readonly action: 'go' | 'wait' | 'shed';
  readonly until: number | null;
  readonly reason: string;
  readonly probe: boolean;
  /** Set when this decision moved the breaker from open to half-open. */
  readonly transition?: Transition;
}

export interface Transition {
  readonly from: Breaker['state'];
  readonly to: Breaker['state'];
  readonly reason: string;
  readonly until: number | null;
}

export function emptyLedger(provider: string): ProviderLedger {
  return { schema: LEDGER_SCHEMA, provider, credentials: {} };
}

export function emptyCredential(nowMs: number): CredentialState {
  return {
    buckets: {},
    pace: {},
    breaker: {
      state: 'closed',
      failures: 0,
      windowStart: 0,
      openUntil: 0,
      opens: 0,
      probeUntil: 0,
      reason: '',
    },
    lastWriteAt: 0,
    lastSeenAt: nowMs,
    usage: {},
  };
}

export function credentialState(
  ledger: ProviderLedger,
  credential: string,
  nowMs: number
): CredentialState {
  ledger.credentials[credential] ??= emptyCredential(nowMs);
  const state = ledger.credentials[credential];
  state.lastSeenAt = nowMs;
  return state;
}

/** A bucket that still describes the current window, or null. */
export function liveBucket(
  state: CredentialState,
  resource: string,
  nowMs: number
): Bucket | null {
  const bucket = state.buckets[resource];
  if (!bucket) return null;
  const expiresAt =
    bucket.resetAt ?? bucket.observedAt + UNTIMED_OBSERVATION_MS;
  if (nowMs >= expiresAt) {
    delete state.buckets[resource];
    delete state.pace[resource];
    return null;
  }
  return bucket;
}

export function bump(
  state: CredentialState,
  priority: PriorityName,
  field: UsageField,
  nowMs: number,
  by = 1
): void {
  const hour = String(Math.floor(nowMs / HOUR_MS));
  const row = (state.usage[hour] ??= {});
  const usage = (row[priority] ??= Object.fromEntries(
    USAGE_FIELDS.map(f => [f, 0])
  ) as Usage);
  usage[field] += by;
  const oldest = Math.floor(nowMs / HOUR_MS) - USAGE_HOURS;
  for (const key of Object.keys(state.usage)) {
    if (Number(key) < oldest) delete state.usage[key];
  }
}

function floorFor(bucket: Bucket, reserve: number): number {
  return bucket.limit === null ? 0 : Math.ceil(bucket.limit * reserve);
}

function blocked(
  priority: PriorityName,
  until: number | null,
  reason: string
): Decision {
  const policy = priorityPolicy(priority);
  const action = policy.onLow === 'shed' ? 'shed' : 'wait';
  return { action, until, reason, probe: false };
}

/**
 * Admit, delay or shed one request. On `go` the state already carries the
 * optimistic budget decrement, pacing token, write slot and probe lease.
 */
export function decide(
  state: CredentialState,
  request: AdmissionRequest,
  nowMs: number,
  breakerCfg: BreakerDefaults = CONTRACT.defaults.breaker,
  burst = CONTRACT.defaults.pace.burst
): Decision {
  const { priority } = request;
  const breaker = state.breaker;
  let transition: Transition | undefined;
  if (breaker.state === 'open') {
    if (nowMs < breaker.openUntil) {
      return blocked(
        priority,
        breaker.openUntil,
        `breaker-open:${breaker.reason}`
      );
    }
    breaker.state = 'half-open';
    transition = {
      from: 'open',
      to: 'half-open',
      reason: breaker.reason,
      until: null,
    };
  }
  const decision = decideBudget(
    state,
    request,
    nowMs,
    breakerCfg,
    burst,
    breaker.state === 'half-open'
  );
  return transition ? { ...decision, transition } : decision;
}

function decideBudget(
  state: CredentialState,
  request: AdmissionRequest,
  nowMs: number,
  breakerCfg: BreakerDefaults,
  burst: number,
  halfOpen: boolean
): Decision {
  const { priority } = request;
  const policy = priorityPolicy(priority);
  const breaker = state.breaker;
  let probe = false;
  if (halfOpen) {
    if (breaker.probeUntil > nowMs) {
      return blocked(priority, breaker.probeUntil, 'breaker-probe-in-flight');
    }
    probe = true;
  }
  for (const [resource, cost] of Object.entries(request.costs)) {
    const bucket = liveBucket(state, resource, nowMs);
    if (!bucket) continue;
    if (bucket.remaining - cost < floorFor(bucket, policy.reserve)) {
      const until = bucket.resetAt ?? nowMs + breakerCfg.rateLimitCooldownMs;
      return blocked(priority, until, `budget-reserve:${resource}`);
    }
  }
  if (policy.class === 'background') {
    for (const resource of Object.keys(request.costs)) {
      const bucket = liveBucket(state, resource, nowMs);
      if (!bucket || bucket.resetAt === null) continue;
      const headroom = bucket.remaining - floorFor(bucket, policy.reserve);
      const rate = headroom / Math.max(1000, bucket.resetAt - nowMs);
      // A burst scales with the headroom, so a report that needs a few dozen
      // reads runs, while a hot poller still cannot front-load the window.
      const cap = Math.max(
        burst,
        Math.ceil(headroom * CONTRACT.defaults.pace.burstFraction)
      );
      const pace = state.pace[resource] ?? { tokens: cap, updatedAt: nowMs };
      const tokens = Math.min(
        cap,
        pace.tokens + Math.max(0, nowMs - pace.updatedAt) * rate
      );
      if (tokens < 1) {
        const until =
          rate > 0 ? nowMs + Math.ceil((1 - tokens) / rate) : bucket.resetAt;
        return blocked(priority, until, `pace:${resource}`);
      }
      state.pace[resource] = { tokens, updatedAt: nowMs };
    }
  }
  const interval = request.write ? (request.minWriteIntervalMs ?? 0) : 0;
  if (
    interval > 0 &&
    state.lastWriteAt > 0 &&
    nowMs < state.lastWriteAt + interval
  ) {
    return {
      action: 'wait',
      until: state.lastWriteAt + interval,
      reason: 'write-spacing',
      probe: false,
    };
  }
  // Admitted: commit every reservation at once.
  if (policy.class === 'background') {
    for (const resource of Object.keys(request.costs)) {
      if (state.pace[resource]) state.pace[resource].tokens -= 1;
    }
  }
  for (const [resource, cost] of Object.entries(request.costs)) {
    const bucket = liveBucket(state, resource, nowMs);
    if (bucket) bucket.remaining = Math.max(0, bucket.remaining - cost);
  }
  if (interval > 0) state.lastWriteAt = nowMs;
  if (probe) breaker.probeUntil = nowMs + breakerCfg.probeLeaseMs;
  bump(state, priority, 'attempts', nowMs);
  return {
    action: 'go',
    until: null,
    reason: probe ? 'breaker-probe' : 'admitted',
    probe,
  };
}

/** Fold response headers into the shared buckets. Server truth wins. */
export function observe(
  state: CredentialState,
  observations: readonly Observation[],
  nowMs: number
): void {
  for (const obs of observations) {
    const current = state.buckets[obs.resource];
    if (
      current?.resetAt != null &&
      obs.resetAt !== null &&
      obs.resetAt < current.resetAt - 1000
    ) {
      continue; // a response from an older window arrived late
    }
    state.buckets[obs.resource] = {
      limit: obs.limit ?? current?.limit ?? null,
      remaining: obs.remaining,
      resetAt: obs.resetAt,
      observedAt: nowMs,
    };
  }
}

function open(breaker: Breaker, until: number, reason: string): Transition {
  const from = breaker.state;
  breaker.state = 'open';
  breaker.openUntil = Math.max(breaker.openUntil, until);
  breaker.opens += 1;
  breaker.failures = 0;
  breaker.probeUntil = 0;
  breaker.reason = reason;
  return { from, to: 'open', reason, until: breaker.openUntil };
}

export function cooldownMs(opens: number, cfg: BreakerDefaults): number {
  return Math.min(cfg.cooldownMaxMs, cfg.cooldownBaseMs * 2 ** opens);
}

export interface Outcome {
  readonly priority: PriorityName;
  readonly resource: string;
  readonly failure: Failure;
  readonly probe: boolean;
}

/** Record a finished attempt; returns a breaker transition when one happened. */
export function recordOutcome(
  state: CredentialState,
  outcome: Outcome,
  nowMs: number,
  cfg: BreakerDefaults = CONTRACT.defaults.breaker
): Transition | null {
  const { failure, priority } = outcome;
  const breaker = state.breaker;
  if (failure.kind === 'none' || failure.kind === 'client') {
    bump(state, priority, failure.kind === 'none' ? 'ok' : 'errors', nowMs);
    breaker.failures = 0;
    if (breaker.state === 'closed') return null;
    const from = breaker.state;
    Object.assign(breaker, {
      state: 'closed',
      opens: 0,
      probeUntil: 0,
      openUntil: 0,
      reason: '',
    });
    return { from, to: 'closed', reason: 'probe-succeeded', until: null };
  }
  bump(state, priority, 'errors', nowMs);
  if (failure.kind === 'primary') {
    bump(state, priority, 'rateLimited', nowMs);
    const resetAt = failure.retryAtMs ?? nowMs + cfg.rateLimitCooldownMs;
    const bucket = state.buckets[outcome.resource];
    state.buckets[outcome.resource] = {
      limit: bucket?.limit ?? null,
      remaining: 0,
      resetAt: Math.max(resetAt, nowMs + 1000),
      observedAt: nowMs,
    };
    if (outcome.probe) breaker.probeUntil = 0;
    return null;
  }
  if (failure.kind === 'secondary') {
    bump(state, priority, 'rateLimited', nowMs);
    const until = failure.retryAtMs ?? nowMs + cfg.rateLimitCooldownMs;
    return open(breaker, until, 'secondary-rate-limit');
  }
  if (outcome.probe || breaker.state === 'half-open') {
    return open(
      breaker,
      nowMs + cooldownMs(breaker.opens, cfg),
      'probe-failed'
    );
  }
  if (nowMs - breaker.windowStart > cfg.failureWindowMs) {
    breaker.windowStart = nowMs;
    breaker.failures = 0;
  }
  breaker.failures += 1;
  if (breaker.failures < cfg.failureThreshold) return null;
  return open(
    breaker,
    nowMs + cooldownMs(breaker.opens, cfg),
    'transient-failures'
  );
}

/** Full-jitter exponential backoff that never retries before a known reset. */
export function backoffMs(
  attempt: number,
  failure: Failure,
  nowMs: number,
  random: () => number,
  baseMs = CONTRACT.defaults.backoffBaseMs,
  capMs = CONTRACT.defaults.backoffCapMs
): number {
  const jitter = Math.floor(
    random() * Math.min(capMs, baseMs * 2 ** (attempt - 1))
  );
  const hinted = failure.retryAtMs === null ? 0 : failure.retryAtMs - nowMs;
  return Math.max(jitter, hinted);
}

/** Drop credentials nobody used recently, unless their breaker is still open. */
export const utcDay = (nowMs: number): string =>
  new Date(nowMs).toISOString().slice(0, 10);

const nextUtcDay = (nowMs: number): number =>
  Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate() + 1
  );

function spentToday(state: CredentialState, nowMs: number): number {
  return state.spend?.day === utcDay(nowMs) ? state.spend.usd : 0;
}

/**
 * Reserve `priceUsd` against today's cap before a priced call. No cap means
 * fail closed: a priced call never runs unbounded. Refund on failure.
 */
export function reserveSpend(
  state: CredentialState,
  priceUsd: number,
  capUsd: number | null | undefined,
  nowMs: number
): SpendDecision {
  const spent = spentToday(state, nowMs);
  if (priceUsd <= 0) return { ok: true, spentUsd: spent };
  if (capUsd == null || spent + priceUsd > capUsd + 1e-9)
    return {
      ok: false,
      spentUsd: spent,
      capUsd: capUsd ?? null,
      retryAt: nextUtcDay(nowMs),
    };
  state.spend = { day: utcDay(nowMs), usd: spent + priceUsd };
  return { ok: true, spentUsd: spent + priceUsd };
}

/** Failed calls are free: give back a reservation made today. */
export function refundSpend(
  state: CredentialState,
  priceUsd: number,
  nowMs: number
): void {
  if (priceUsd <= 0 || state.spend?.day !== utcDay(nowMs)) return;
  state.spend.usd = Math.max(0, state.spend.usd - priceUsd);
}

export function pruneLedger(
  ledger: ProviderLedger,
  nowMs: number,
  staleMs = CONTRACT.defaults.staleCredentialMs
): void {
  for (const [id, state] of Object.entries(ledger.credentials)) {
    const open =
      state.breaker.state !== 'closed' && state.breaker.openUntil > nowMs;
    // Today's spend must survive idle hours or the daily cap would reset.
    const spending = spentToday(state, nowMs) > 0;
    if (!open && !spending && nowMs - state.lastSeenAt > staleMs)
      delete ledger.credentials[id];
  }
}
