import type { MarketingRegistryEntry } from '@/data/marketing/componentRegistry';
import {
  CERTIFICATION_OPERATIONAL_EVIDENCE_TIERS,
  CERTIFICATION_TASTE_EVIDENCE_TIERS,
  type CertificationAdmission,
  type CertificationAuditEvent,
  type CertificationReviewPacket,
  type CertificationTasteInboxCard,
  evaluateCertificationAdmission,
  type FounderCertificationDecision,
  JOVIE_CERTIFICATION_CONTRACT,
  type RecordFounderCertificationDecisionInput,
  type RecordFounderCertificationDecisionResult,
  recordFounderCertificationDecision,
} from '@/lib/agent-os/certification';

export const MARKETING_CERTIFICATION_LEDGER_SCHEMA_VERSION = 1 as const;
export const MARKETING_CERTIFICATION_STORE_KEY =
  'jovie:certification:v1:marketing-components' as const;

const PERSISTENCE_TTL_SECONDS = 315_576_000;
const MAX_COMPARE_AND_SET_ATTEMPTS = 5;

export interface CertificationRecordBackend {
  get(key: string): Promise<unknown>;
  setIfAbsent(
    key: string,
    value: unknown,
    ttlSeconds: number
  ): Promise<boolean>;
  compareAndSet(
    key: string,
    expectedValue: string,
    nextValue: string,
    ttlSeconds: number
  ): Promise<boolean>;
}

export interface MarketingCertificationRecord {
  readonly identityId: string;
  readonly packet: CertificationReviewPacket;
  readonly packetUpdatedAt: string;
  readonly decisions: readonly FounderCertificationDecision[];
  readonly auditHistory: readonly CertificationAuditEvent[];
  readonly updatedAt: string;
}

export interface MarketingCertificationLedger {
  readonly schemaVersion: typeof MARKETING_CERTIFICATION_LEDGER_SCHEMA_VERSION;
  readonly contract: typeof JOVIE_CERTIFICATION_CONTRACT;
  readonly registryIds: readonly string[];
  readonly records: Readonly<Record<string, MarketingCertificationRecord>>;
}

export interface MarketingCertificationProjectionRow {
  readonly identityId: string;
  readonly registryKind: MarketingRegistryEntry['kind'];
  readonly sourceBacked: boolean;
  readonly resolvedSource: string | null;
  readonly packet: CertificationReviewPacket;
  readonly packetUpdatedAt: string;
  readonly decisions: readonly FounderCertificationDecision[];
  readonly admission: CertificationAdmission;
  readonly auditHistory: readonly CertificationAuditEvent[];
  readonly updatedAt: string;
}

export interface MarketingCertificationLedgerProjection {
  readonly contract: typeof JOVIE_CERTIFICATION_CONTRACT;
  readonly registryIds: readonly string[];
  readonly rows: readonly MarketingCertificationProjectionRow[];
}

export type MarketingReviewReadyWithheldReason =
  | 'existing_review_slot_occupied'
  | 'max_one_arbitration';

export interface MarketingReviewReadyProjection {
  readonly contract: typeof JOVIE_CERTIFICATION_CONTRACT;
  readonly existingEntryId: string | null;
  readonly selected: CertificationTasteInboxCard | null;
  readonly eligibleSubjectIds: readonly string[];
  readonly withheld: readonly {
    readonly subjectId: string;
    readonly reason: MarketingReviewReadyWithheldReason;
  }[];
}

export class MarketingCertificationRegistryDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketingCertificationRegistryDriftError';
  }
}

export class MarketingCertificationPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketingCertificationPersistenceError';
  }
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function registryIds(entries: readonly MarketingRegistryEntry[]): string[] {
  const ids = entries.map(entry => entry.id);
  if (uniqueSorted(ids).length !== ids.length) {
    throw new MarketingCertificationRegistryDriftError(
      'Marketing certification registry contains duplicate identities.'
    );
  }
  return ids;
}

function missingPacketForEntry(
  entry: MarketingRegistryEntry
): CertificationReviewPacket {
  return {
    canonicalReferences: [],
    contract: JOVIE_CERTIFICATION_CONTRACT,
    invariantEvaluation: [],
    itemMedia: [],
    operational: {},
    requiredVariants: [],
    source: null,
    subject: {
      id: entry.id,
      kind: `marketing-${entry.kind}`,
      title: entry.storybookTitle,
    },
    testsCoverage: [],
    visualProof: [],
  };
}

