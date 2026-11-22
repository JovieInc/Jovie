/**
 * Account-and-pool usage ledger (JOV-13050 first slice).
 *
 * Canonical store for provider-native usage-limit events. Summer's capacity registry
 * and schedulers remain authoritative for routing; this module is the durable event log
 * and read model. Fleet/Ovie consume via projectOvieUsagePools() — never duplicate state.
 */

export const LEDGER_SCHEMA = 'jovie.usage-ledger/v1';
export const EVENT_SCHEMA = 'jovie.usage-limit-event/v1';
export const PLAN_SCHEMA = 'jovie.usage-plan-snapshot/v1';
export const GRANT_SCHEMA = 'jovie.usage-reset-grant/v1';
export const SCHEDULED_RESET_SCHEMA = 'jovie.usage-scheduled-reset/v1';

export const POOL_STATES = Object.freeze([
  'available',
  'exhausted',
  'throttling',
  'outage',
  'auth_mismatch',
  'unknown',
]);

const ISO =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const SECRET =
  /(?:sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9._-]{20,}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

const isObject = v => typeof v === 'object' && v !== null && !Array.isArray(v);
const parseMs = v => {
  if (typeof v !== 'string' || !ISO.test(v)) return null;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? null : ms;
};

/** Stable idempotency key: provider + account + pool + provider event id when present. */
export function usageEventKey({ provider, accountId, pool, providerEventId }) {
  if (!ID.test(provider ?? '') || !ID.test(accountId ?? '') || !ID.test(pool ?? '')) {
    throw new Error('provider, accountId, and pool must be kebab identifiers');
  }
  const tail =
    typeof providerEventId === 'string' && providerEventId
      ? providerEventId
      : 'observation';
  return `${provider}:${accountId}:${pool}:${tail}`;
}

export function sanitizeReceiptText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(SECRET, '[redacted]')
    .replace(/token[=:]\s*\S+/gi, 'token=[redacted]')
    .slice(0, 4096);
}

export function sanitizeReceipt(value) {
  if (typeof value === 'string') {
    return { kind: 'text', body: sanitizeReceiptText(value) };
  }
  if (!isObject(value)) return { kind: 'unknown' };
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (key.toLowerCase().includes('email')) continue;
    out[key] =
      typeof item === 'string' ? sanitizeReceiptText(item) : structuredClone(item);
  }
  return out;
}

export function createEmptyLedger() {
  return {
    schema: LEDGER_SCHEMA,
    events: [],
    planSnapshots: {},
    grants: [],
    scheduledResets: [],
    refreshInFlight: {},
    indexes: { eventKeys: {} },
  };
}

function validateEvent(event) {
  const problems = [];
  if (event?.schema !== EVENT_SCHEMA) problems.push(`schema must be ${EVENT_SCHEMA}`);
  if (!ID.test(event?.provider ?? '')) problems.push('provider required');
  if (!ID.test(event?.accountId ?? '')) problems.push('accountId required');
  if (!ID.test(event?.pool ?? '')) problems.push('pool required');
  if (!POOL_STATES.includes(event?.condition) && event?.condition !== 'recovered') {
    problems.push('condition invalid');
  }
  if (parseMs(event?.observedAt) === null) problems.push('observedAt required');
  if (event?.resetsAt != null && parseMs(event.resetsAt) === null) {
    problems.push('resetsAt must be ISO-8601');
  }
  if (event?.remaining != null) {
    const r = event.remaining;
    if (!isObject(r) || (r.value != null && typeof r.value !== 'number')) {
      problems.push('remaining.value must be number or null (unknown)');
    }
  }
  if (event?.source?.receipt == null) problems.push('source.receipt required');
  return problems;
}

/**
 * @returns {{ ledger: object, applied: boolean, duplicate: boolean, event?: object }}
 */
