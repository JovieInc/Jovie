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

/**
 * Optional, append-only content on the existing canonical evidence object.
 * Delivery time remains provenance.observedAt; sourceTimestamp belongs to the source.
 * @typedef {Readonly<{id: string, kind: 'original-source', intent: 'exploratory',
 * text: string, author: string, sourceTimestamp: string, supersedes: string | null,
 * provenance: Readonly<{sourceUrl: string, sourceType: string,
 * sourceItemId: string | null, accessConstraints: string}>}>} SourceRevision
 * @typedef {Readonly<{id: string, kind: 'model-interpretation', sourceRevisionId: string,
 * model: Readonly<{name: string, version: string}>, generatedAt: string,
 * summary: string, hypotheses: readonly string[], suggestions: readonly string[]}>} Interpretation
 * @typedef {{sourceRevisions?: readonly SourceRevision[],
 * interpretations?: readonly Interpretation[]}} IdeaContent
 */

/** @param {unknown} value @returns {unknown} */
function sortedContent(value) {
  if (Array.isArray(value)) return value.map(sortedContent);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, sortedContent(value[key])])
    );
  }
  return value;
}

/** @param {string} kind @param {object} content */
function contentId(kind, content) {
  return `${kind}:${createHash('sha256')
    .update(JSON.stringify(sortedContent(content)))
    .digest('hex')}`;
}

/** @template T @param {T} value @returns {Readonly<T>} */
function freezeContent(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeContent(child);
    Object.freeze(value);
  }
  return value;
}

/** @template {object} T @param {string} kind @param {T} content */
function identifiedContent(kind, content) {
  return freezeContent(
    Object.assign({ id: contentId(kind, content) }, content)
  );
}

/** @param {unknown} value @param {string} field */
function textList(value, field) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map(item => requireText(item, field));
}

/** @param {unknown} value @param {string} field */
function modelLabel(value, field) {
  return value == null || (typeof value === 'string' && !value.trim())
    ? 'unknown'
    : requireText(value, field);
}

/**
 * Normalize an event delta. References to earlier events resolve at convergence.
 * @param {object} input
 * @param {{text: string, author: string, sourceTimestamp: string, supersedes?: string}} [input.originalSource]
 * @param {Array<{sourceRevisionId?: string, model?: {name?: string, version?: string},
 * generatedAt: string, summary: string, hypotheses?: string[], suggestions?: string[]}>} [input.interpretations]
 * @param {string} input.sourceUrl
 * @param {string} input.sourceType
 * @param {string} [input.sourceItemId]
 * @param {string} input.accessConstraints
 * @returns {IdeaContent}
 */
function normalizeIdeaContent(input) {
  if (input.originalSource === undefined && input.interpretations === undefined)
    return {};
  /** @type {SourceRevision[]} */
  const sourceRevisions = [];
  if (input.originalSource !== undefined) {
    const source = input.originalSource;
    requireText(source?.text, 'originalSource.text');
    requireText(source.author, 'originalSource.author');
    canonicalTimestamp(
      source.sourceTimestamp,
      'originalSource.sourceTimestamp'
    );
    sourceRevisions.push(
      identifiedContent('original-source', {
        kind: /** @type {const} */ ('original-source'),
        intent: /** @type {const} */ ('exploratory'),
        text: source.text,
        author: source.author,
        sourceTimestamp: source.sourceTimestamp,
        supersedes:
          source.supersedes == null
            ? null
            : requireText(source.supersedes, 'originalSource.supersedes'),
        provenance: {
          sourceUrl: input.sourceUrl,
          sourceType: input.sourceType,
          sourceItemId: input.sourceItemId ?? null,
          accessConstraints: input.accessConstraints,
        },
      })
    );
  }
  if (
    input.interpretations !== undefined &&
    !Array.isArray(input.interpretations)
  )
    throw new Error('interpretations must be an array');
  const interpretations = (input.interpretations ?? []).map(item => {
    if (!item || typeof item !== 'object')
      throw new Error('interpretation must be an object');
    if (
      item.model != null &&
      (typeof item.model !== 'object' || Array.isArray(item.model))
    )
      throw new Error('interpretation.model must be an object');
    return identifiedContent('model-interpretation', {
      kind: /** @type {const} */ ('model-interpretation'),
      sourceRevisionId: requireText(
        item.sourceRevisionId ?? sourceRevisions[0]?.id,
        'interpretation.sourceRevisionId'
      ),
      model: {
        name: modelLabel(item.model?.name, 'model.name'),
        version: modelLabel(item.model?.version, 'model.version'),
      },
      generatedAt: canonicalTimestamp(
        item.generatedAt,
        'interpretation.generatedAt'
      ),
      summary: requireText(item.summary, 'interpretation.summary'),
      hypotheses: textList(item.hypotheses, 'interpretation.hypotheses'),
      suggestions: textList(item.suggestions, 'interpretation.suggestions'),
    });
  });
  return {
    sourceRevisions: freezeContent(sourceRevisions),
    interpretations: freezeContent(interpretations),
  };
}

