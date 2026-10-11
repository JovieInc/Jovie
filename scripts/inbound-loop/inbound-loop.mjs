import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const INBOUND_SCHEMA = 'jovie.always-on-inbound/v1';
export const CANDIDATE_SCHEMA = 'jovie.inbound-content-candidate/v1';

const DEMAND_SIGNAL_TYPES = new Set([
  'search-console-observation',
  'customer-question',
  'failed-public-agent-task',
  'support-pattern',
]);

const RELEASE_EVIDENCE_TYPES = new Set([
  'verified-release-record',
  'oss-release',
  'engineering-result',
  'third-party-coverage',
  'rights-cleared-research',
]);

const REQUIRED_EVIDENCE_PACKET = [
  'problem',
  'affectedAudience',
  'publicAvailability',
  'reproducibleEvidence',
  'limitations',
  'testedExample',
  'permittedTechnicalDetail',
];

const DAY_MS = 24 * 60 * 60 * 1000;

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be non-empty text`);
  }
  return value.trim();
}

function isoTimestamp(value, field) {
  const parsed = new Date(requireText(value, field));
  if (Number.isNaN(parsed.getTime()))
    throw new Error(`${field} must be ISO-8601`);
  return parsed.toISOString();
}

function normalizeKeyPart(value) {
  const normalized = requireText(value, 'key part')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return requireText(normalized, 'normalized key part');
}

export function candidateKey(candidate) {
  return [
    normalizeKeyPart(candidate.audience),
    normalizeKeyPart(candidate.readerJob),
    normalizeKeyPart(candidate.canonicalEntity),
  ].join('::');
}

function baseCandidate(input, stream) {
  for (const field of [
    'audience',
    'readerJob',
    'canonicalEntity',
    'expectedBenefit',
    'canonicalDestination',
    'effort',
  ]) {
    requireText(input[field], field);
  }
  if (
    !Number.isFinite(input.confidence) ||
    input.confidence < 0 ||
    input.confidence > 1
  ) {
    throw new Error('confidence must be between 0 and 1');
  }
  const candidate = {
    schema: CANDIDATE_SCHEMA,
    stream,
    audience: input.audience.trim(),
    readerJob: input.readerJob.trim(),
    canonicalEntity: input.canonicalEntity.trim(),
    expectedBenefit: input.expectedBenefit.trim(),
    canonicalDestination: input.canonicalDestination.trim(),
    cta: input.cta?.trim() ?? null,
    effort: input.effort.trim(),
    confidence: input.confidence,
  };
  candidate.dedupeKey = candidateKey(candidate);
  candidate.id = `candidate:${createHash('sha256')
    .update(candidate.dedupeKey)
    .digest('hex')
    .slice(0, 24)}`;
  return candidate;
}

function validateRegistryValue(registry) {
  if (registry?.schema !== INBOUND_SCHEMA)
    throw new Error(`schema must be ${INBOUND_SCHEMA}`);
  return registry;
}

function assertStream(stream, registry) {
  if (!registry.readerStreams.includes(stream)) {
    throw new Error(`stream ${stream} is not a recognized reader stream`);
  }
}

function assertSourceType(type, allowed, field) {
  if (!allowed.has(type)) throw new Error(`${field} ${type} is not permitted`);
}

export function normalizeDemandSignal(input, registry = loadRegistry()) {
  validateRegistryValue(registry);
  if (!input || typeof input !== 'object')
    throw new Error('demand signal must be an object');
  assertSourceType(input.sourceType, DEMAND_SIGNAL_TYPES, 'demand sourceType');
  if (!registry.adapters.demand.allowed.includes(input.sourceType)) {
    throw new Error(`demand sourceType ${input.sourceType} is not authorized`);
  }
  const candidate = baseCandidate(
    input,
    input.stream ?? 'customer-problem-solving'
  );
  assertStream(candidate.stream, registry);
  candidate.kind = 'demand';
  candidate.source = {
    sourceType: input.sourceType,
    privateSourceRef: requireText(input.privateSourceRef, 'privateSourceRef'),
    publicSummary: requireText(input.publicSummary, 'publicSummary'),
    observedAt: isoTimestamp(input.observedAt, 'observedAt'),
    accessConstraints: requireText(
      input.accessConstraints,
      'accessConstraints'
    ),
    corroboration: [...new Set(input.corroboration ?? [])],
  };
  return candidate;
}

export function normalizeReleaseEvidence(input, registry = loadRegistry()) {
  validateRegistryValue(registry);
  if (!input || typeof input !== 'object')
    throw new Error('release evidence must be an object');
  assertSourceType(
    input.sourceType,
    RELEASE_EVIDENCE_TYPES,
    'release sourceType'
  );
  if (!registry.adapters.release.allowed.includes(input.sourceType)) {
    throw new Error(`release sourceType ${input.sourceType} is not authorized`);
  }
  const packet = {};
  for (const field of REQUIRED_EVIDENCE_PACKET) {
    packet[field] = requireText(input[field], field);
  }
  const candidate = baseCandidate(
    input,
    input.stream ??
      (input.sourceType === 'verified-release-record'
        ? 'launch-tutorial'
        : 'engineering-oss-research')
  );
  assertStream(candidate.stream, registry);
  candidate.kind = 'release';
  candidate.evidencePacket = packet;
  candidate.source = {
    sourceType: input.sourceType,
    privateSourceRef: input.privateSourceRef?.trim() ?? null,
    publicSourceRef: requireText(input.publicSourceRef, 'publicSourceRef'),
    observedAt: isoTimestamp(input.observedAt, 'observedAt'),
    accessConstraints: requireText(
      input.accessConstraints,
      'accessConstraints'
    ),
  };
  return candidate;
}

function sourceObservedAt(candidate) {
  return Date.parse(candidate.source.observedAt);
}

function sourceMaxAgeDays(candidate, freshness) {
  return candidate.kind === 'release'
    ? freshness.releaseEvidenceMaxAgeDays
    : freshness.demandSignalMaxAgeDays;
}

export function isSourceStale(candidate, freshness, now = Date.now()) {
  const age = now - sourceObservedAt(candidate);
  return (
    !Number.isFinite(age) ||
    age < 0 ||
    age > sourceMaxAgeDays(candidate, freshness) * DAY_MS
  );
}

function matchesExisting(candidate, corpus) {
  return corpus.find(
    entry =>
      entry?.dedupeKey === candidate.dedupeKey ||
      (typeof entry?.audience === 'string' &&
        /[a-z0-9]/i.test(entry.audience) &&
        normalizeKeyPart(entry.audience) ===
          normalizeKeyPart(candidate.audience) &&
        typeof entry?.canonicalEntity === 'string' &&
        typeof entry?.readerJob === 'string' &&
        /[a-z0-9]/i.test(entry.canonicalEntity) &&
        /[a-z0-9]/i.test(entry.readerJob) &&
        normalizeKeyPart(entry.canonicalEntity) ===
          normalizeKeyPart(candidate.canonicalEntity) &&
        normalizeKeyPart(entry.readerJob) ===
          normalizeKeyPart(candidate.readerJob))
  );
}

export function decideCandidate(candidate, options = {}) {
  const registry = options.registry ?? loadRegistry();
  validateRegistryValue(registry);
  const now = options.now ?? Date.now();
  const corpus = options.existingContent ?? [];
  const base = {
    candidateId: candidate.id,
    dedupeKey: candidate.dedupeKey,
    stream: candidate.stream,
  };
  if (options.forceNoEvidence === true) {
    return {
      ...base,
      decision: 'no-public-action',
      reason: 'evidence-absent',
      active: false,
    };
  }
  if (isSourceStale(candidate, registry.freshness, now)) {
    return {
      ...base,
      decision: 'defer',
      reason: 'stale-or-absent-source-disables-dependent-decisions',
      active: false,
      stale: true,
    };
  }
  const existing = matchesExisting(candidate, corpus);
  if (existing) {
    if (existing.materiallyChanged === true) {
      return {
        ...base,
        decision: 'refresh',
        reason: 'underlying-claims-or-availability-changed',
        active: true,
        existingUrl: existing.url,
      };
    }
    if (options.distributionRelevant === true) {
      return {
        ...base,
        decision: 'distribute-again',
        reason: 'relevant-redistribution',
        active: true,
        existingUrl: existing.url,
      };
    }
    return {
      ...base,
      decision: 'update-or-merge',
      reason: 'duplicate-of-existing-content',
      active: true,
      existingUrl: existing.url,
    };
  }
  if (candidate.kind === 'release' && !candidate.evidencePacket) {
    return {
      ...base,
      decision: 'reject',
      reason: 'release-candidate-requires-evidence-packet',
      active: false,
    };
  }
  return {
    ...base,
    decision: 'create',
    reason: 'new-evidenced-reader-task',
    active: true,
  };
}

export function selectQueue(candidates, options = {}) {
  const registry = options.registry ?? loadRegistry();
  const decided = candidates.map(candidate => ({
    candidate,
    outcome: decideCandidate(candidate, options),
  }));
  const active = decided
    .filter(entry => entry.outcome.active)
    .sort(
      (a, b) =>
        b.candidate.confidence - a.candidate.confidence ||
        a.candidate.dedupeKey.localeCompare(b.candidate.dedupeKey)
    )
    .slice(0, registry.queue.maxActiveCandidates);
  return {
    schema: INBOUND_SCHEMA,
    maxActive: registry.queue.maxActiveCandidates,
    active,
    inactive: decided.filter(entry => !entry.outcome.active),
    overflow: decided.filter(
      entry => entry.outcome.active && !active.includes(entry)
    ),
  };
}

export function classifyIntakeEvent(event, registry = loadRegistry()) {
  validateRegistryValue(registry);
  if (event.class === 'periodic-llm-crawl')
    return { disposition: 'reject', reason: 'periodic-crawls-disabled' };
  if (event.class === 'clock-fired') {
    if (
      registry.triggerPolicy.scheduledReconciliation.daily.authorized &&
      event.scheduled === 'daily-reconciliation'
    ) {
      return { disposition: 'reconcile', kind: 'daily' };
    }
    if (
      registry.triggerPolicy.scheduledReconciliation.weeklyReprioritization
        .authorized &&
      event.scheduled === 'weekly-reprioritization'
    ) {
      return { disposition: 'reconcile', kind: 'weekly-reprioritization' };
    }
    return { disposition: 'reject', reason: 'clock-is-not-discovery' };
  }
  if (registry.triggerPolicy.materialEventClasses.includes(event.class)) {
    return { disposition: 'process-now' };
  }
  return { disposition: 'reject', reason: 'no-material-event' };
}

export function reconcileRun(runState, options = {}) {
  const now = options.now ?? Date.now();
  if (!Number.isFinite(now)) throw new Error('now must be a finite timestamp');
  if (
    runState.oldestActiveCandidateAt != null &&
    !Number.isFinite(Date.parse(runState.oldestActiveCandidateAt))
  ) {
    throw new Error('oldestActiveCandidateAt must be a valid timestamp');
  }
  const queueAgeDays =
    runState.oldestActiveCandidateAt != null
      ? Math.max(
          0,
          (now - Date.parse(runState.oldestActiveCandidateAt)) / DAY_MS
        )
      : null;
  return {
    lastSuccessfulRunAt: runState.lastSuccessfulRunAt ?? null,
    queueAgeDays,
    missedDeliveries: runState.missedDeliveries ?? 0,
    consecutiveFailures: runState.consecutiveFailures ?? 0,
    needsReprioritization:
      (runState.missedDeliveries ?? 0) > 0 ||
      (queueAgeDays != null && queueAgeDays > (options.staleQueueDays ?? 7)),
  };
}

export function recordRun(state, result) {
  if (result.ok === true && result.disable === true) {
    throw new Error('A successful run cannot also disable the loop');
  }
  const next = { ...state };
  next.lastAttemptAt = result.attemptedAt;
  if (result.ok === true) {
    next.lastSuccessfulRunAt = result.attemptedAt;
    next.consecutiveFailures = 0;
    next.disabled = false;
  } else {
    next.consecutiveFailures = (next.consecutiveFailures ?? 0) + 1;
    next.lastFailure = {
      at: result.attemptedAt,
      reason: result.reason ?? 'unknown',
    };
  }
  if (result.delivered === false) {
    next.missedDeliveries = (next.missedDeliveries ?? 0) + 1;
  }
  if (result.recovered === true) {
    next.missedDeliveries = 0;
  }
  if (result.disable === true) {
    next.disabled = true;
    next.disabledReason = result.reason ?? 'disabled';
  }
  return next;
}

export function assertNoPrivateLeakage(publicArtifact, privateFields = []) {
  const serialized = JSON.stringify(publicArtifact);
  for (const value of privateFields) {
    if (
      value &&
      serialized.includes(JSON.stringify(String(value)).slice(1, -1))
    ) {
      throw new Error('private source record leaked into public artifact');
    }
  }
  return true;
}

export function loadRegistry() {
  return JSON.parse(
    readFileSync(new URL('./inbound-registry.json', import.meta.url), 'utf8')
  );
}

export function validateRegistry(registry = loadRegistry()) {
  validateRegistryValue(registry);
  if (registry.trackingKey !== 'LAUNCH-AUDIENCE-2026-10-01/always-on-inbound') {
    throw new Error('tracking key mismatch');
  }
  if (registry.ownsArticleQualification !== false)
    throw new Error('JOV-7397 owns article qualification');
  if (
    !Number.isInteger(registry.queue.maxActiveCandidates) ||
    registry.queue.maxActiveCandidates < 1
  ) {
    throw new Error('queue.maxActiveCandidates must be a positive integer');
  }
  if (registry.queue.speculativeLinearTasks !== false)
    throw new Error('speculative Linear tasks are forbidden');
  if (registry.triggerPolicy.primary !== 'event-driven')
    throw new Error('intake must be event-driven');
  if (registry.triggerPolicy.periodicLlmCrawl !== false)
    throw new Error('periodic LLM crawls are forbidden');
  if (registry.triggerPolicy.clockIsNotDiscovery !== true)
    throw new Error('clock events must not drive discovery');
  if (registry.freshness.staleDisablesDependentDecisions !== true)
    throw new Error('stale data must disable dependent decisions');
  if (
    registry.confidentiality.privateSourceRecordsSeparateFromPublicArtifacts !==
    true
  )
    throw new Error('private source records must stay separate');
  for (const stream of registry.readerStreams)
    requireText(stream, 'readerStreams');
  for (const decision of registry.decisions) requireText(decision, 'decisions');
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validateRegistry();
  process.stdout.write('inbound registry valid\n');
}