function initialLedger(
  entries: readonly MarketingRegistryEntry[],
  initializedAt: string
): MarketingCertificationLedger {
  const ids = registryIds(entries);
  return {
    contract: JOVIE_CERTIFICATION_CONTRACT,
    records: Object.fromEntries(
      entries.map(entry => [
        entry.id,
        {
          auditHistory: [],
          decisions: [],
          identityId: entry.id,
          packet: missingPacketForEntry(entry),
          packetUpdatedAt: initializedAt,
          updatedAt: initializedAt,
        },
      ])
    ),
    registryIds: ids,
    schemaVersion: MARKETING_CERTIFICATION_LEDGER_SCHEMA_VERSION,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const FOUNDER_DECISIONS = new Set([
  'approved',
  'changes_requested',
  'rejected',
]);
const AUDIT_EVENT_TYPES = new Set([
  'review_packet_incomplete',
  'taste_card_emitted',
  'founder_lock_valid',
  'founder_lock_stale',
  'founder_feedback_returned',
  'founder_rejected',
  'transition_blocked',
  'transition_allowed',
]);
const EVIDENCE_TIERS = new Set<string>([
  ...CERTIFICATION_TASTE_EVIDENCE_TIERS,
  ...CERTIFICATION_OPERATIONAL_EVIDENCE_TIERS,
]);
const EVIDENCE_STATUSES = new Set<string>([
  'missing',
  'pending',
  'passed',
  'failed',
  'blocked',
]);

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isEvidenceReceipt(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.tier === 'string' &&
    EVIDENCE_TIERS.has(value.tier) &&
    typeof value.status === 'string' &&
    EVIDENCE_STATUSES.has(value.status) &&
    isNullableString(value.sourceSha) &&
    typeof value.ref === 'string' &&
    isNullableString(value.digest) &&
    typeof value.summary === 'string'
  );
}

function isCertificationReviewPacket(value: unknown): boolean {
  if (
    !isRecord(value) ||
    typeof value.contract !== 'string' ||
    !isRecord(value.subject) ||
    typeof value.subject.id !== 'string' ||
    typeof value.subject.kind !== 'string' ||
    typeof value.subject.title !== 'string' ||
    !Array.isArray(value.canonicalReferences) ||
    !value.canonicalReferences.every(isEvidenceReceipt) ||
    !Array.isArray(value.invariantEvaluation) ||
    !value.invariantEvaluation.every(isEvidenceReceipt) ||
    !Array.isArray(value.testsCoverage) ||
    !value.testsCoverage.every(isEvidenceReceipt) ||
    !Array.isArray(value.visualProof) ||
    !value.visualProof.every(isEvidenceReceipt) ||
    !Array.isArray(value.requiredVariants) ||
    !value.requiredVariants.every(
      variant =>
        isRecord(variant) &&
        typeof variant.id === 'string' &&
        variant.id.length > 0 &&
        typeof variant.label === 'string' &&
        typeof variant.sourceSha === 'string' &&
        (variant.proof === null || isEvidenceReceipt(variant.proof)) &&
        Array.isArray(variant.requiredMediaIds) &&
        variant.requiredMediaIds.every(id => typeof id === 'string')
    ) ||
    !Array.isArray(value.itemMedia) ||
    !value.itemMedia.every(
      media =>
        isRecord(media) &&
        typeof media.id === 'string' &&
        media.id.length > 0 &&
        typeof media.itemId === 'string' &&
        isNullableString(media.variantId) &&
        typeof media.status === 'string' &&
        EVIDENCE_STATUSES.has(media.status) &&
        isNullableString(media.sourceSha) &&
        typeof media.ref === 'string' &&
        isNullableString(media.digest) &&
        typeof media.summary === 'string'
    )
  ) {
    return false;
  }

  if (
    value.source !== null &&
    (!isRecord(value.source) ||
      typeof value.source.repository !== 'string' ||
      typeof value.source.ref !== 'string' ||
      typeof value.source.sha !== 'string' ||
      (value.source.expectedSha !== undefined &&
        !isNullableString(value.source.expectedSha)) ||
      !Array.isArray(value.source.paths) ||
      !value.source.paths.every(path => typeof path === 'string') ||
      (value.source.digest !== undefined &&
        !isNullableString(value.source.digest)))
  ) {
    return false;
  }

  if (value.operational === undefined) return true;
  if (!isRecord(value.operational)) return false;
  const operational = value.operational;
  return ['ci', 'queueMerge', 'deploy', 'runtimeDogfood'].every(key => {
    const receipts = operational[key];
    return (
      receipts === undefined ||
      (Array.isArray(receipts) && receipts.every(isEvidenceReceipt))
    );
  });
}

function isPersistedFounderDecision(
  value: unknown,
  subjectId: string
): value is FounderCertificationDecision {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.subjectId === subjectId &&
    typeof value.evidenceDigest === 'string' &&
    value.evidenceDigest.length > 0 &&
    typeof value.decision === 'string' &&
    FOUNDER_DECISIONS.has(value.decision) &&
    typeof value.decidedAt === 'string' &&
    !Number.isNaN(Date.parse(value.decidedAt)) &&
    typeof value.reviewer === 'string' &&
    value.reviewer.length > 0 &&
    (value.notes === null || typeof value.notes === 'string')
  );
}

