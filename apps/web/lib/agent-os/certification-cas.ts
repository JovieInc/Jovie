import { createHash } from 'node:crypto';
import type { MarketingRegistryEntry } from '@/data/marketing/componentRegistry';
import {
  CERTIFICATION_OPERATIONAL_EVIDENCE_TIERS,
  CERTIFICATION_TASTE_EVIDENCE_TIERS,
  type CertificationEvidenceReceipt,
  type CertificationReviewPacket,
} from './certification';
import type {
  MarketingCertificationHotLedger,
  MarketingCertificationHotRecord,
  MarketingCertificationLedger,
  MarketingCertificationRecord,
} from './certification-adapter';

/** Shared persistence mechanics for the two certification domain adapters. */
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
  /** Optional lexically ordered prefix scan for compatible backend callers. */
  listRecords?(
    prefix: string,
    after: string | undefined,
    limit: number
  ): Promise<Array<{ key: string; value: unknown }>>;
  /**
   * Optional multi-get (JOV-12821): one round trip for many keys. Backends
   * without it fall back to per-key gets; absent keys are simply missing from
   * the returned map.
   */
  getMany?(keys: readonly string[]): Promise<Map<string, unknown>>;
}

export const CERTIFICATION_PERSISTENCE_TTL_SECONDS = 315_576_000;
export const CERTIFICATION_CAS_ATTEMPTS = 5;

/**
 * The ledger is stored as one JSON string in a jsonb column, but the driver
 * decodes that jsonb string and Drizzle's jsonb mapper parses it again, so a
 * read can hand back the object. The stored string was itself produced by
 * JSON.stringify, so re-serializing yields the identical compare-and-set
 * value (verified on production, 2026-09-28: every ingest was rejected).
 */
export function certificationRecordJson(raw: unknown): string | null {
  if (typeof raw === 'string') return raw;
  if (raw !== null && typeof raw === 'object') return JSON.stringify(raw);
  return null;
}

/** Updates must be pure: a lost CAS reruns them against the latest persisted state. */
export async function mutateCertificationRecord<State, Result>(input: {
  backend: CertificationRecordBackend;
  key: string;
  initialize: () => Promise<unknown>;
  parse: (raw: unknown) => State;
  validate: (state: State) => void;
  update: (state: State) => { readonly ledger: State; readonly result: Result };
  error: (message: string) => Error;
}): Promise<Result> {
  for (let attempt = 0; attempt < CERTIFICATION_CAS_ATTEMPTS; attempt += 1) {
    const raw = await input.backend.get(input.key);
    if (raw === null || raw === undefined) {
      await input.initialize();
      continue;
    }
    const json = certificationRecordJson(raw);
    if (json === null) {
      throw input.error(
        'Certification ledger must be stored as one compare-and-set JSON string.'
      );
    }
    const current = input.parse(json);
    input.validate(current);
    const next = input.update(current);
    const serialized = JSON.stringify(next.ledger);
    // Unchanged state skips the write; `parse` may have extended it (registry drift), which still persists.
    if (next.ledger === current && serialized === json) return next.result;
    input.validate(input.parse(serialized));
    if (
      await input.backend.compareAndSet(
        input.key,
        json,
        serialized,
        CERTIFICATION_PERSISTENCE_TTL_SECONDS
      )
    ) {
      return next.result;
    }
  }
  throw input.error(
    'Certification ledger update lost compare-and-set repeatedly.'
  );
}

