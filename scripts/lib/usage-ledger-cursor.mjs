/**
 * Cursor provider adapters for the usage ledger (first slice).
 *
 * @typedef {{ accountId: string, observedAt?: string, now?: number }} CursorSnapshotMeta
 * @typedef {{
 *   accountId: string,
 *   pool?: string,
 *   transcript: string,
 *   observedAt?: string,
 *   plan?: object | null,
 *   limitScope?: string,
 *   resetTimezone?: string,
 *   remaining?: number | null,
 *   providerEventId?: string | null,
 * }} CursorQuotaInput
 */

import { createHash } from 'node:crypto';
import {
  appendUsageEvent,
  EVENT_SCHEMA,
  PLAN_SCHEMA,
  recordPlanSnapshot,
  sanitizeReceipt,
} from './usage-ledger.mjs';

const USAGE_EXHAUSTED =
  /(?:you(?:'re| are) out of usage|usage limit|included usage.*(?:exhausted|depleted))/i;
const THROTTLE = /(?:rate limit|too many requests|\b429\b)/i;
const OUTAGE = /(?:service unavailable|\b503\b|temporarily unavailable)/i;
const AUTH =
  /(?:not logged in|login required|unauthori[zed]|invalid.*credential)/i;

const RESET_IN = /try again in\s+((?:\d+\s*(?:hours?|minutes?|mins?))+)/i;
const RESET_AT = /resets?\s+(?:at|on)\s+([0-9T:\-+Z. ]+)/i;

export const CURSOR_PROVIDER = 'cursor';
export const DEFAULT_CURSOR_POOL = 'included-auto';

function toIsoSeconds(ms) {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

export function parseResetPhrase(text, nowMs) {
  const inMatch = RESET_IN.exec(text);
  if (inMatch) {
    let seconds = 0;
    for (const [, amount, unit] of inMatch[1].matchAll(
      /(\d+)\s*(hours?|minutes?|mins?)/gi
    )) {
      seconds +=
        Number(amount) * (unit.toLowerCase().startsWith('h') ? 3600 : 60);
    }
    return seconds ? toIsoSeconds(nowMs + seconds * 1000) : null;
  }
  const atMatch = RESET_AT.exec(text);
  if (!atMatch) return null;
  const raw = atMatch[1].trim();
  const ms = Date.parse(raw.includes('T') ? raw : `${raw}Z`);
  return Number.isNaN(ms) ? null : toIsoSeconds(ms);
}

export function classifyCursorTranscript(text) {
  if (AUTH.test(text)) return 'auth_mismatch';
  if (OUTAGE.test(text)) return 'outage';
  if (USAGE_EXHAUSTED.test(text)) return 'exhausted';
  if (THROTTLE.test(text)) return 'throttling';
  return 'unknown';
}

export function cursorProviderEventId(text, observedAt) {
  return createHash('sha256')
    .update(`${observedAt}\0${text.slice(0, 512)}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Build a sanitized usage-limit event from Cursor CLI stderr/stdout (fixture-safe).
 */
export function cursorQuotaEventFromTranscript(
  {
    accountId,
    pool = DEFAULT_CURSOR_POOL,
    transcript,
    observedAt,
    plan = null,
    limitScope = 'included-usage',
    resetTimezone = 'UTC',
    remaining = null,
    providerEventId = null,
  },
  { now = Date.now() } = {}
) {
  const observed = observedAt ?? new Date(now).toISOString();
  const condition = classifyCursorTranscript(transcript);
  const resetsAt = parseResetPhrase(transcript, Date.parse(observed));
  const id = providerEventId ?? cursorProviderEventId(transcript, observed);
  return {
    schema: EVENT_SCHEMA,
    provider: CURSOR_PROVIDER,
    accountId,
    pool,
    providerEventId: id,
    condition,
    limitScope,
    plan,
    remaining:
      remaining == null
        ? { unit: 'percent', value: null }
        : { unit: 'percent', value: remaining },
    observedAt: observed,
    resetsAt,
    resetTimezone,
    source: {
      channel: 'cursor-cli',
      reconciliation: 'terminal',
      receipt: sanitizeReceipt({ transcript }),
    },
  };
}

/**
 * @param {Record<string, unknown>} payload
 * @param {CursorSnapshotMeta} [meta]
 */
export function cursorPlanSnapshotFromAbout(
  payload,
  { accountId, observedAt, now = Date.now() } = /** @type {CursorSnapshotMeta} */ ({})
) {
  const observed =
    observedAt ?? payload?.observedAt ?? new Date(now).toISOString();
  return {
    schema: PLAN_SCHEMA,
    provider: CURSOR_PROVIDER,
    accountId,
    tier: payload?.membership ?? payload?.plan ?? 'unknown',
    pools: /** @type {Array<Record<string, unknown>>} */ (payload?.pools ?? []).map(row => ({
      id: row.id ?? DEFAULT_CURSOR_POOL,
      label: row.label ?? row.id,
      status: row.status ?? 'unknown',
    })),
    observedAt: observed,
    source: {
      channel: 'cursor-cli-about',
      receipt: sanitizeReceipt(
        payload?.receipt ?? { membership: payload?.membership }
      ),
    },
  };
}

export function ingestCursorQuotaEvent(ledger, transcript, meta, options = {}) {
  const event = cursorQuotaEventFromTranscript(
    {
      accountId: meta.accountId,
      pool: meta.pool ?? DEFAULT_CURSOR_POOL,
      transcript,
      observedAt: meta.observedAt,
      plan: meta.plan,
      limitScope: meta.limitScope,
      remaining: meta.remaining,
      providerEventId: meta.providerEventId,
    },
    options
  );
  return appendUsageEvent(ledger, event, options);
}

export function ingestCursorPlanSnapshot(ledger, payload, meta, options = {}) {
  const snapshot = cursorPlanSnapshotFromAbout(payload, { ...meta, ...options });
  return recordPlanSnapshot(ledger, snapshot);
}