function isPersistedAuditEvent(
  value: unknown,
  subjectId: string
): value is CertificationAuditEvent {
  return (
    isRecord(value) &&
    typeof value.at === 'string' &&
    !Number.isNaN(Date.parse(value.at)) &&
    typeof value.type === 'string' &&
    AUDIT_EVENT_TYPES.has(value.type) &&
    value.subjectId === subjectId &&
    (value.evidenceDigest === null ||
      typeof value.evidenceDigest === 'string') &&
    typeof value.summary === 'string'
  );
}

function parseLedger(raw: unknown): MarketingCertificationLedger {
  if (typeof raw !== 'string') {
    throw new MarketingCertificationPersistenceError(
      'Certification ledger must be stored as one compare-and-set JSON string.'
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new MarketingCertificationPersistenceError(
      'Certification ledger contains invalid JSON.'
    );
  }

  if (
    !isRecord(value) ||
    value.schemaVersion !== MARKETING_CERTIFICATION_LEDGER_SCHEMA_VERSION ||
    value.contract !== JOVIE_CERTIFICATION_CONTRACT ||
    !Array.isArray(value.registryIds) ||
    !value.registryIds.every(id => typeof id === 'string') ||
    !isRecord(value.records)
  ) {
    throw new MarketingCertificationPersistenceError(
      'Certification ledger envelope is invalid.'
    );
  }

  for (const id of value.registryIds) {
    const record = value.records[id];
    if (
      !isRecord(record) ||
      record.identityId !== id ||
      !isRecord(record.packet) ||
      typeof record.packetUpdatedAt !== 'string' ||
      Number.isNaN(Date.parse(record.packetUpdatedAt)) ||
      !Array.isArray(record.decisions) ||
      !Array.isArray(record.auditHistory) ||
      typeof record.updatedAt !== 'string' ||
      Number.isNaN(Date.parse(record.updatedAt)) ||
      !record.decisions.every(decision =>
        isPersistedFounderDecision(decision, id)
      ) ||
      !record.auditHistory.every(event => isPersistedAuditEvent(event, id))
    ) {
      throw new MarketingCertificationPersistenceError(
        `Certification ledger record ${id} is invalid.`
      );
    }
  }

  return value as unknown as MarketingCertificationLedger;
}

function assertDenominator(
  ledger: MarketingCertificationLedger,
  entries: readonly MarketingRegistryEntry[]
): void {
  const expected = uniqueSorted(registryIds(entries));
  const stored = uniqueSorted(ledger.registryIds);
  const recordIds = uniqueSorted(Object.keys(ledger.records));
  if (
    stored.length !== ledger.registryIds.length ||
    JSON.stringify(stored) !== JSON.stringify(expected) ||
    JSON.stringify(recordIds) !== JSON.stringify(expected)
  ) {
    throw new MarketingCertificationRegistryDriftError(
      `Marketing certification denominator drifted: expected ${expected.length} identities, stored ${stored.length} registry ids and ${recordIds.length} records.`
    );
  }

  const decisionIds = new Set<string>();
  const evidenceDigests = new Set<string>();
  for (const record of Object.values(ledger.records)) {
    for (const decision of record.decisions) {
      if (
        decisionIds.has(decision.id) ||
        evidenceDigests.has(decision.evidenceDigest)
      ) {
        throw new MarketingCertificationPersistenceError(
          'Certification ledger contains a duplicate founder decision id or evidence digest.'
        );
      }
      decisionIds.add(decision.id);
      evidenceDigests.add(decision.evidenceDigest);
    }
  }
}

function assertPacketMatchesEntry(
  packet: CertificationReviewPacket,
  entry: MarketingRegistryEntry
): void {
  if (!isCertificationReviewPacket(packet)) {
    throw new MarketingCertificationPersistenceError(
      `Certification packet ${entry.id} has an invalid runtime shape.`
    );
  }
  if (
    packet.subject.id !== entry.id ||
    packet.subject.kind !== `marketing-${entry.kind}` ||
    packet.subject.title !== entry.storybookTitle
  ) {
    throw new MarketingCertificationPersistenceError(
      `Certification packet ${entry.id} does not match its canonical registry identity.`
    );
  }
  if (!packet.source) return;
  if (!entry.sourceBacked || !entry.resolvedSource) {
    throw new MarketingCertificationPersistenceError(
      `Registry identity ${entry.id} has no resolved canonical source.`
    );
  }
  if (!packet.source.paths.includes(entry.resolvedSource)) {
    throw new MarketingCertificationPersistenceError(
      `Certification packet ${entry.id} does not bind canonical source ${entry.resolvedSource}.`
    );
  }
}

function serializeLedger(ledger: MarketingCertificationLedger): string {
  return JSON.stringify(ledger);
}

function assertValidTimestamp(value: string, label: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new MarketingCertificationPersistenceError(
      `${label} must be a valid timestamp.`
    );
  }
}