export function appendUsageEvent(ledger, event, { now = Date.now() } = {}) {
  const base = ledger?.schema === LEDGER_SCHEMA ? ledger : createEmptyLedger();
  const problems = validateEvent(event);
  if (problems.length) throw new Error(problems.join('; '));

  const idempotencyKey =
    event.idempotencyKey ??
    usageEventKey({
      provider: event.provider,
      accountId: event.accountId,
      pool: event.pool,
      providerEventId: event.providerEventId,
    });

  if (base.indexes.eventKeys[idempotencyKey]) {
    return { ledger: base, applied: false, duplicate: true };
  }

  const row = {
    ...event,
    idempotencyKey,
    recordedAt: new Date(now).toISOString(),
    source: {
      ...event.source,
      receipt: sanitizeReceipt(event.source.receipt),
    },
  };

  const next = structuredClone(base);
  next.events = [...next.events, row];
  next.indexes = {
    ...next.indexes,
    eventKeys: { ...next.indexes.eventKeys, [idempotencyKey]: row.recordedAt },
  };
  invalidateSupersededResets(next, row, now);
  return { ledger: next, applied: true, duplicate: false, event: row };
}

export function recordPlanSnapshot(ledger, snapshot) {
  const base = ledger?.schema === LEDGER_SCHEMA ? ledger : createEmptyLedger();
  if (snapshot?.schema !== PLAN_SCHEMA) throw new Error(`schema must be ${PLAN_SCHEMA}`);
  if (!ID.test(snapshot.provider ?? '') || !ID.test(snapshot.accountId ?? '')) {
    throw new Error('provider and accountId required');
  }
  if (parseMs(snapshot.observedAt) === null) throw new Error('observedAt required');
  const key = `${snapshot.provider}/${snapshot.accountId}`;
  const next = structuredClone(base);
  const prior = next.planSnapshots[key];
  const priorAt = parseMs(prior?.observedAt) ?? 0;
  const nextAt = parseMs(snapshot.observedAt) ?? 0;
  if (nextAt >= priorAt) {
    next.planSnapshots[key] = {
      ...snapshot,
      pools: structuredClone(snapshot.pools ?? []),
    };
  }
  return next;
}

export function appendResetGrant(ledger, grant) {
  const base = ledger?.schema === LEDGER_SCHEMA ? ledger : createEmptyLedger();
  if (grant?.schema !== GRANT_SCHEMA) throw new Error(`schema must be ${GRANT_SCHEMA}`);
  if (!ID.test(grant.provider ?? '') || !ID.test(grant.accountId ?? '')) {
    throw new Error('provider and accountId required');
  }
  const key = grant.idempotencyKey ?? `${grant.provider}:${grant.accountId}:${grant.grantId}`;
  if (base.grants.some(g => g.idempotencyKey === key)) {
    return { ledger: base, applied: false, duplicate: true };
  }
  const next = structuredClone(base);
  next.grants = [
    ...next.grants,
    {
      ...grant,
      idempotencyKey: key,
      recordedAt: new Date().toISOString(),
    },
  ];
  return { ledger: next, applied: true, duplicate: false };
}

function latestEventForPool(ledger, provider, accountId, pool) {
  let latest = null;
  let latestAt = -1;
  for (const event of ledger.events ?? []) {
    if (
      event.provider !== provider ||
      event.accountId !== accountId ||
      event.pool !== pool
    ) {
      continue;
    }
    const at = parseMs(event.observedAt) ?? 0;
    if (at >= latestAt) {
      latestAt = at;
      latest = event;
    }
  }
  return latest;
}

function activeGrant(ledger, provider, accountId, pool, now) {
  let chosen = null;
  for (const grant of ledger.grants ?? []) {
    if (
      grant.provider !== provider ||
      grant.accountId !== accountId ||
      (grant.pool && grant.pool !== pool)
    ) {
      continue;
    }
    const expires = parseMs(grant.expiresAt);
    const observed = parseMs(grant.observedAt) ?? 0;
    if (expires != null && expires <= now) continue;
    if (!chosen || observed > (parseMs(chosen.observedAt) ?? 0)) chosen = grant;
  }
  return chosen;
}

