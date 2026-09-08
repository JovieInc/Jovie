import 'server-only';

import { createHash } from 'node:crypto';
import {
  buildCertificationDecisionDigest,
  type CertificationReviewPacket,
  evaluateCertificationAdmission,
  type FounderCertificationDecision,
  recordFounderCertificationDecision,
} from '@/lib/agent-os/certification';
import {
  CERTIFICATION_PERSISTENCE_TTL_SECONDS,
  type CertificationRecordBackend,
  mutateCertificationRecord,
} from '@/lib/agent-os/certification-cas';

export interface AcquisitionCertificationCandidate {
  readonly subjectId: string;
  readonly leadId: string;
  readonly runId: string;
  readonly profileId: string;
  /** Immutable domain revision; never an evaluator commit SHA. */
  readonly revision: string;
  readonly sourceRef: string;
  readonly displayName: string;
  readonly profileUrl: string;
  readonly claimUrl: string;
  readonly qualificationRef: string;
  readonly requestedScope: string;
  readonly observedAt: string;
  readonly expiresAt: string;
  readonly packet: CertificationReviewPacket;
}

export interface AcquisitionDecisionRequest {
  readonly subjectId: string;
  readonly revision: string;
  readonly evidenceDigest: string;
  readonly actionId: string;
  readonly decision: 'approved' | 'rejected';
  readonly notes: string | null;
}

export interface AcquisitionDecisionReceipt {
  readonly payloadDigest: string;
  readonly revision: string;
  readonly scope: string;
  readonly decision: FounderCertificationDecision;
  readonly dispatch: {
    readonly key: string;
    readonly status: 'pending' | 'complete';
    readonly effectReceipt: string | null;
  };
}

interface AcquisitionCertificationRecord {
  readonly contract: 'jovie.certification/v1';
  readonly subjectId: string;
  readonly receipts: readonly AcquisitionDecisionReceipt[];
}