function laterTimestamp(left: string, right: string): string {
  return Date.parse(left) >= Date.parse(right) ? left : right;
}

function projectionRow(
  entry: MarketingRegistryEntry,
  record: MarketingCertificationRecord,
  evaluatedAt: string
): MarketingCertificationProjectionRow {
  let admission: CertificationAdmission;
  try {
    assertPacketMatchesEntry(record.packet, entry);
    admission = evaluateCertificationAdmission({
      decisions: record.decisions,
      evaluatedAt,
      packet: record.packet,
    });
  } catch {
    throw new MarketingCertificationPersistenceError(
      `Certification ledger record ${entry.id} cannot be evaluated.`
    );
  }

  return {
    admission,
    auditHistory: record.auditHistory,
    decisions: record.decisions,
    identityId: entry.id,
    packet: record.packet,
    packetUpdatedAt: record.packetUpdatedAt,
    registryKind: entry.kind,
    resolvedSource: entry.resolvedSource,
    sourceBacked: entry.sourceBacked,
    updatedAt: record.updatedAt,
  };
}

function assertLedgerMatchesRegistry(
  ledger: MarketingCertificationLedger,
  entries: readonly MarketingRegistryEntry[],
  evaluatedAt: string
): void {
  assertDenominator(ledger, entries);
  for (const entry of entries) {
    projectionRow(entry, ledger.records[entry.id], evaluatedAt);
  }
}

export class MarketingCertificationStore {
  private readonly entries: readonly MarketingRegistryEntry[];
  private readonly entryById: ReadonlyMap<string, MarketingRegistryEntry>;

  constructor(
    private readonly backend: CertificationRecordBackend,
    entries: readonly MarketingRegistryEntry[]
  ) {
    registryIds(entries);
    this.entries = [...entries];
    this.entryById = new Map(entries.map(entry => [entry.id, entry]));
  }