export function derivePoolCondition(event, { remaining = null } = {}) {
  if (!event) return 'unknown';
  if (event.condition === 'recovered') return 'available';
  if (event.condition) return event.condition;
  if (remaining === 0) return 'exhausted';
  if (remaining == null) return 'unknown';
  return remaining > 0 ? 'available' : 'exhausted';
}

/**
 * Read pool state with freshness metadata. Normal lookups use cached events unless staleRead.
 */
export function readPoolState(
  ledger,
  { provider, accountId, pool, now = Date.now(), maxAgeMs = 3_600_000, staleRead = false }
) {
  const event = latestEventForPool(ledger, provider, accountId, pool);
  const plan = ledger.planSnapshots?.[`${provider}/${accountId}`] ?? null;
  const observedAt = event?.observedAt ?? null;
  const ageMs =
    observedAt == null ? null : Math.max(0, now - (parseMs(observedAt) ?? now));
  const fresh =
    ageMs == null ? false : staleRead ? true : ageMs <= maxAgeMs;

  const remainingValue =
    event?.remaining && Object.hasOwn(event.remaining, 'value')
      ? event.remaining.value
      : null;
  const condition = derivePoolCondition(event, { remaining: remainingValue });

  return {
    provider,
    accountId,
    pool,
    condition,
    remaining:
      event?.remaining && Object.hasOwn(event.remaining, 'value')
        ? {
            unit: event.remaining.unit ?? 'unknown',
            value: event.remaining.value,
          }
        : null,
    plan: plan?.tier ?? event?.plan?.tier ?? null,
    limitScope: event?.limitScope ?? null,
    resetsAt: event?.resetsAt ?? null,
    resetTimezone: event?.resetTimezone ?? null,
    observedAt,
    freshness: {
      status: observedAt == null ? 'unknown' : fresh ? 'fresh' : 'stale',
      ageMs,
      source: event?.source?.channel ?? null,
      staleRead: Boolean(staleRead),
    },
    grant: activeGrant(ledger, provider, accountId, pool, now),
    latestEventIdempotencyKey: event?.idempotencyKey ?? null,
  };
}

export function scheduleBoundedReset(
  ledger,
  {
    provider,
    accountId,
    pool,
    dueAt,
    jobId,
    attemptId,
    owner,
    now = Date.now(),
  }
) {
  const base = ledger?.schema === LEDGER_SCHEMA ? ledger : createEmptyLedger();
  const dueMs = typeof dueAt === 'number' ? dueAt : parseMs(dueAt);
  if (dueMs == null) throw new Error('dueAt required');
  const id = `${provider}:${accountId}:${pool}:${jobId}:${attemptId}`;
  const row = {
    schema: SCHEDULED_RESET_SCHEMA,
    id,
    provider,
    accountId,
    pool,
    dueAt: new Date(dueMs).toISOString(),
    jobId,
    attemptId,
    owner,
    status: 'scheduled',
    scheduledAt: new Date(now).toISOString(),
  };
  const next = structuredClone(base);
  const prior = (next.scheduledResets ?? []).filter(r => r.id !== id);
  next.scheduledResets = [...prior, row].sort(
    (a, b) => (parseMs(a.dueAt) ?? 0) - (parseMs(b.dueAt) ?? 0)
  );
  return next;
}

function invalidateSupersededResets(ledger, event, now) {
  const resetsAt = parseMs(event.resetsAt);
  if (resetsAt == null) return;
  for (const row of ledger.scheduledResets ?? []) {
    if (
      row.provider === event.provider &&
      row.accountId === event.accountId &&
      row.pool === event.pool &&
      row.status === 'scheduled'
    ) {
      const due = parseMs(row.dueAt);
      if (due != null && due < resetsAt) {
        row.status = 'superseded';
        row.supersededAt = new Date(now).toISOString();
        row.supersededBy = event.idempotencyKey;
      }
    }
  }
}