export const EVIDENCE_TIERS = new Set<string>([
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

export function isCertificationReviewPacket(
  value: unknown
): value is CertificationReviewPacket {
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

/**
 * What a packet means, without the volatile bookkeeping (push SHA, run URL, per-run
 * digests). The producer re-posts every entry on nearly every main push; identical
 * meaning must not rewrite the MB-sized ledger or append audit noise.
 */
export function certificationPacketMeaning(
  packet: CertificationReviewPacket
): string {
  const receipts = (
    list: readonly CertificationEvidenceReceipt[] | undefined
  ) => (list ?? []).map(r => [r.id, r.tier, r.status, r.summary]);
  return JSON.stringify([
    packet.subject,
    // Without a content digest the commit SHA is the only identity, so it counts.
    packet.source
      ? [
          (packet.source as { digest?: string }).digest ?? packet.source.sha,
          packet.source.paths,
        ]
      : null,
    receipts(packet.canonicalReferences),
    receipts(packet.invariantEvaluation),
    receipts(packet.testsCoverage),
    receipts(packet.visualProof),
    packet.itemMedia,
    packet.requiredVariants,
    packet.operational,
  ]);
}

/** Immutable shards are prepared before the single hot-row commit. Orphans never certify. */
export function createCertificationPacketStorage(config: {
  prefix: string;
  schema: string;
  maxBytes: number;
  missingPacket: (entry: MarketingRegistryEntry) => CertificationReviewPacket;
  error: (message: string) => Error;
  registryError: (message: string) => Error;
}) {
  const digest = (json: string) =>
    createHash('sha256').update(json).digest('hex');
  const assertBudget = (json: string) => {
    if (Buffer.byteLength(json, 'utf8') > config.maxBytes) {
      throw config.error(
        'Certification persistence row exceeds the byte budget.'
      );
    }
  };
  const shardKey = (id: string, revision?: string) =>
    `${config.prefix}${id}${revision ? `:${revision}` : ''}`;
  function parsePacketShard(
    raw: unknown,
    id: string,
    at: string,
    revision?: string
  ): CertificationReviewPacket | null {
    const json = certificationRecordJson(raw);
    if (json === null || (revision && digest(json) !== revision)) return null;
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      return null;
    }
    return isRecord(value) &&
      value.schema === config.schema &&
      value.identityId === id &&
      typeof value.evaluatedAt === 'string' &&
      !Number.isNaN(Date.parse(value.evaluatedAt)) &&
      Date.parse(value.evaluatedAt) === Date.parse(at) &&
      isCertificationReviewPacket(value.packet) &&
      value.packet.subject.id === id
      ? value.packet
      : null;
  }
  async function writePacketShard(
    backend: CertificationRecordBackend,
    identityId: string,
    evaluatedAt: string,
    packet: CertificationReviewPacket
  ): Promise<string> {
    if (
      !isCertificationReviewPacket(packet) ||
      packet.subject.id !== identityId
    ) {
      throw config.error(
        `Certification packet ${identityId} has an invalid runtime shape.`
      );
    }
    const json = JSON.stringify({
      schema: config.schema,
      identityId,
      evaluatedAt,
      packet,
    });
    assertBudget(json);
    const revision = digest(json);
    const key = shardKey(identityId, revision);
    for (let attempt = 0; attempt < CERTIFICATION_CAS_ATTEMPTS; attempt += 1) {
      if (
        await backend.setIfAbsent(
          key,
          json,
          CERTIFICATION_PERSISTENCE_TTL_SECONDS
        )
      )
        return revision;
      const existing = certificationRecordJson(await backend.get(key));
      if (existing === json) return revision;
      if (existing !== null)
        throw config.error(
          `Certification packet shard ${identityId} is immutable or corrupt.`
        );
    }
    throw config.error(
      `Certification packet shard ${identityId} lost compare-and-set repeatedly.`
    );
  }
  function serializeHotLedger(
    ledger: MarketingCertificationLedger
  ): MarketingCertificationHotLedger {
    const records: Record<string, MarketingCertificationHotRecord> = {};
    for (const [id, record] of Object.entries(ledger.records)) {
      const { packet: _packet, packetFailure: _failure, ...hot } = record;
      // Keep malformed inline evidence until a valid producer explicitly replaces it.
      records[id] = isCertificationReviewPacket(_packet)
        ? hot
        : { ...hot, packet: _packet };
    }
    const hot = { ...ledger, records };
    assertBudget(JSON.stringify(hot));
    return hot;
  }
  async function hydrateLedger(
    backend: CertificationRecordBackend,
    entries: ReadonlyMap<string, MarketingRegistryEntry>,
    hot: MarketingCertificationHotLedger
  ): Promise<{
    ledger: MarketingCertificationLedger;
    inlineBacklog: ReadonlySet<string>;
  }> {
    let rows = new Map<string, unknown>();
    const needed = new Set(
      Object.values(hot.records)
        .filter(record => record.packet === undefined)
        .map(record => shardKey(record.identityId, record.packetRevision))
    );
    // Read only revisions committed by the hot row; abandoned and historical
    // revisions must not make projection cost grow with past writes.
    if (backend.getMany && needed.size > 0) {
      rows = await backend.getMany([...needed]);
    } else {
      await Promise.all(
        [...needed].map(async key => rows.set(key, await backend.get(key)))
      );
    }
    const records: Record<string, MarketingCertificationRecord> = {};
    const inlineBacklog = new Set<string>();
    for (const [id, record] of Object.entries(hot.records)) {
      const entry = entries.get(id);
      if (!entry)
        throw config.registryError(
          `Certification ledger record ${id} is not in the marketing registry.`
        );
      if (record.packet !== undefined) {
        if (
          isCertificationReviewPacket(record.packet) &&
          certificationPacketMeaning(record.packet) !==
            certificationPacketMeaning(config.missingPacket(entry))
        )
          inlineBacklog.add(id);
        records[id] = { ...record, packet: record.packet };
        continue;
      }
      const hasHistory =
        record.auditHistory.length > 0 || record.decisions.length > 0;
      const missingEvidence = record.packetRevision !== undefined || hasHistory;
      const packet =
        record.packetRevision !== undefined || hasHistory
          ? parsePacketShard(
              rows.get(shardKey(id, record.packetRevision)),
              id,
              record.packetUpdatedAt,
              record.packetRevision
            )
          : null;
      records[id] = {
        ...record,
        packet: packet ?? config.missingPacket(entry),
        ...(!packet && missingEvidence
          ? {
              packetFailure: `Certification packet ${id} shard is missing or invalid.`,
            }
          : {}),
      };
    }
    return { ledger: { ...hot, records }, inlineBacklog };
  }
  return { writePacketShard, serializeHotLedger, hydrateLedger };
}