  async ingestPacket(
    packet: CertificationReviewPacket,
    evaluatedAt = new Date().toISOString()
  ): Promise<MarketingCertificationProjectionRow> {
    assertValidTimestamp(evaluatedAt, 'Packet evaluation time');
    const entry = this.entryById.get(packet.subject.id);
    if (!entry) {
      throw new MarketingCertificationRegistryDriftError(
        `Unknown marketing certification identity: ${packet.subject.id}`
      );
    }
    assertPacketMatchesEntry(packet, entry);

    return this.mutate(evaluatedAt, ledger => {
      const existing = ledger.records[entry.id];
      const isInitialPlaceholder =
        existing.packet.source === null &&
        existing.decisions.length === 0 &&
        existing.auditHistory.length === 0;
      if (
        !isInitialPlaceholder &&
        Date.parse(evaluatedAt) <= Date.parse(existing.packetUpdatedAt)
      ) {
        throw new MarketingCertificationPersistenceError(
          `Certification packet ${entry.id} is not newer than the persisted packet.`
        );
      }
      const admission = evaluateCertificationAdmission({
        decisions: existing.decisions,
        evaluatedAt,
        packet,
      });
      const nextRecord: MarketingCertificationRecord = {
        auditHistory: [...existing.auditHistory, ...admission.auditHistory],
        decisions: existing.decisions,
        identityId: entry.id,
        packet,
        packetUpdatedAt: evaluatedAt,
        updatedAt: laterTimestamp(existing.updatedAt, evaluatedAt),
      };
      const nextLedger = {
        ...ledger,
        records: { ...ledger.records, [entry.id]: nextRecord },
      };
      return {
        ledger: nextLedger,
        result: projectionRow(entry, nextRecord, evaluatedAt),
      };
    });
  }

  async recordFounderDecision(input: {
    readonly subjectId: string;
    readonly decision: Omit<
      RecordFounderCertificationDecisionInput['decision'],
      'decidedAt' | 'evidenceDigest'
    > & {
      readonly evidenceDigest: string;
    };
    readonly decidedAt?: string;
  }): Promise<RecordFounderCertificationDecisionResult> {
    const entry = this.entryById.get(input.subjectId);
    if (!entry) {
      throw new MarketingCertificationRegistryDriftError(
        `Unknown marketing certification identity: ${input.subjectId}`
      );
    }
    const decidedAt = input.decidedAt ?? new Date().toISOString();
    assertValidTimestamp(decidedAt, 'Founder decision time');
    if (
      !isPersistedFounderDecision(
        { ...input.decision, decidedAt, subjectId: entry.id },
        entry.id
      )
    ) {
      throw new MarketingCertificationPersistenceError(
        'Founder decision input is invalid.'
      );
    }

    return this.mutate<RecordFounderCertificationDecisionResult>(
      decidedAt,
      ledger => {
        const existing = ledger.records[entry.id];
        assertPacketMatchesEntry(existing.packet, entry);
        if (Date.parse(decidedAt) < Date.parse(existing.packetUpdatedAt)) {
          throw new MarketingCertificationPersistenceError(
            'Founder decision predates the current certification packet.'
          );
        }
        const duplicateDecisionId = Object.values(ledger.records).some(record =>
          record.decisions.some(decision => decision.id === input.decision.id)
        );
        if (duplicateDecisionId) {
          const admission = evaluateCertificationAdmission({
            decisions: existing.decisions,
            evaluatedAt: decidedAt,
            packet: existing.packet,
          });
          return {
            ledger,
            result: {
              admission,
              blockers: [
                {
                  code: 'duplicate_founder_decision',
                  id: input.decision.id,
                  summary:
                    'Founder decision id has already been recorded in the marketing certification ledger.',
                  tier: 'decision',
                },
              ],
              ok: false,
              reason: 'duplicate_founder_decision',
            },
          };
        }
        const recorded = recordFounderCertificationDecision({
          decidedAt,
          decision: input.decision,
          existingDecisions: existing.decisions,
          packet: existing.packet,
        });
        if (!recorded.ok) {
          return { ledger, result: recorded };
        }

        const nextRecord: MarketingCertificationRecord = {
          ...existing,
          auditHistory: [
            ...existing.auditHistory,
            ...recorded.admission.auditHistory,
          ],
          decisions: recorded.decisions,
          updatedAt: laterTimestamp(existing.updatedAt, decidedAt),
        };
        return {
          ledger: {
            ...ledger,
            records: { ...ledger.records, [entry.id]: nextRecord },
          },
          result: recorded,
        };
      }
    );
  }

