import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const IDEA_RADAR_SCHEMA = 'jovie.idea-radar-producer/v1';
export const EVIDENCE_SCHEMA = 'jovie.canonical-evidence/v1';

const MATERIAL_EVENT_CLASSES = new Set([
  'source-item-new-or-changed',
  'research-invoked-for-decision',
  'founder-or-customer-observation',
  'internal-capability-or-outcome-changed',
]);

const REQUIRED_TEXT = [
  'problemOpportunity',
  'affectedUser',
  'affectedCapability',
  'sourceUrl',
  'sourceType',
  'observedAt',
  'accessConstraints',
  'freshness',
  'evidenceQuality',
  'initialDemandEvidence',
  'uncertainty',
  'cheapestValidationAction',
  'capacityClass',
  'revenuePathConflict',
];

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be non-empty text`);
  }
  return value.trim();
}

function canonicalUrl(value) {
  const url = new URL(requireText(value, 'sourceUrl'));
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|ref$|source$)/iu.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

function canonicalTimestamp(value, field) {
  const parsed = new Date(requireText(value, field));
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`${field} must be ISO-8601`);
  return parsed.toISOString();
}

function stableKey(input) {
  if (input.sourceItemId) {
    return `${input.sourceType.trim().toLowerCase()}:${input.sourceItemId.trim().toLowerCase()}`;
  }
  return canonicalUrl(input.sourceUrl).toLowerCase();
}

export function normalizeObservation(input) {
  if (!input || typeof input !== 'object')
    throw new Error('observation must be an object');
  for (const field of REQUIRED_TEXT) requireText(input[field], field);
  if (
    !Number.isFinite(input.engagementQuality) ||
    input.engagementQuality < 0 ||
    input.engagementQuality > 1
  ) {
    throw new Error('engagementQuality must be between 0 and 1');
  }

  const dedupeKey = stableKey(input);
  const identity = `evidence:${createHash('sha256').update(dedupeKey).digest('hex').slice(0, 24)}`;
  return {
    schema: EVIDENCE_SCHEMA,
    id: identity,
    stableIdentity: identity,
    dedupeKey,
    supersedes: input.supersedes ?? null,
    problemOpportunity: input.problemOpportunity.trim(),
    affectedUser: input.affectedUser.trim(),
    affectedCapability: input.affectedCapability.trim(),
    provenance: {
      sourceUrl: canonicalUrl(input.sourceUrl),
      sourceType: input.sourceType.trim(),
      sourceItemId: input.sourceItemId?.trim() ?? null,
      observedAt: canonicalTimestamp(input.observedAt, 'observedAt'),
      accessConstraints: input.accessConstraints.trim(),
    },
    freshness: input.freshness.trim(),
    engagementQuality: input.engagementQuality,
    evidenceQuality: input.evidenceQuality.trim(),
    corroboration: [...new Set(input.corroboration ?? [])],
    novelty: input.novelty ?? { comparedWith: [], summary: 'unknown' },
    initialDemandEvidence: input.initialDemandEvidence.trim(),
    uncertainty: input.uncertainty.trim(),
    cheapestValidationAction: input.cheapestValidationAction.trim(),
    capacityClass: input.capacityClass.trim(),
    revenuePathConflict: input.revenuePathConflict.trim(),
    hypothesisWeight: Number.isFinite(input.hypothesisWeight)
      ? input.hypothesisWeight
      : 0,
  };
}

export function convergeEvidence(existing, incoming) {
  if (existing.dedupeKey !== incoming.dedupeKey)
    throw new Error('cannot converge different dedupe keys');
  const newer =
    Date.parse(incoming.provenance.observedAt) >=
    Date.parse(existing.provenance.observedAt)
      ? incoming
      : existing;
  return {
    ...newer,
    id: existing.id,
    stableIdentity: existing.stableIdentity,
    corroboration: [
      ...new Set([...existing.corroboration, ...incoming.corroboration]),
    ],
    hypothesisWeight: Math.max(
      existing.hypothesisWeight,
      incoming.hypothesisWeight
    ),
  };
}

export function classifyDiscoveryEvent(event, policy) {
  if (event.class === 'clock-fired')
    return { disposition: 'reject', reason: 'clock-is-not-primary-discovery' };
  if (event.class === 'missed-event-catch-up') {
    return policy.catchUp.enabled && event.missedEventEvidence === true
      ? { disposition: 'catch-up' }
      : {
          disposition: 'reject',
          reason: 'catch-up-requires-missed-event-evidence',
        };
  }
  if (MATERIAL_EVENT_CLASSES.has(event.class))
    return { disposition: 'process-now' };
  if (
    event.semanticSignature &&
    Number.isFinite(event.expectedInformationValue)
  ) {
    return event.expectedInformationValue >= policy.lowSignalThreshold
      ? { disposition: 'process-now' }
      : { disposition: 'accumulate' };
  }
  return {
    disposition: 'reject',
    reason: 'no-material-event-or-threshold-signal',
  };
}

export function routeEvidence(evidence, context = {}) {
  if (context.founderJudgment === true)
    return {
      destination: 'ovi-certification-inbox',
      createsLinearIssue: false,
    };
  if (context.executableNextAction === true)
    return { destination: 'linear', createsLinearIssue: true };
  if (context.benchmarkRequired === true)
    return { destination: 'JOV-2966', createsLinearIssue: false };
  return {
    destination: 'canonical-evidence-lifecycle',
    createsLinearIssue: false,
  };
}

export function applyFounderFeedback(evidence, feedback) {
  const delta = feedback === 'up' ? 1 : feedback === 'down' ? -1 : 0;
  return {
    ...evidence,
    hypothesisWeight: evidence.hypothesisWeight + delta,
    founderTasteEvidence: feedback,
    admissionAuthorized: false,
    requiredNextGate: evidence.cheapestValidationAction,
  };
}

export function calibrateJudgment(judgment, outcome) {
  const predictedPositive = judgment === 'GO' || judgment === 'MAYBE';
  const realizedPositive =
    outcome.paidBehavior === true || outcome.realizedValue === true;
  return {
    predictedPositive,
    realizedPositive,
    correct: predictedPositive === realizedPositive,
    customerDemand: outcome.paidBehavior === true,
    founderTaste: outcome.founderTaste ?? null,
  };
}

export function loadRegistry() {
  return JSON.parse(
    readFileSync(new URL('./idea-radar-registry.json', import.meta.url), 'utf8')
  );
}

export function validateRegistry(registry) {
  if (registry?.schema !== IDEA_RADAR_SCHEMA)
    throw new Error(`schema must be ${IDEA_RADAR_SCHEMA}`);
  if (registry.canonicalLifecycle !== 'JOV-5916')
    throw new Error('canonical lifecycle must be JOV-5916');
  if (registry.separateLedger !== false)
    throw new Error('Idea Radar must not own a separate ledger');
  if (registry.primaryDiscovery !== 'event-driven')
    throw new Error('primary discovery must be event-driven');
  if (registry.hermesAuthority !== false || registry.slackAuthority !== false)
    throw new Error('Hermes and Slack authority must be disabled');
  if (registry.founderVoteCanAdmitBuild !== false)
    throw new Error('founder vote cannot admit build');
  if (registry.linearPolicy !== 'executable-next-action-only')
    throw new Error('Linear must be executable-next-action-only');
  for (const source of registry.legacyMigration.sources) {
    requireText(source.from, 'legacyMigration.sources.from');
    requireText(source.to, 'legacyMigration.sources.to');
    if (source.dataLoss !== false)
      throw new Error('legacy migration must assert no data loss');
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validateRegistry(loadRegistry());
  process.stdout.write('idea-radar registry valid\n');
}
