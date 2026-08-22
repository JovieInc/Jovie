export const HANDOFF_SCHEMA = 'jovie-rolling-ci-handoff/v1';
export const HANDOFF_MARKER = 'jovie-rolling-ci-handoff';
export const WRITER_CLAIM_SCHEMA = 'jovie-rolling-ci-writer-claim/v1';
export const FX_ADAPTER_NAME = 'fx';
export const FX_HANDOFF_FAILURE = 'ci-failed-after-handoff';
export const FX_AUTH_MISSING_FAILURE = 'fx-auth-missing';

export const FX_BACKSTOP_FAILURES = Object.freeze({
  [FX_HANDOFF_FAILURE]: {
    owner: 'fx',
    action: 'repair-current-pr-exact-head',
  },
  [FX_AUTH_MISSING_FAILURE]: {
    owner: 'gem',
    action: 'restore-fx-adapter-authentication',
  },
});

const SHA_RE = /^[0-9a-f]{40}$/i;
const HANDOFF_STATUSES = new Set(['active', 'handed-off', 'abandoned']);

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeSha(value) {
  return SHA_RE.test(String(value ?? '')) ? String(value).toLowerCase() : null;
}

function decodeMarker(body, name) {
  const match = String(body ?? '').match(
    new RegExp(`<!-- ${name}:([A-Za-z0-9_-]+) -->`)
  );
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function receiptMarker(name, receipt) {
  return `<!-- ${name}:${Buffer.from(JSON.stringify(receipt)).toString('base64url')} -->`;
}

export function parseHandoffReceipt(body) {
  return decodeMarker(body, HANDOFF_MARKER);
}

export function resolveFxAdapter(adapter) {
  const name = nonEmpty(adapter?.name) ? adapter.name.trim() : null;
  return {
    name,
    authConfigured: adapter?.authConfigured === true,
  };
}

export function fxConfigurationIncident() {
  return {
    type: 'fx_auth_missing',
    owner: 'CI Platform',
    failure: FX_AUTH_MISSING_FAILURE,
    remedy: 'configure the declared FX adapter authentication',
  };
}

/**
 * @param {object} [options]
 * @param {string} [options.liveHead]
 * @param {string} [options.now]
 */
export function validateHandoffReceipt(receipt, options = {}) {
  const liveHead = options.liveHead;
  const now = options.now;
  const errors = [];
  if (receipt?.schema !== HANDOFF_SCHEMA) errors.push('invalid handoff schema');
  if (!Number.isInteger(receipt?.pr) || receipt.pr < 1)
    errors.push('invalid PR');
  if (!SHA_RE.test(String(receipt?.head ?? '')))
    errors.push('invalid handoff head');
  const live = normalizeSha(liveHead);
  if (live && normalizeSha(receipt?.head) !== live)
    errors.push('stale handoff head');
  if (!HANDOFF_STATUSES.has(receipt?.status)) {
    errors.push('invalid handoff status');
  }
  for (const field of [
    'acceptanceCriteria',
    'remainingChecks',
    'failureFingerprints',
  ]) {
    if (!Array.isArray(receipt?.[field]))
      errors.push(`${field} must be an array`);
  }
  if (!nonEmpty(receipt?.remediationOwner))
    errors.push('remediationOwner is required');
  if (
    receipt?.status === 'active' &&
    (!receipt.leaseExpiresAt ||
      Date.parse(receipt.leaseExpiresAt) <=
        Date.parse(now ?? new Date().toISOString()))
  ) {
    errors.push('implementer lease is expired');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * @param {object} input
 * @param {object} [input.receipt]
 * @param {string} [input.liveHead]
 * @param {string} [input.implementer]
 * @param {{ name?: string, authConfigured?: boolean }} [input.fxAdapter]
 * @param {string} [input.now]
 */
export function resolveRemediationRoute({
  receipt = null,
  liveHead,
  implementer,
  fxAdapter = null,
  now,
} = {}) {
  if (!receipt) {
    return { route: 'implementer', writer: implementer };
  }

  const validation = validateHandoffReceipt(receipt, { liveHead, now });
  const leaseExpired = validation.errors.includes(
    'implementer lease is expired'
  );
  const hardErrors = validation.errors.filter(
    error => error !== 'implementer lease is expired'
  );
  if (hardErrors.length) {
    return {
      route: 'reject_invalid_handoff',
      writer: null,
      errors: hardErrors,
    };
  }

  if (receipt.status === 'active' && !leaseExpired) {
    return {
      route: 'implementer',
      writer: receipt.remediationOwner || implementer,
    };
  }

  const adapter = resolveFxAdapter(fxAdapter);
  if (!adapter.name || adapter.authConfigured !== true) {
    return {
      route: 'configuration_incident',
      writer: null,
      incident: fxConfigurationIncident(),
    };
  }

  return {
    route: 'fx',
    writer: adapter.name,
    failure: FX_HANDOFF_FAILURE,
  };
}

/**
 * A live implementer lease is an unexpired `active` handoff receipt on the
 * exact current head. Missing, expired, handed-off, abandoned, or stale
 * receipts are not live.
 * @param {object|null} [receipt]
 * @param {{ liveHead?: string, now?: string }} [options]
 */
export function isImplementerLeaseLive(receipt, options = {}) {
  if (!receipt) return false;
  const validation = validateHandoffReceipt(receipt, options);
  const leaseExpired = validation.errors.includes(
    'implementer lease is expired'
  );
  const hardErrors = validation.errors.filter(
    error => error !== 'implementer lease is expired'
  );
  return (
    hardErrors.length === 0 && receipt.status === 'active' && !leaseExpired
  );
}

/**
 * Webhook backstop: launch FX when the implementer lease is not live.
 * Pickup-end routing still requires an explicit handoff receipt.
 * @param {object} [input]
 */
export function resolveWebhookFxRoute({
  receipt = null,
  liveHead,
  implementer,
  fxAdapter = null,
  now,
} = {}) {
  if (isImplementerLeaseLive(receipt, { liveHead, now })) {
    return {
      route: 'implementer',
      writer: receipt.remediationOwner || implementer,
      launch: false,
    };
  }

  const adapter = resolveFxAdapter(fxAdapter);
  if (!adapter.name || adapter.authConfigured !== true) {
    return {
      route: 'configuration_incident',
      writer: null,
      launch: false,
      incident: fxConfigurationIncident(),
    };
  }

  return {
    route: 'fx',
    writer: adapter.name,
    launch: true,
    failure: FX_HANDOFF_FAILURE,
  };
}

export function writerClaimKey({ repository, pr, head, fingerprint }) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(String(repository ?? ''))) {
    throw new Error('repository must be owner/name');
  }
  if (!Number.isInteger(pr) || pr < 1) {
    throw new Error('pr must be a positive integer');
  }
  const normalizedHead = normalizeSha(head);
  if (!normalizedHead) throw new Error('head must be a 40-character SHA');
  if (!nonEmpty(fingerprint)) throw new Error('fingerprint is required');
  return `${repository}:pr-${pr}:${normalizedHead}:${fingerprint}`;
}

function createWriterClaim({ writer, identity, liveHead }) {
  const head = normalizeSha(liveHead) ?? normalizeSha(identity.head);
  return {
    schema: WRITER_CLAIM_SCHEMA,
    status: 'active',
    writer,
    key: writerClaimKey({ ...identity, head }),
    repository: identity.repository,
    pr: identity.pr,
    head,
    fingerprint: identity.fingerprint,
  };
}

/**
 * @param {object} input
 * @param {object} [input.existingClaim]
 * @param {string} input.writer
 * @param {{ repository: string, pr: number, head: string, fingerprint: string }} input.identity
 * @param {string} input.liveHead
 */
export function claimSingleWriter({
  existingClaim = null,
  writer,
  identity,
  liveHead,
}) {
  if (!nonEmpty(writer)) throw new Error('writer is required');
  const live = normalizeSha(liveHead);
  if (!live) throw new Error('liveHead must be a 40-character SHA');

  if (existingClaim?.head && existingClaim.head !== live) {
    return {
      action: 'supersede_stale_head',
      claim: createWriterClaim({ writer, identity, liveHead: live }),
    };
  }

  if (
    existingClaim?.status === 'active' &&
    existingClaim.head === live &&
    existingClaim.writer !== writer
  ) {
    return {
      action: 'reject_competing_writer',
      claim: existingClaim,
      writer: existingClaim.writer,
    };
  }

  return {
    action: 'claim',
    claim: createWriterClaim({ writer, identity, liveHead: live }),
  };
}

/**
 * @param {object} input
 * @param {'new-commit' | 'green-rerun'} input.reason
 * @param {string} [input.liveHead]
 * @param {object} [input.claim]
 */
export function supersedeOwnership({ reason, liveHead, claim = null }) {
  if (reason === 'green-rerun') {
    return { action: 'supersede_repairs_green', claim: null };
  }
  if (reason === 'new-commit') {
    const live = normalizeSha(liveHead);
    if (!live) throw new Error('liveHead must be a 40-character SHA');
    if (!claim || claim.head !== live) {
      return { action: 'supersede_stale_head', claim: null };
    }
  }
  return { action: 'keep', claim: claim ?? null };
}

export function fxBackstopRoute(owner) {
  if (owner === 'fx') return 'gem-to-fx';
  if (owner === 'symphony') return 'gem-to-symphony';
  return 'gem-local';
}