  async projectLedger(
    evaluatedAt = new Date().toISOString()
  ): Promise<MarketingCertificationLedgerProjection> {
    assertValidTimestamp(evaluatedAt, 'Ledger projection time');
    const ledger = await this.ensureLedger(evaluatedAt);
    assertLedgerMatchesRegistry(ledger, this.entries, evaluatedAt);
    return {
      contract: JOVIE_CERTIFICATION_CONTRACT,
      registryIds: [...ledger.registryIds],
      rows: this.entries.map(entry =>
        projectionRow(entry, ledger.records[entry.id], evaluatedAt)
      ),
    };
  }

  async projectReviewReady(input: {
    readonly existingEntryId: string | null;
    readonly evaluatedAt?: string;
  }): Promise<MarketingReviewReadyProjection> {
    const projection = await this.projectLedger(input.evaluatedAt);
    const eligible = projection.rows.filter(
      row =>
        row.admission.state === 'review_ready' &&
        row.admission.tasteInboxCard !== null
    );
    const eligibleSubjectIds = eligible.map(row => row.identityId);

    if (input.existingEntryId) {
      return {
        contract: JOVIE_CERTIFICATION_CONTRACT,
        eligibleSubjectIds,
        existingEntryId: input.existingEntryId,
        selected: null,
        withheld: eligible.map(row => ({
          reason: 'existing_review_slot_occupied' as const,
          subjectId: row.identityId,
        })),
      };
    }

    const [selected, ...withheld] = eligible;
    return {
      contract: JOVIE_CERTIFICATION_CONTRACT,
      eligibleSubjectIds,
      existingEntryId: null,
      selected: selected?.admission.tasteInboxCard ?? null,
      withheld: withheld.map(row => ({
        reason: 'max_one_arbitration' as const,
        subjectId: row.identityId,
      })),
    };
  }

  private async ensureLedger(initializedAt: string) {
    for (
      let attempt = 0;
      attempt < MAX_COMPARE_AND_SET_ATTEMPTS;
      attempt += 1
    ) {
      const raw = await this.backend.get(MARKETING_CERTIFICATION_STORE_KEY);
      if (raw !== null && raw !== undefined) return parseLedger(raw);

      const ledger = initialLedger(this.entries, initializedAt);
      const serialized = serializeLedger(ledger);
      const validated = parseLedger(serialized);
      assertLedgerMatchesRegistry(validated, this.entries, initializedAt);
      const inserted = await this.backend.setIfAbsent(
        MARKETING_CERTIFICATION_STORE_KEY,
        serialized,
        PERSISTENCE_TTL_SECONDS
      );
      if (inserted) return ledger;
    }
    throw new MarketingCertificationPersistenceError(
      'Certification ledger initialization lost compare-and-set repeatedly.'
    );
  }

  private async mutate<Result>(
    initializedAt: string,
    update: (ledger: MarketingCertificationLedger) => {
      readonly ledger: MarketingCertificationLedger;
      readonly result: Result;
    }
  ): Promise<Result> {
    for (
      let attempt = 0;
      attempt < MAX_COMPARE_AND_SET_ATTEMPTS;
      attempt += 1
    ) {
      const currentRaw = await this.backend.get(
        MARKETING_CERTIFICATION_STORE_KEY
      );
      if (currentRaw === null || currentRaw === undefined) {
        await this.ensureLedger(initializedAt);
        continue;
      }
      if (typeof currentRaw !== 'string') {
        throw new MarketingCertificationPersistenceError(
          'Certification ledger must be stored as one compare-and-set JSON string.'
        );
      }
      const current = parseLedger(currentRaw);
      assertLedgerMatchesRegistry(current, this.entries, initializedAt);
      const next = update(current);
      if (next.ledger === current) return next.result;
      const nextRaw = serializeLedger(next.ledger);
      const validated = parseLedger(nextRaw);
      assertLedgerMatchesRegistry(validated, this.entries, initializedAt);
      const saved = await this.backend.compareAndSet(
        MARKETING_CERTIFICATION_STORE_KEY,
        currentRaw,
        nextRaw,
        PERSISTENCE_TTL_SECONDS
      );
      if (saved) return next.result;
    }
    throw new MarketingCertificationPersistenceError(
      'Certification ledger update lost compare-and-set repeatedly.'
    );
  }
}
