export const HANDOFF_SCHEMA = 'jovie-rolling-ci-handoff/v1';
export const LEARNING_SCHEMA = 'jovie-rolling-ci-learning/v1';
const SHA_RE = /^[0-9a-f]{40}$/i;

function decodeMarker(body, name) {
  const match = String(body ?? '').match(
    new RegExp(`<!-- ${name}:([A-Za-z0-9+/=_-]+) -->`)
  );
  if (!match) return null;
  try {
    return JSON.parse(Buffer.from(match[1], 'base64url').toString());
  } catch {
    return null;
  }
}

export function receiptMarker(name, receipt) {
  return `<!-- ${name}:${Buffer.from(JSON.stringify(receipt)).toString('base64url')} -->`;
}

export function parseHandoffReceipt(body) {
  return decodeMarker(body, 'jovie-rolling-ci-handoff');
}

export function parseLearningReceipt(body) {
  return decodeMarker(body, 'jovie-rolling-ci-learning');
}

export function validateHandoffReceipt(receipt, { liveHead, now } = {}) {
  const errors = [];
  if (receipt?.schema !== HANDOFF_SCHEMA) errors.push('invalid handoff schema');
  if (!Number.isInteger(receipt?.pr) || receipt.pr < 1)
    errors.push('invalid PR');
  if (!SHA_RE.test(String(receipt?.head ?? '')))
    errors.push('invalid handoff head');
  if (liveHead && receipt?.head !== liveHead) errors.push('stale handoff head');
  if (!['active', 'handed-off', 'abandoned'].includes(receipt?.status)) {
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
  if (!receipt?.remediationOwner) errors.push('remediationOwner is required');
  if (
    receipt?.status === 'active' &&
    (!receipt.leaseExpiresAt ||
      Date.parse(receipt.leaseExpiresAt) <= Date.parse(now ?? new Date()))
  ) {
    errors.push('implementer lease is expired');
  }
  return { ok: errors.length === 0, errors };
}

export function resolveRemediationRoute({
  receipt,
  liveHead,
  implementer,
  fxAdapter,
  now,
}) {
  if (!receipt) return { route: 'implementer', writer: implementer };
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
  if (!fxAdapter?.name || fxAdapter.authConfigured !== true) {
    return {
      route: 'configuration_incident',
      writer: null,
      incident: {
        type: 'fx_auth_missing',
        owner: 'CI Platform',
        remedy: 'configure the declared FX adapter authentication',
      },
    };
  }
  return { route: 'fx', writer: fxAdapter.name };
}

export function validateLearningReceipt(receipt, { liveHead } = {}) {
  const errors = [];
  if (receipt?.schema !== LEARNING_SCHEMA)
    errors.push('invalid learning schema');
  if (!SHA_RE.test(String(receipt?.head ?? '')))
    errors.push('invalid learning head');
  if (liveHead && receipt?.head !== liveHead)
    errors.push('stale learning head');
  for (const field of [
    'rootCauseClass',
    'currentHeadReproduction',
    'minimalRepair',
    'equivalentSurfaceSweep',
    'deliberateRedFixture',
  ]) {
    if (!String(receipt?.[field] ?? '').trim())
      errors.push(`${field} is required`);
  }
  if (!['product', 'environment', 'one-off'].includes(receipt?.failureClass)) {
    errors.push('invalid failure class');
  }
  const guard = receipt?.guardrail;
  if (guard?.warranted === true) {
    if (receipt.failureClass !== 'product') {
      errors.push(
        'environment and one-off failures cannot create product guardrails'
      );
    }
    if (!['same-pr', 'linked-follow-up'].includes(guard.delivery)) {
      errors.push('guardrail delivery must be same-pr or linked-follow-up');
    }
    if (!guard.testFailsBefore || !guard.testPassesAfter) {
      errors.push('guardrail requires before-and-after deliberate-red proof');
    }
    if (guard.delivery === 'linked-follow-up' && !guard.issue) {
      errors.push('linked guardrail follow-up requires an owned issue');
    }
  }
  if (receipt?.exactHeadGreen !== true) errors.push('exact head is not green');
  return { ok: errors.length === 0, errors };
}

export function rollingCiLoopComplete({ receipt, liveHead }) {
  return validateLearningReceipt(receipt, { liveHead }).ok;
}
