import { createPrivateKey, sign as nodeSign } from 'node:crypto';
import { isIP } from 'node:net';

export const TRIAGE_ASSESSMENT_DOMAIN =
  'jovie.linear-triage-assessment-request/v1';

/** Byte-stable canonical JSON; Summer verifies the signed request with the same form. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
const ROUTE = '/summer/v1/symphony/triage-assessments';

/**
 * @typedef {{
 *   schema: 'summer.linear-triage-assessment/v1',
 *   issueIdentifier: string,
 *   issueId: string,
 *   deliveryId: string,
 *   linearUpdatedAt: string,
 *   decision: 'stale-event' | 'urgent-investigation-required' | 'existing-intake-reconcile',
 *   authorizesDispatch: false,
 *   acceptedInvestigation: false,
 *   assessment?: {
 *     schema: 'summer.jev-triage/v1', model: 'typesafe-ai/jev',
 *     status: 'decided' | 'ambiguous' | 'unavailable',
 *     destination: 'Todo' | 'Backlog' | null, priority: number | null,
 *     category: string, confidence: number, reason: string, assessmentKey: string,
 *   },
 * }} SummerTriageAssessmentReceipt
 */

export function validJevTriageAssessment(value) {
  return Boolean(
    value &&
      value.schema === 'summer.jev-triage/v1' &&
      value.model === 'typesafe-ai/jev' &&
      ['decided', 'ambiguous', 'unavailable'].includes(value.status) &&
      typeof value.category === 'string' &&
      value.category.length > 0 &&
      value.category.length <= 128 &&
      typeof value.reason === 'string' &&
      value.reason.length > 0 &&
      value.reason.length <= 2000 &&
      typeof value.assessmentKey === 'string' &&
      value.assessmentKey.length > 0 &&
      value.assessmentKey.length <= 200 &&
      typeof value.confidence === 'number' &&
      Number.isFinite(value.confidence) &&
      value.confidence >= 0 &&
      value.confidence <= 1 &&
      (value.status === 'decided'
        ? ['Todo', 'Backlog'].includes(value.destination) &&
          Number.isInteger(value.priority) &&
          value.priority >= 1 &&
          value.priority <= 4
        : value.destination === null && value.priority === null)
  );
}

export function summerAssessmentConfig(environment = process.env) {
  const origin = new URL(environment.SUMMER_BOTTLENECK_ORIGIN ?? '');
  if (
    origin.protocol !== 'https:' ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password ||
    origin.port ||
    origin.hostname === 'localhost' ||
    isIP(origin.hostname) !== 0
  )
    throw new Error('summer-triage-origin-invalid');
  const keyId = environment.SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_KEY_ID;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(keyId ?? ''))
    throw new Error('summer-triage-key-id-invalid');
  const privateKey = createPrivateKey(
    environment.SUMMER_BOTTLENECK_SYMPHONY_OUTCOME_SIGNING_PRIVATE_KEY ?? ''
  );
  if (privateKey.asymmetricKeyType !== 'ed25519')
    throw new Error('summer-triage-signing-key-invalid');
  return { origin: origin.origin, keyId, privateKey };
}

/** @returns {Promise<SummerTriageAssessmentReceipt>} */
export async function requestSummerAssessment(
  delivery,
  {
    environment = process.env,
    fetchImpl = globalThis.fetch,
    now = Date.now,
  } = {}
) {
  const config = summerAssessmentConfig(environment);
  const unsigned = {
    schema: TRIAGE_ASSESSMENT_DOMAIN,
    issueIdentifier: delivery.identifier,
    issueId: delivery.issueId,
    deliveryId: delivery.deliveryId,
    requestedAt: new Date(now()).toISOString(),
    signatureKeyId: config.keyId,
  };
  const signature = nodeSign(
    null,
    Buffer.from(`${TRIAGE_ASSESSMENT_DOMAIN}\0${canonical(unsigned)}`),
    config.privateKey
  ).toString('base64url');
  const response = await fetchImpl(`${config.origin}${ROUTE}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...unsigned, signature: `ed25519=${signature}` }),
    signal: AbortSignal.timeout(10_000),
    redirect: 'error',
  });
  if (!response.ok)
    throw new Error(`summer-triage-assessment-http-${response.status}`);
  const receipt = /** @type {SummerTriageAssessmentReceipt} */ (
    await response.json()
  );
  if (
    receipt?.schema !== 'summer.linear-triage-assessment/v1' ||
    receipt.issueIdentifier !== delivery.identifier ||
    receipt.issueId !== delivery.issueId ||
    receipt.deliveryId !== delivery.deliveryId ||
    typeof receipt.linearUpdatedAt !== 'string' ||
    !Number.isFinite(Date.parse(receipt.linearUpdatedAt)) ||
    receipt.authorizesDispatch !== false ||
    receipt.acceptedInvestigation !== false ||
    (receipt.assessment !== undefined &&
      !validJevTriageAssessment(receipt.assessment)) ||
    ![
      'stale-event',
      'urgent-investigation-required',
      'existing-intake-reconcile',
    ].includes(receipt.decision)
  )
    throw new Error('summer-triage-assessment-invalid');
  return receipt;
}
