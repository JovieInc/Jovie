/**
 * Calibrated Jev shadow (JOV-6051).
 *
 * Advisory-only classifier for claim/evidence alignment. Jev is text-only and
 * never writes machine certification. Visual/pixel claims stay
 * needs-specialist. Shipping remains unblocked until calibration proves the
 * shadow; this module cannot flip `certified`.
 */

import { evidenceFingerprint } from './fingerprint.mjs';

export { evidenceFingerprint };

export const JEV_SHADOW_SCHEMA = 'jev-shadow/v1';
export const JEV_MODEL = 'typesafe-ai/jev';
export const GATEWAY_MODEL_ALLOWLIST = Object.freeze([
  'zai/glm-5.3',
  'zai/glm-5.3-flash',
  'typesafe-ai/jev',
]);
export const ALIGNMENT_CLASSES = Object.freeze([
  'supported',
  'contradicted',
  'insufficient',
  'needs-specialist',
]);
export const PIXEL_CLAIM_RE =
  /\b(pixels?|visual(?:[\s-]+(?:diff|qa|appearance|match))?|looks?\s+correct|screenshot bytes|image bytes|png bytes)\b/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function assertGatewayModel(model) {
  if (!GATEWAY_MODEL_ALLOWLIST.includes(model)) {
    throw new Error(`gateway model not allowlisted: ${String(model)}`);
  }
  return model;
}

export function isPixelOrVisualClaim(claim) {
  if (!isObject(claim)) return false;
  if (claim.kind === 'visual' || claim.kind === 'pixels') return true;
  return PIXEL_CLAIM_RE.test(String(claim.statement ?? ''));
}

function freezeCertifiedFalse(record) {
  Object.defineProperty(record, 'certified', {
    value: false,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  return Object.freeze(record);
}

function normalizeAlignment(value) {
  return ALIGNMENT_CLASSES.includes(value) ? value : 'insufficient';
}

/**
 * Classify claim/evidence alignment. The optional `evaluate` hook is the only
 * model transport; when it is unbound the shadow records insufficient rather
 * than inventing a Gateway route. Any `certified` field from the model is
 * discarded.
 *
 * @param {{
 *   claim?: object,
 *   evidence?: unknown,
 *   evaluate?: (input: { claim: object, evidence: unknown, model: string }) =>
 *     | {
 *         alignment?: string,
 *         certified?: unknown,
 *         reason?: string,
 *         then?: Function,
 *       }
 *     | null,
 *   model?: string,
 *   previousShadow?: object | null,
 * }} [input]
 */
export function classifyJevShadow({
  claim,
  evidence,
  evaluate,
  model = JEV_MODEL,
  previousShadow = null,
} = {}) {
  const resolvedModel = assertGatewayModel(model ?? JEV_MODEL);
  const fingerprint = evidenceFingerprint({ claim, evidence });
  const issues = [];

  if (
    isObject(previousShadow) &&
    previousShadow.schema === JEV_SHADOW_SCHEMA &&
    previousShadow.evidenceFingerprint === fingerprint
  ) {
    const locked = freezeCertifiedFalse({
      schema: JEV_SHADOW_SCHEMA,
      model: resolvedModel,
      shadow: true,
      blocking: false,
      alignment: normalizeAlignment(previousShadow.alignment),
      failureClass: normalizeAlignment(
        previousShadow.failureClass ?? previousShadow.alignment
      ),
      evidenceFingerprint: fingerprint,
      reason:
        previousShadow.reason ??
        'unchanged evidence cannot be retried for a better verdict',
      issues: Object.freeze([
        'unchanged evidence cannot be retried for a better verdict',
      ]),
    });
    return locked;
  }

  if (!isObject(claim) || !hasText(claim.statement)) {
    issues.push('shadow claim statement is missing');
  }

  let alignment = 'insufficient';
  let reason = 'jev transport not bound; calibration gap';

  if (isPixelOrVisualClaim(claim)) {
    alignment = 'needs-specialist';
    reason =
      'visual/pixel claims are text-inaccessible to Jev and stay needs-specialist';
  } else if (typeof evaluate === 'function') {
    try {
      const raw = evaluate({ claim, evidence, model: resolvedModel });
      if (raw && typeof raw.then === 'function') {
        // This synchronous classifier cannot use async advice, but owns its rejection.
        void Promise.resolve(raw).catch(() => {});
        alignment = 'insufficient';
        reason = 'async Jev transport is not bound in this shadow';
        issues.push(reason);
      } else if (!isObject(raw)) {
        alignment = 'insufficient';
        reason = 'jev evaluate returned no alignment';
        issues.push(reason);
      } else {
        alignment = normalizeAlignment(raw.alignment);
        reason =
          hasText(raw.reason) && alignment === raw.alignment
            ? raw.reason
            : alignment === 'insufficient' && raw.alignment !== 'insufficient'
              ? 'jev alignment was not one of the calibrated classes'
              : (raw.reason ?? `jev classified ${alignment}`);
        if (raw.certified === true) {
          issues.push('jev attempted to set certified; discarded');
        }
      }
    } catch {
      alignment = 'insufficient';
      reason = 'jev evaluator failed; advisory shadow unavailable';
      issues.push(reason);
    }
  } else {
    issues.push(reason);
  }

  if (!isObject(claim) || !hasText(claim.statement)) {
    alignment = alignment === 'needs-specialist' ? alignment : 'insufficient';
  }

  return freezeCertifiedFalse({
    schema: JEV_SHADOW_SCHEMA,
    model: resolvedModel,
    shadow: true,
    blocking: false,
    alignment,
    failureClass: alignment,
    evidenceFingerprint: fingerprint,
    reason,
    issues: Object.freeze(issues),
  });
}

/**
 * Merge advisory shadow onto a run outcome without touching harness certification.
 *
 * @param {object} outcome
 * @param {object | null} shadow
 */
export function attachJevShadow(outcome, shadow) {
  if (!isObject(outcome)) {
    throw new Error('run outcome is required before attaching Jev shadow');
  }
  const certified =
    outcome.certifier === 'harness' && outcome.certified === true;
  return Object.freeze({
    ...outcome,
    certified,
    certifier: certified ? 'harness' : (outcome.certifier ?? null),
    shadow: shadow ?? null,
  });
}