export function beginRefresh(ledger, key, { now = Date.now(), ttlMs = 30_000 } = {}) {
  const base = ledger?.schema === LEDGER_SCHEMA ? ledger : createEmptyLedger();
  const inflight = base.refreshInFlight?.[key];
  if (inflight && now - inflight.startedAtMs < ttlMs) {
    return { ledger: base, coalesced: true, started: false };
  }
  const next = structuredClone(base);
  next.refreshInFlight = {
    ...next.refreshInFlight,
    [key]: { startedAtMs: now, owner: 'refresh' },
  };
  return { ledger: next, coalesced: false, started: true };
}

export function endRefresh(ledger, key, { error = null, now = Date.now() } = {}) {
  const base = ledger?.schema === LEDGER_SCHEMA ? ledger : createEmptyLedger();
  const next = structuredClone(base);
  const inflight = { ...(next.refreshInFlight ?? {}) };
  delete inflight[key];
  next.refreshInFlight = inflight;
  if (error) {
    next.refreshBackoff = {
      ...(next.refreshBackoff ?? {}),
      [key]: { untilMs: now + Math.min(300_000, 15_000 * 2), lastError: String(error) },
    };
  }
  return next;
}

export function refreshAllowed(ledger, key, now = Date.now()) {
  const backoff = ledger?.refreshBackoff?.[key];
  if (!backoff) return true;
  return now >= (backoff.untilMs ?? 0);
}

/**
 * After a scheduled reset fires, verify capacity with authorized account evidence.
 * `pong` (connectivity only) never restores eligibility.
 */
export function evaluateRecovery({
  signal,
  provider,
  accountId,
  pool,
  before,
  after,
  authorizedAccountId,
}) {
  if (signal === 'pong') {
    return { recovered: false, reason: 'pong-not-capacity-proof' };
  }
  if (authorizedAccountId !== accountId) {
    return { recovered: false, reason: 'wrong-account' };
  }
  if (after?.authFailure) {
    return { recovered: false, reason: 'auth-failure' };
  }
  if (provider !== after?.provider || pool !== after?.pool) {
    return { recovered: false, reason: 'scope-mismatch' };
  }
  const remaining = after?.remaining?.value ?? null;
  if (remaining === 0) {
    return { recovered: false, reason: 'still-exhausted' };
  }
  if (remaining == null) {
    return { recovered: false, reason: 'unknown-remaining' };
  }
  const beforeRemaining = before?.remaining?.value ?? null;
  if (
    beforeRemaining != null &&
    remaining <= beforeRemaining &&
    after?.condition !== 'available'
  ) {
    return { recovered: false, reason: 'no-improvement' };
  }
  if (after.condition === 'auth_mismatch') {
    return { recovered: false, reason: 'auth-mismatch' };
  }
  if (after.condition === 'exhausted' || after.condition === 'outage') {
    return { recovered: false, reason: 'still-blocked' };
  }
  return { recovered: true, reason: 'verified-readback' };
}

/** Read-only Fleet/Ovie projection: no email, no raw receipts. */
export function projectOvieUsagePools(ledger, { now = Date.now() } = {}) {
  const keys = new Set();
  for (const event of ledger?.events ?? []) {
    keys.add(`${event.provider}\0${event.accountId}\0${event.pool}`);
  }
  const pools = [];
  for (const key of keys) {
    const [provider, accountId, pool] = key.split('\0');
    const state = readPoolState(ledger, { provider, accountId, pool, now });
    pools.push({
      provider,
      accountId,
      pool,
      condition: state.condition,
      remaining: state.remaining?.value ?? null,
      plan: state.plan,
      limitScope: state.limitScope,
      resetsAt: state.resetsAt,
      observedAt: state.observedAt,
      freshness: state.freshness.status,
      source: state.freshness.source,
    });
  }
  pools.sort((a, b) =>
    `${a.provider}:${a.accountId}:${a.pool}`.localeCompare(
      `${b.provider}:${b.accountId}:${b.pool}`
    )
  );
  return {
    schema: 'jovie.usage-ledger-ovie-projection/v1',
    generatedAt: new Date(now).toISOString(),
    pools,
    controls: 'read-only',
    sourceLedger: LEDGER_SCHEMA,
  };
}