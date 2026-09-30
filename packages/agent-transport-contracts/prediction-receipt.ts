export const PREDICTION_RECEIPT_SCHEMA =
  'jovie.prediction-outcome/prediction/v1' as const;

type Scope = { tenantId: string; scopeId: string; entityId: string };
export type DecisionPredictionReceipt = Record<string, unknown> & {
  schema: typeof PREDICTION_RECEIPT_SCHEMA;
  predictionId: string;
  identity: Scope & { experimentId: string | null };
  links: { commitRef: string | null };
  decisionAt: string;
  temporalClass: 'prospective' | 'retrospective';
  input: { freshness: 'fresh' | 'stale' | 'unknown' };
  target: { horizonEndsAt: string };
};

// biome-ignore format: compact dependency-free validation primitives keep Eve source-loadable.
const validate = {
  object(value: unknown, keys: readonly string[], label: string) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`); const row = value as Record<string, unknown>; if (Object.keys(row).length !== keys.length || keys.some(key => !(key in row))) throw new Error(`${label} fields are invalid`); return row; },
  text(value: unknown, label: string, nullable = false) { if (nullable && value === null) return null; if (typeof value !== 'string' || !value.trim() || value.length > 600) throw new Error(`${label} must be a bounded string`); return value; },
  iso(value: unknown, label: string) { const result = validate.text(value, label); if (!result || !Number.isFinite(Date.parse(result))) throw new Error(`${label} must be an ISO timestamp`); return result; },
  finite(value: unknown, label: string) { if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`${label} must be finite or unknown`); },
  oneOf(value: unknown, choices: readonly string[], label: string) { if (typeof value !== 'string' || !choices.includes(value)) throw new Error(`${label} is invalid`); return value; },
  refs(value: unknown, label: string, minimum = 0) { if (!Array.isArray(value) || value.length < minimum || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 600)) throw new Error(`${label} references are invalid`); },
  containsSecret(value: unknown) { return /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk|ghp|lin_api)_[A-Za-z0-9_-]{12,}|["']?(?:secret|token|password|apiKey)["']?\s*[=:]\s*["']?\S+)/iu.test(JSON.stringify(value)); },
};

// biome-ignore format: validation follows the receipt in decision-time order.
export function parseDecisionPredictionReceipt(input: unknown): DecisionPredictionReceipt {
  const receipt = validate.object(input, ['schema', 'predictionId', 'identity', 'links', 'decisionAt', 'predictedAt', 'temporalClass', 'input', 'target', 'action', 'prediction', 'versions', 'disclosure', 'management'], 'prediction');
  if (receipt.schema !== PREDICTION_RECEIPT_SCHEMA) throw new Error('prediction schema is invalid');
  validate.text(receipt.predictionId, 'predictionId');
  const decided = Date.parse(validate.iso(receipt.decisionAt, 'decisionAt'));
  const predicted = Date.parse(validate.iso(receipt.predictedAt, 'predictedAt'));
  const temporal = validate.oneOf(receipt.temporalClass, ['prospective', 'retrospective'], 'temporalClass');
  const identity = validate.object(receipt.identity, ['decisionId', 'taskRunId', 'experimentId', 'variantId', 'tenantId', 'scopeId', 'entityId'], 'identity');
  for (const key of ['decisionId', 'tenantId', 'scopeId', 'entityId']) validate.text(identity[key], key);
  for (const key of ['taskRunId', 'experimentId', 'variantId']) validate.text(identity[key], key, true);
  const links = validate.object(receipt.links, ['issueRef', 'commitRef', 'deploymentRef', 'certificationRef'], 'links');
  for (const key of Object.keys(links)) validate.text(links[key], key, true);
  const snapshot = validate.object(receipt.input, ['snapshotRef', 'snapshotDigest', 'capturedAt', 'freshness', 'provenanceRefs'], 'input');
  validate.text(snapshot.snapshotRef, 'snapshotRef');
  if (!/^[a-f0-9]{64}$/u.test(validate.text(snapshot.snapshotDigest, 'snapshotDigest')!)) throw new Error('snapshot digest is invalid');
  const captured = Date.parse(validate.iso(snapshot.capturedAt, 'capturedAt'));
  validate.oneOf(snapshot.freshness, ['fresh', 'stale', 'unknown'], 'freshness'); validate.refs(snapshot.provenanceRefs, 'provenance', 1);
  const target = validate.object(receipt.target, ['stage', 'name', 'units', 'horizonEndsAt', 'baseline'], 'target');
  validate.oneOf(target.stage, ['engineering', 'customer', 'business'], 'target stage'); validate.text(target.name, 'target name'); validate.text(target.units, 'target units');
  validate.iso(target.horizonEndsAt, 'horizonEndsAt'); validate.finite(target.baseline, 'baseline');
  const action = validate.object(receipt.action, ['eligibleActionsRef', 'selectedAction', 'selectionMethod', 'selectionProbability'], 'action');
  validate.text(action.eligibleActionsRef, 'eligibleActionsRef'); validate.text(action.selectedAction, 'selectedAction');
  const method = validate.oneOf(action.selectionMethod, ['deterministic', 'randomized', 'historical-unknown'], 'selectionMethod'); validate.finite(action.selectionProbability, 'selectionProbability');
  if ((method === 'randomized') !== (action.selectionProbability !== null) || (typeof action.selectionProbability === 'number' && (action.selectionProbability <= 0 || action.selectionProbability > 1))) throw new Error('selection probability is invalid');
  const forecast = validate.object(receipt.prediction, ['expected', 'lower', 'upper', 'confidence'], 'forecast');
  if (typeof forecast.expected === 'string') validate.text(forecast.expected, 'expected'); else validate.finite(forecast.expected, 'expected');
  validate.finite(forecast.lower, 'lower'); validate.finite(forecast.upper, 'upper'); validate.oneOf(forecast.confidence, ['unknown', 'low', 'medium', 'high'], 'confidence');
  const versions = validate.object(receipt.versions, ['model', 'provider', 'prompt', 'policy', 'codeRevision', 'executionTupleRef'], 'versions');
  for (const key of Object.keys(versions)) validate.text(versions[key], key, true);
  if (versions.codeRevision !== null && !/^[a-f0-9]{40}$/u.test(versions.codeRevision as string)) throw new Error('exact revision is invalid');
  const disclosure = validate.object(receipt.disclosure, ['providerData', 'consent', 'consentRef', 'consentValidUntil'], 'disclosure');
  const providerData = validate.oneOf(disclosure.providerData, ['authorized', 'withheld'], 'providerData'); const consent = validate.oneOf(disclosure.consent, ['valid', 'not-required'], 'consent');
  validate.text(disclosure.consentRef, 'consentRef', true); const consentUntil = disclosure.consentValidUntil === null ? null : validate.iso(disclosure.consentValidUntil, 'consentValidUntil');
  const management = validate.object(receipt.management, ['strategyVersionRef', 'opportunityRef', 'alternativesRef', 'hypothesis', 'authorityRef', 'outcomeOwner', 'reviewAt'], 'management');
  for (const key of ['strategyVersionRef', 'opportunityRef']) validate.text(management[key], key, true);
  for (const key of ['alternativesRef', 'hypothesis', 'authorityRef', 'outcomeOwner']) validate.text(management[key], key);
  validate.iso(management.reviewAt, 'reviewAt');
  if (temporal === 'prospective' && (captured > predicted || predicted > decided)) throw new Error('prospective timing is invalid');
  if (providerData === 'withheld' && (versions.provider !== null || versions.model !== null)) throw new Error('provider disclosure is unauthorized');
  if ((providerData === 'authorized' && consent !== 'valid') || (consent === 'valid' && (!disclosure.consentRef || !consentUntil || Date.parse(consentUntil) < decided))) throw new Error('consent is missing or expired');
  if ((versions.codeRevision === null) !== (links.commitRef === null) || (versions.codeRevision && versions.codeRevision !== links.commitRef)) throw new Error('exact revision requires evidence');
  if (validate.containsSecret(receipt)) throw new Error('receipt contains secret material');
  return structuredClone(receipt) as DecisionPredictionReceipt;
}

export const DecisionPredictionReceiptSchema = {
  parse: parseDecisionPredictionReceipt,
} as const;
