import {
  type CertificationAuditEvent,
  type CertificationReviewPacket,
  evaluateCertificationAdmission,
  type FounderCertificationDecision,
  type FounderCertificationDecisionKind,
  JOVIE_CERTIFICATION_CONTRACT,
  type RecordFounderCertificationDecisionResult,
  recordFounderCertificationDecision,
} from '@/lib/agent-os/certification';
import {
  isPersistedAuditEvent,
  isPersistedFounderDecision,
} from '@/lib/agent-os/certification-adapter';
import {
  CERTIFICATION_PERSISTENCE_TTL_SECONDS,
  type CertificationRecordBackend,
  mutateCertificationRecord,
} from '@/lib/agent-os/certification-cas';
import type { OvieCertificationDomainId } from './types';

/**
 * Founder decisions for packet-shaped domains — committed packet files and
 * derived projections such as the feature registry. Decisions are
 * revision-bound kernel records persisted with the same CAS mechanics as the
 * marketing and acquisition adapters (one key per domain).
 */
export const PACKET_DECISION_LEDGER_SCHEMA_VERSION = 1 as const;

export function packetDecisionLedgerKey(
  domain: OvieCertificationDomainId
): string {
  return `jovie:certification:v1:packet-decisions:${domain}`;
}

export interface PacketDecisionRecord {
  readonly decisions: readonly FounderCertificationDecision[];
  readonly auditHistory: readonly CertificationAuditEvent[];
  readonly updatedAt: string;
}

export interface PacketDecisionLedger {
  readonly schemaVersion: typeof PACKET_DECISION_LEDGER_SCHEMA_VERSION;
  readonly contract: typeof JOVIE_CERTIFICATION_CONTRACT;
  readonly domain: OvieCertificationDomainId;
  readonly records: Readonly<Record<string, PacketDecisionRecord>>;
}

export class PacketDecisionPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PacketDecisionPersistenceError';
  }
}

function emptyLedger(domain: OvieCertificationDomainId): PacketDecisionLedger {
  return {
    schemaVersion: PACKET_DECISION_LEDGER_SCHEMA_VERSION,
    contract: JOVIE_CERTIFICATION_CONTRACT,
    domain,
    records: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parsePacketDecisionLedger(
  raw: unknown,
  domain: OvieCertificationDomainId
): PacketDecisionLedger {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new PacketDecisionPersistenceError(
        `Decision ledger for ${domain} is not valid JSON.`
      );
    }
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== PACKET_DECISION_LEDGER_SCHEMA_VERSION ||
    value.contract !== JOVIE_CERTIFICATION_CONTRACT ||
    value.domain !== domain ||
    !isRecord(value.records)
  ) {
    throw new PacketDecisionPersistenceError(
      `Decision ledger for ${domain} has an unexpected shape.`
    );
  }
  for (const [subjectId, record] of Object.entries(value.records)) {
    if (
      !isRecord(record) ||
      !Array.isArray(record.decisions) ||
      !record.decisions.every(d => isPersistedFounderDecision(d, subjectId)) ||
      !Array.isArray(record.auditHistory) ||
      !record.auditHistory.every(e => isPersistedAuditEvent(e, subjectId)) ||
      typeof record.updatedAt !== 'string' ||
      Number.isNaN(Date.parse(record.updatedAt))
    ) {
      throw new PacketDecisionPersistenceError(
        `Decision ledger record ${domain}:${subjectId} is invalid.`
      );
    }
  }
  return value as unknown as PacketDecisionLedger;
}

/** Read-only: an absent ledger is an empty one and is never created here. */
export async function readPacketDecisionLedger(
  backend: CertificationRecordBackend,
  domain: OvieCertificationDomainId
): Promise<PacketDecisionLedger> {
  const raw = await backend.get(packetDecisionLedgerKey(domain));
  if (raw === null || raw === undefined) return emptyLedger(domain);
  return parsePacketDecisionLedger(raw, domain);
}

export type RecordPacketFounderDecisionResult =
  | RecordFounderCertificationDecisionResult
  | {
      readonly ok: false;
      readonly reason: 'decision_predates_packet';
    };

export interface PacketDecisionTarget {
  readonly domain: OvieCertificationDomainId;
  readonly packet: CertificationReviewPacket;
  readonly packetUpdatedAt: string;
}

export async function recordPacketFounderDecision(input: {
  readonly backend: CertificationRecordBackend;
  readonly target: PacketDecisionTarget;
  readonly decision: {
    readonly id: string;
    readonly decision: FounderCertificationDecisionKind;
    readonly evidenceDigest: string;
    readonly notes: string | null;
    readonly reviewer: string;
  };
  readonly decidedAt?: string;
}): Promise<RecordPacketFounderDecisionResult> {
  const { backend, target } = input;
  const domain = target.domain;
  const subjectId = target.packet.subject.id;
  const decidedAt = input.decidedAt ?? new Date().toISOString();
  if (Date.parse(decidedAt) < Date.parse(target.packetUpdatedAt)) {
    return { ok: false, reason: 'decision_predates_packet' };
  }
  const key = packetDecisionLedgerKey(domain);

  return mutateCertificationRecord<
    PacketDecisionLedger,
    RecordPacketFounderDecisionResult
  >({
    backend,
    key,
    initialize: () =>
      backend.setIfAbsent(
        key,
        JSON.stringify(emptyLedger(domain)),
        CERTIFICATION_PERSISTENCE_TTL_SECONDS
      ),
    parse: raw => parsePacketDecisionLedger(raw, domain),
    validate: () => undefined,
    error: message => new PacketDecisionPersistenceError(message),
    update: ledger => {
      const existing = ledger.records[subjectId] ?? {
        decisions: [],
        auditHistory: [],
        updatedAt: decidedAt,
      };
      // Replay protection spans the domain: an action id is used once.
      const replayed = Object.values(ledger.records).some(record =>
        record.decisions.some(decision => decision.id === input.decision.id)
      );
      if (replayed) {
        return {
          ledger,
          result: {
            ok: false,
            reason: 'duplicate_founder_decision',
            admission: evaluateCertificationAdmission({
              packet: target.packet,
              decisions: existing.decisions,
              evaluatedAt: decidedAt,
            }),
            blockers: [
              {
                code: 'duplicate_founder_decision',
                tier: 'decision',
                id: input.decision.id,
                summary: 'This action id has already been recorded.',
              },
            ],
          },
        };
      }
      const recorded = recordFounderCertificationDecision({
        decidedAt,
        packet: target.packet,
        existingDecisions: existing.decisions,
        decision: input.decision,
      });
      if (!recorded.ok) return { ledger, result: recorded };

      const nextRecord: PacketDecisionRecord = {
        decisions: recorded.decisions,
        auditHistory: [
          ...existing.auditHistory,
          ...recorded.admission.auditHistory,
        ],
        updatedAt: decidedAt,
      };
      return {
        ledger: {
          ...ledger,
          records: { ...ledger.records, [subjectId]: nextRecord },
        },
        result: recorded,
      };
    },
  });
}