/**
 * Verify immutable IDs after a storage round trip and detach caller-owned objects.
 * @template {SourceRevision | Interpretation} T
 * @param {readonly T[]} records @param {string} kind @returns {readonly T[]}
 */
function mergeContentRecords(records, kind) {
  const byId = new Map();
  for (const record of records) {
    const { id, ...content } = record;
    if (content.kind !== kind || id !== contentId(kind, content))
      throw new Error(`${kind} immutable content mismatch`);
    byId.set(id, freezeContent(structuredClone(record)));
  }
  return freezeContent(
    [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
  );
}

/** @param {readonly SourceRevision[]} sources */
function validateSourceHistory(sources) {
  const ids = new Set(sources.map(source => source.id));
  for (const source of sources) {
    if (source.supersedes !== null && !ids.has(source.supersedes))
      throw new Error('source revision supersedes an unknown revision');
  }
  if (
    sources.length &&
    sources.filter(source => source.supersedes === null).length !== 1
  )
    throw new Error('changed original source requires explicit supersedes');
}

/** @param {IdeaContent} existing @param {IdeaContent} incoming @returns {IdeaContent} */
function convergeIdeaContent(existing, incoming) {
  if (
    !existing.sourceRevisions &&
    !incoming.sourceRevisions &&
    !existing.interpretations &&
    !incoming.interpretations
  )
    return {};
  const sourceRevisions = mergeContentRecords(
    [...(existing.sourceRevisions ?? []), ...(incoming.sourceRevisions ?? [])],
    'original-source'
  );
  validateSourceHistory(sourceRevisions);
  const interpretations = mergeContentRecords(
    [...(existing.interpretations ?? []), ...(incoming.interpretations ?? [])],
    'model-interpretation'
  );
  const sourceIds = new Set(sourceRevisions.map(source => source.id));
  for (const interpretation of interpretations) {
    if (!sourceIds.has(interpretation.sourceRevisionId))
      throw new Error('interpretation references an unknown source revision');
  }
  return { sourceRevisions, interpretations };
}

/**
 * Return source only, never summaries, hypotheses or suggestions. Omitted revisionId
 * selects the immutable original, not the latest wording. Legacy evidence returns null.
 * @param {IdeaContent} evidence @param {string} [revisionId]
 * @returns {SourceRevision | null}
 */
export function getOriginalSource(evidence, revisionId) {
  const sources = mergeContentRecords(
    evidence.sourceRevisions ?? [],
    'original-source'
  );
  validateSourceHistory(sources);
  const source = sources.find(item =>
    revisionId === undefined ? item.supersedes === null : item.id === revisionId
  );
  if (!source) return null;
  // A hydrated record may have extra fields. The source-only consumer must never
  // expose those fields (including model prose), even when its hash is valid.
  return freezeContent({
    id: source.id,
    kind: source.kind,
    intent: source.intent,
    text: source.text,
    author: source.author,
    sourceTimestamp: source.sourceTimestamp,
    supersedes: source.supersedes,
    provenance: {
      sourceUrl: source.provenance.sourceUrl,
      sourceType: source.provenance.sourceType,
      sourceItemId: source.provenance.sourceItemId,
      accessConstraints: source.provenance.accessConstraints,
    },
  });
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
    ...normalizeIdeaContent(input),
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
    ...convergeIdeaContent(existing, incoming),
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