/** Server integrations must supply these guarantees before any action is exposed. */
export interface AcquisitionCertificationPorts {
  /** Hold/recheck the canonical domain revision through the operation's writes. */
  withCurrentCandidate<T>(
    subjectId: string,
    operation: (candidate: AcquisitionCertificationCandidate) => Promise<T>
  ): Promise<T>;
  /** Resolve authenticated actor and authority on server; never take actor from request. */
  authorize(
    candidate: AcquisitionCertificationCandidate,
    decision: AcquisitionDecisionRequest['decision']
  ): Promise<string | null>;
  readonly effect: {
    /** The domain owns durable dedupe, including crashes after applying its effect. */
    readonly idempotency: 'durable-action-key-and-payload-digest';
    execute(input: {
      candidate: AcquisitionCertificationCandidate;
      receipt: AcquisitionDecisionReceipt;
    }): Promise<string>;
  } | null;
  now(): string;
}

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function subjectKey(subjectId: string): string {
  if (
    !/^acquisition:premade-artist-profile:[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$/.test(
      subjectId
    )
  ) {
    throw new Error('Wrong acquisition certification identity.');
  }
  return `jovie:certification:v1:${subjectId}`;
}

function bindCandidate(
  candidate: AcquisitionCertificationCandidate
): CertificationReviewPacket {
  subjectKey(candidate.subjectId);
  if (
    candidate.subjectId !==
      `acquisition:premade-artist-profile:${candidate.leadId}:${candidate.runId}` ||
    candidate.packet.subject.id !== candidate.subjectId ||
    candidate.packet.subject.kind !== 'acquisition-premade-artist-profile'
  ) {
    throw new Error('Candidate and certification domain identities disagree.');
  }
  // This binds actual candidate contents/scope, not a substitute machine proof.
  const binding = digest([
    candidate.subjectId,
    candidate.leadId,
    candidate.runId,
    candidate.profileId,
    candidate.revision,
    candidate.sourceRef,
    candidate.displayName,
    candidate.profileUrl,
    candidate.claimUrl,
    candidate.qualificationRef,
    candidate.requestedScope,
    candidate.observedAt,
    candidate.expiresAt,
  ]);
  return {
    ...candidate.packet,
    canonicalReferences: [
      ...candidate.packet.canonicalReferences,
      {
        id: 'acquisition-candidate-binding',
        tier: 'canonical_references',
        status: 'passed',
        sourceSha: candidate.packet.source?.sha ?? null,
        ref: candidate.sourceRef,
        digest: binding,
        summary: candidate.requestedScope,
      },
    ],
  };
}

function projectCandidate(
  candidate: AcquisitionCertificationCandidate,
  now: string,
  receipts: readonly AcquisitionDecisionReceipt[]
) {
  const packet = bindCandidate(candidate);
  const missing: string[] = [];
  for (const key of [
    'leadId',
    'runId',
    'profileId',
    'revision',
    'sourceRef',
    'displayName',
    'profileUrl',
    'claimUrl',
    'qualificationRef',
    'requestedScope',
  ] as const) {
    if (!candidate[key]?.trim()) missing.push(key);
  }
  const time = Date.parse(now);
  const observed = Date.parse(candidate.observedAt);
  const expires = Date.parse(candidate.expiresAt);
  if (
    !Number.isFinite(time) ||
    !Number.isFinite(observed) ||
    !Number.isFinite(expires) ||
    observed > time ||
    expires <= time ||
    expires <= observed
  )
    missing.push('fresh_evidence');
  if (candidate.packet.canonicalReferences.length === 0)
    missing.push('canonical_candidate_evidence');
  const evidence = [
    ...candidate.packet.canonicalReferences,
    ...candidate.packet.invariantEvaluation,
    ...candidate.packet.testsCoverage,
    ...candidate.packet.visualProof,
  ];
  if (
    evidence.some(
      item =>
        !item.digest?.trim() || !item.ref.trim() || !item.sourceSha?.trim()
    )
  )
    missing.push('immutable_machine_receipts');
  if (
    candidate.packet.canonicalReferences.some(
      item => item.id === 'acquisition-candidate-binding'
    )
  )
    missing.push('reserved_binding');
  const admission = evaluateCertificationAdmission({
    packet,
    decisions: receipts.map(item => item.decision),
    evaluatedAt: now,
  });
  missing.push(...admission.blockers.map(item => item.code));
  return {
    packet,
    state: missing.length ? ('working' as const) : admission.state,
    missing,
    evidenceDigest: buildCertificationDecisionDigest(packet),
    canCertify: missing.length === 0 && admission.state === 'review_ready',
    receipts,
  };
}

function parseRecord(raw: unknown): AcquisitionCertificationRecord {
  if (typeof raw !== 'string')
    throw new Error('Invalid acquisition certification record.');
  const value: AcquisitionCertificationRecord = JSON.parse(raw);
  if (
    value?.contract !== 'jovie.certification/v1' ||
    !Array.isArray(value.receipts)
  )
    throw new Error('Invalid acquisition certification record.');
  subjectKey(value.subjectId);
  const ids = new Set<string>();
  for (const receipt of value.receipts) {
    if (
      !receipt.decision?.id ||
      receipt.decision.subjectId !== value.subjectId ||
      ids.has(receipt.decision.id) ||
      !receipt.payloadDigest ||
      !receipt.revision ||
      !receipt.scope ||
      !receipt.decision.evidenceDigest ||
      !receipt.decision.reviewer ||
      !Number.isFinite(Date.parse(receipt.decision.decidedAt)) ||
      !['approved', 'rejected'].includes(receipt.decision.decision) ||
      receipt.dispatch?.key !== `${value.subjectId}:${receipt.decision.id}` ||
      !['pending', 'complete'].includes(receipt.dispatch.status) ||
      (receipt.dispatch.status === 'complete' &&
        !receipt.dispatch.effectReceipt)
    )
      throw new Error('Invalid acquisition decision receipt.');
    ids.add(receipt.decision.id);
  }
  return value;
}

/** Source adapter only: no route exposes this before a trusted producer/effect exists. */
export class AcquisitionCertificationStore {
  constructor(
    private readonly backend: CertificationRecordBackend,
    private readonly ports: AcquisitionCertificationPorts
  ) {}

  private async mutate<T>(
    subjectId: string,
    update: (record: AcquisitionCertificationRecord) => {
      ledger: AcquisitionCertificationRecord;
      result: T;
    }
  ) {
    const key = subjectKey(subjectId);
    return mutateCertificationRecord({
      backend: this.backend,
      key,
      initialize: () =>
        this.backend.setIfAbsent(
          key,
          JSON.stringify({
            contract: 'jovie.certification/v1',
            subjectId,
            receipts: [],
          }),
          CERTIFICATION_PERSISTENCE_TTL_SECONDS
        ),
      parse: parseRecord,
      validate: record => {
        if (record.subjectId !== subjectId)
          throw new Error('Wrong persisted acquisition subject.');
      },
      update,
      error: message => new Error(message),
    });
  }

  async project(subjectId: string) {
    subjectKey(subjectId);
    return this.ports.withCurrentCandidate(subjectId, async candidate => {
      if (candidate.subjectId !== subjectId)
        throw new Error('Wrong source candidate.');
      const raw = await this.backend.get(subjectKey(subjectId));
      const record = raw == null ? null : parseRecord(raw);
      if (record && record.subjectId !== subjectId)
        throw new Error('Wrong persisted acquisition subject.');
      const projection = projectCandidate(
        candidate,
        this.ports.now(),
        record?.receipts ?? []
      );
      if (!this.ports.effect) {
        return {
          ...projection,
          state: 'working' as const,
          canCertify: false,
          missing: [...projection.missing, 'idempotent_domain_effect'],
        };
      }
      return projection;
    });
  }

  async decide(
    request: AcquisitionDecisionRequest
  ): Promise<AcquisitionDecisionReceipt> {
    subjectKey(request.subjectId);
    if (
      !/^[a-zA-Z0-9_-]{1,128}$/.test(request.actionId) ||
      !['approved', 'rejected'].includes(request.decision) ||
      (request.notes !== null && typeof request.notes !== 'string') ||
      (request.decision === 'rejected' && !request.notes?.trim())
    )
      throw new Error('Invalid decision request.');
    return this.ports.withCurrentCandidate(
      request.subjectId,
      async candidate => {
        if (candidate.subjectId !== request.subjectId)
          throw new Error('Wrong source candidate.');
        const actor = await this.ports.authorize(candidate, request.decision);
        if (!actor?.trim())
          throw new Error('Acquisition decision authority denied.');
        const effect = this.ports.effect;
        if (
          !effect ||
          effect.idempotency !== 'durable-action-key-and-payload-digest'
        )
          throw new Error('No idempotent acquisition effect.');
        const payloadDigest = digest([
          request.subjectId,
          request.revision,
          request.evidenceDigest,
          request.actionId,
          request.decision,
          request.notes,
          actor,
        ]);
        const receipt = await this.mutate(request.subjectId, record => {
          const previous = record.receipts.find(
            item => item.decision.id === request.actionId
          );
          if (previous && previous.payloadDigest !== payloadDigest)
            throw new Error('Conflicting duplicate action.');
          if (previous?.dispatch.status === 'complete')
            return { ledger: record, result: previous };
          const now = this.ports.now();
          // Pending retries must still match fresh, authoritative candidate evidence.
          const projection = projectCandidate(
            candidate,
            now,
            previous ? [] : record.receipts
          );
          if (
            request.revision !== candidate.revision ||
            request.evidenceDigest !== projection.evidenceDigest
          )
            throw new Error('Stale candidate revision or evidence digest.');
          if (!projection.canCertify)
            throw new Error(
              `Candidate is unqualified: ${projection.missing.join(',')}`
            );
          if (previous) return { ledger: record, result: previous };
          const decision = recordFounderCertificationDecision({
            packet: projection.packet,
            existingDecisions: record.receipts.map(item => item.decision),
            decidedAt: now,
            decision: {
              id: request.actionId,
              decision: request.decision,
              evidenceDigest: request.evidenceDigest,
              reviewer: actor,
              notes: request.notes,
            },
          });
          if (!decision.ok) throw new Error(decision.reason);
          const next: AcquisitionDecisionReceipt = {
            payloadDigest,
            revision: candidate.revision,
            scope: candidate.requestedScope,
            decision: decision.decision,
            dispatch: {
              key: `${request.subjectId}:${request.actionId}`,
              status: 'pending',
              effectReceipt: null,
            },
          };
          return {
            ledger: { ...record, receipts: [...record.receipts, next] },
            result: next,
          };
        });
        if (receipt.dispatch.status === 'complete') return receipt;
        // At least once: a crash here must be deduped by the owning domain effect.
        const effectReceipt = await effect.execute({ candidate, receipt });
        if (!effectReceipt.trim())
          throw new Error('Domain effect supplied no durable receipt.');
        return this.mutate(request.subjectId, record => {
          const stored = record.receipts.find(
            item => item.decision.id === request.actionId
          );
          if (!stored || stored.payloadDigest !== payloadDigest)
            throw new Error('Decision receipt changed during dispatch.');
          if (stored.dispatch.status === 'complete')
            return { ledger: record, result: stored };
          const completed: AcquisitionDecisionReceipt = {
            ...stored,
            dispatch: { ...stored.dispatch, status: 'complete', effectReceipt },
          };
          return {
            ledger: {
              ...record,
              receipts: record.receipts.map(item =>
                item === stored ? completed : item
              ),
            },
            result: completed,
          };
        });
      }
    );
  }
}
