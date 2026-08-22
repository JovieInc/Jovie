import {
  resolveRemediationRoute,
  validateHandoffReceipt,
} from './rolling-ci-handoff.mjs';

export const TIMING_RECEIPT_SCHEMA = 'jovie-rolling-ci-timing/v1';
export const STALE_WORK_SCHEMA = 'jovie-rolling-ci-stale-work/v1';
export const PROMOTION_EVIDENCE = Object.freeze([
  'tests',
  'coverage',
  'security',
  'policy',
]);

const SHA_RE = /^[0-9a-f]{40}$/i;

function normalizeSha(value) {
  return SHA_RE.test(String(value ?? '')) ? String(value).toLowerCase() : null;
}

function isoTime(value) {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

/** @param {*} [input] */
export function timeToFirstCiReceipt({
  pr,
  head,
  publishedAt,
  firstCheckStartedAt,
} = {}) {
  const normalizedHead = normalizeSha(head);
  const published = isoTime(publishedAt);
  const firstCheck = isoTime(firstCheckStartedAt);
  if (!Number.isInteger(pr) || pr < 1) {
    throw new Error('pr must be a positive integer');
  }
  if (!normalizedHead) throw new Error('head must be a 40-character SHA');
  if (!published || !firstCheck) {
    throw new Error('publishedAt and firstCheckStartedAt must be timestamps');
  }
  return {
    schema: TIMING_RECEIPT_SCHEMA,
    pr,
    head: normalizedHead,
    publishedAt: published,
    firstCheckStartedAt: firstCheck,
    secondsToFirstCi: Math.max(
      0,
      Math.round((Date.parse(firstCheck) - Date.parse(published)) / 1000)
    ),
  };
}

/** @param {*} [input] */
export function staleWorkReceipt({
  pr,
  eventHead,
  liveHead,
  fingerprint,
  check = '',
} = {}) {
  const event = normalizeSha(eventHead);
  const live = normalizeSha(liveHead);
  if (!Number.isInteger(pr) || pr < 1) {
    throw new Error('pr must be a positive integer');
  }
  if (!event || !live) throw new Error('heads must be 40-character SHAs');
  if (!String(fingerprint ?? '').trim()) {
    throw new Error('fingerprint is required');
  }
  const stale = event !== live;
  return {
    schema: STALE_WORK_SCHEMA,
    pr,
    eventHead: event,
    liveHead: live,
    check,
    fingerprint,
    action: stale ? 'reject_stale_head' : 'revalidate_current_head',
    stale,
  };
}

/** @param {*} [input] */
export function evaluateReadyLanding({
  publishedHead,
  liveHead,
  rebased = false,
  checks = {},
} = {}) {
  const published = normalizeSha(publishedHead);
  const live = normalizeSha(liveHead);
  if (!published || !live) return { ok: false, reason: 'invalid-head' };
  if (published !== live) return { ok: false, reason: 'stale-head' };
  if (rebased !== true) return { ok: false, reason: 'not-rebased' };
  for (const name of PROMOTION_EVIDENCE) {
    if (checks[name] !== 'success') {
      return { ok: false, reason: `missing-${name}` };
    }
  }
  return { ok: true, reason: 'exact-head-qualified' };
}

/** @param {*} [input] */
export function evaluateImplementerPickupEnd({
  receipt = null,
  liveHead,
  implementer,
  fxAdapter = null,
  now,
} = {}) {
  if (!receipt) return { ok: false, action: 'require_handoff_receipt' };
  const validation = validateHandoffReceipt(receipt, { liveHead, now });
  if (!validation.ok) {
    return {
      ok: false,
      action: 'reject_invalid_handoff',
      errors: validation.errors,
    };
  }
  if (receipt.status === 'active') {
    return { ok: false, action: 'pickup_still_active' };
  }
  const route = resolveRemediationRoute({
    receipt,
    liveHead,
    implementer,
    fxAdapter,
    now,
  });
  return { ok: true, action: route.route, route };
}
