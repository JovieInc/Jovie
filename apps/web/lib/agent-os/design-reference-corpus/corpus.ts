import { createHash } from 'node:crypto';

import type { CertificationEvidenceReceipt } from '@/lib/agent-os/certification';
import {
  type CandidateEntryKind,
  type CorpusCandidateEntry,
  type CorpusEntryStatus,
  type CorpusReferenceRecord,
  DESIGN_REFERENCE_CORPUS_SCHEMA,
  type DesignReference,
  type DesignReferenceCorpus,
  DesignReferenceCorpusSchema,
  DesignReferenceSchema,
  type DesignReferenceSection,
  type DesignReferenceVariable,
  type FounderCritique,
  FounderCritiqueSchema,
  type FounderDecisionRecord,
  FounderDecisionRecordSchema,
  type FounderReferenceDecision,
} from './types';

interface StableObject {
  readonly [key: string]: StableValue;
}

type StableValue =
  | string
  | number
  | boolean
  | null
  | readonly StableValue[]
  | StableObject;

function stableSerialize(value: StableValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableSerialize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function designReferenceCorpusDigest(value: StableObject): string {
  return `sha256:${createHash('sha256')
    .update(stableSerialize(value))
    .digest('hex')}`;
}

export function createDesignReferenceCorpus(
  now: string
): DesignReferenceCorpus {
  return {
    schema: DESIGN_REFERENCE_CORPUS_SCHEMA,
    references: {},
    candidates: {},
    critiques: [],
    updatedAt: now,
  };
}

export function parseDesignReferenceCorpus(
  raw: unknown
): DesignReferenceCorpus {
  return DesignReferenceCorpusSchema.parse(raw);
}

export function serializeDesignReferenceCorpus(
  corpus: DesignReferenceCorpus
): string {
  return JSON.stringify(parseDesignReferenceCorpus(corpus));
}

export function ingestDesignReference(
  corpus: DesignReferenceCorpus,
  reference: DesignReference,
  now: string
): DesignReferenceCorpus {
  const parsed = DesignReferenceSchema.parse(reference);
  if (corpus.references[parsed.id]) {
    throw new Error(`Design reference ${parsed.id} is already ingested.`);
  }
  const record: CorpusReferenceRecord = {
    reference: parsed,
    status: 'proposed',
    founderDecision: null,
    certifiedAt: null,
  };
  return {
    ...corpus,
    references: { ...corpus.references, [parsed.id]: record },
    updatedAt: now,
  };
}

export function proposeCandidateEntry(
  corpus: DesignReferenceCorpus,
  input: {
    readonly id: string;
    readonly kind: CandidateEntryKind;
    readonly statement: string;
    readonly designVariable?: DesignReferenceVariable | null;
    readonly pageType?: string | null;
    readonly derivedFrom: CorpusCandidateEntry['derivedFrom'];
    readonly proposedAt: string;
  }
): DesignReferenceCorpus {
  if (corpus.candidates[input.id]) {
    throw new Error(`Candidate entry ${input.id} already exists.`);
  }
  for (const evidence of input.derivedFrom) {
    const record = corpus.references[evidence.referenceId];
    if (!record) {
      throw new Error(
        `Candidate entry ${input.id} cites unknown reference ${evidence.referenceId}.`
      );
    }
    if (
      evidence.sectionId !== null &&
      !record.reference.sections.some(
        section => section.id === evidence.sectionId
      )
    ) {
      throw new Error(
        `Candidate entry ${input.id} cites unknown section ${evidence.sectionId} on reference ${evidence.referenceId}.`
      );
    }
  }
  const entry: CorpusCandidateEntry = {
    id: input.id,
    kind: input.kind,
    statement: input.statement,
    designVariable: input.designVariable ?? null,
    pageType: input.pageType ?? null,
    derivedFrom: input.derivedFrom,
    status: 'proposed',
    founderDecision: null,
    proposedAt: input.proposedAt,
    certifiedAt: null,
  };
  return {
    ...corpus,
    candidates: { ...corpus.candidates, [input.id]: entry },
    updatedAt: input.proposedAt,
  };
}

function buildDecision(input: {
  readonly id: string;
  readonly decision: FounderReferenceDecision;
  readonly reviewer: string;
  readonly rationale: string;
  readonly nuance?: string | null;
  readonly decidedAt: string;
}): FounderDecisionRecord {
  const record = FounderDecisionRecordSchema.parse({
    id: input.id,
    decision: input.decision,
    reviewer: input.reviewer,
    rationale: input.rationale,
    nuance: input.nuance ?? null,
    decidedAt: input.decidedAt,
  });
  if (record.decision === 'nuanced' && record.nuance === null) {
    throw new Error(
      `Founder decision ${record.id} is nuanced and requires nuance text.`
    );
  }
  return record;
}

function statusForDecision(
  decision: FounderReferenceDecision
): CorpusEntryStatus {
  if (decision === 'rejected') return 'rejected';
  return 'certified';
}

export interface FounderDecisionInput {
  readonly id: string;
  readonly decision: FounderReferenceDecision;
  readonly reviewer: string;
  readonly rationale: string;
  readonly nuance?: string | null;
  readonly decidedAt: string;
}

/**
 * Applies a founder decision to an ingested reference. `approved` and
 * `nuanced` certify the reference (nuance text is preserved); `rejected`
 * marks it rejected. Scraped/expert material can never certify itself — it
 * must pass through this function.
 */
export function recordFounderReferenceDecision(
  corpus: DesignReferenceCorpus,
  referenceId: string,
  decision: FounderDecisionInput
): DesignReferenceCorpus {
  const record = corpus.references[referenceId];
  if (!record) {
    throw new Error(`Unknown design reference ${referenceId}.`);
  }
  if (record.status === 'certified') {
    throw new Error(
      `Design reference ${referenceId} is certified; decertify before a new decision.`
    );
  }
  const parsed = buildDecision(decision);
  const next: CorpusReferenceRecord = {
    ...record,
    status: statusForDecision(parsed.decision),
    founderDecision: parsed,
    certifiedAt:
      parsed.decision === 'rejected' ? record.certifiedAt : parsed.decidedAt,
  };
  return {
    ...corpus,
    references: { ...corpus.references, [referenceId]: next },
    updatedAt: parsed.decidedAt,
  };
}

/**
 * Applies a founder decision to a candidate invariant/preference. Candidates
 * are never promoted without an explicit founder decision.
 */
export function recordFounderCandidateDecision(
  corpus: DesignReferenceCorpus,
  candidateId: string,
  decision: FounderDecisionInput
): DesignReferenceCorpus {
  const entry = corpus.candidates[candidateId];
  if (!entry) {
    throw new Error(`Unknown candidate entry ${candidateId}.`);
  }
  if (entry.status === 'certified') {
    throw new Error(
      `Candidate entry ${candidateId} is certified; decertify before a new decision.`
    );
  }
  const parsed = buildDecision(decision);
  const next: CorpusCandidateEntry = {
    ...entry,
    status: statusForDecision(parsed.decision),
    founderDecision: parsed,
    certifiedAt:
      parsed.decision === 'rejected' ? entry.certifiedAt : parsed.decidedAt,
  };
  return {
    ...corpus,
    candidates: { ...corpus.candidates, [candidateId]: next },
    updatedAt: parsed.decidedAt,
  };
}

export function decertifyReference(
  corpus: DesignReferenceCorpus,
  referenceId: string,
  now: string
): DesignReferenceCorpus {
  const record = corpus.references[referenceId];
  if (!record) throw new Error(`Unknown design reference ${referenceId}.`);
  return {
    ...corpus,
    references: {
      ...corpus.references,
      [referenceId]: { ...record, status: 'decertified', certifiedAt: null },
    },
    updatedAt: now,
  };
}

export function decertifyCandidate(
  corpus: DesignReferenceCorpus,
  candidateId: string,
  now: string
): DesignReferenceCorpus {
  const entry = corpus.candidates[candidateId];
  if (!entry) throw new Error(`Unknown candidate entry ${candidateId}.`);
  return {
    ...corpus,
    candidates: {
      ...corpus.candidates,
      [candidateId]: { ...entry, status: 'decertified', certifiedAt: null },
    },
    updatedAt: now,
  };
}

/**
 * Records a free-form founder critique from a rapid (voice) review pass.
 * The raw critique text is retained verbatim; verdict and the optional A/B
 * counterpart are structured alongside it. Critiques are evidence — they do
 * not by themselves certify or reject a reference.
 */
export function recordFounderCritique(
  corpus: DesignReferenceCorpus,
  critique: FounderCritique
): DesignReferenceCorpus {
  const parsed = FounderCritiqueSchema.parse(critique);
  if (!corpus.references[parsed.referenceId]) {
    throw new Error(`Critique ${parsed.id} cites unknown reference.`);
  }
  if (
    parsed.comparedAgainstId !== null &&
    !corpus.references[parsed.comparedAgainstId]
  ) {
    throw new Error(`Critique ${parsed.id} cites unknown comparison target.`);
  }
  return {
    ...corpus,
    critiques: [...corpus.critiques, parsed],
    updatedAt: parsed.recordedAt,
  };
}

export interface CertifiedReferenceQuery {
  readonly pageType?: string;
  readonly designVariable?: DesignReferenceVariable;
  readonly sectionId?: string;
}

function sectionMatches(
  section: DesignReferenceSection,
  query: CertifiedReferenceQuery
): boolean {
  if (query.sectionId && section.id !== query.sectionId) return false;
  if (query.designVariable && section.designVariable !== query.designVariable) {
    return false;
  }
  return !(query.pageType && section.pageType !== query.pageType);
}

/**
 * Returns founder-certified references whose sections match the query.
 * Rejected, proposed, and decertified records never appear here; generation
 * retrieval uses this as its only source of approved design references.
 */
export function queryCertifiedReferences(
  corpus: DesignReferenceCorpus,
  query: CertifiedReferenceQuery = {}
): readonly CorpusReferenceRecord[] {
  return Object.values(corpus.references)
    .filter(record => record.status === 'certified')
    .filter(record =>
      query.pageType ? record.reference.pageType === query.pageType : true
    )
    .map(record =>
      query.designVariable || query.sectionId
        ? {
            ...record,
            reference: {
              ...record.reference,
              sections: record.reference.sections.filter(section =>
                sectionMatches(section, query)
              ),
            },
          }
        : record
    )
    .filter(record => record.reference.sections.length > 0)
    .sort((left, right) => left.reference.id.localeCompare(right.reference.id));
}

export interface CandidateEntryQuery {
  readonly kind?: CandidateEntryKind;
  readonly status?: CorpusEntryStatus;
  readonly designVariable?: DesignReferenceVariable;
  readonly pageType?: string;
}

export function queryCandidateEntries(
  corpus: DesignReferenceCorpus,
  query: CandidateEntryQuery = {}
): readonly CorpusCandidateEntry[] {
  return Object.values(corpus.candidates)
    .filter(entry => (query.kind ? entry.kind === query.kind : true))
    .filter(entry => (query.status ? entry.status === query.status : true))
    .filter(entry =>
      query.designVariable
        ? entry.designVariable === query.designVariable
        : true
    )
    .filter(entry =>
      query.pageType ? entry.pageType === query.pageType : true
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

export interface FounderReviewItem {
  readonly kind: 'reference' | CandidateEntryKind;
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly pageType: string | null;
  readonly designVariable: DesignReferenceVariable | null;
  readonly prompt: string;
}

/**
 * Builds the rapid founder review queue: one uncertified reference or
 * proposed candidate at a time. Ordering is stable so a review session can
 * resume where it left off.
 */
export function buildFounderReviewQueue(
  corpus: DesignReferenceCorpus
): readonly FounderReviewItem[] {
  const references: FounderReviewItem[] = Object.values(corpus.references)
    .filter(record => record.status === 'proposed')
    .map(record => ({
      kind: 'reference',
      id: record.reference.id,
      title: record.reference.source.title,
      summary: record.reference.sections
        .map(section => `${section.designVariable}: ${section.summary}`)
        .join(' '),
      pageType: record.reference.pageType,
      designVariable: null,
      prompt: `Review "${record.reference.source.title}" (${record.reference.pageType}). What works, what fails, and why?`,
    }));
  const candidates: FounderReviewItem[] = Object.values(corpus.candidates)
    .filter(entry => entry.status === 'proposed')
    .map(entry => ({
      kind: entry.kind,
      id: entry.id,
      title: entry.statement,
      summary: entry.derivedFrom
        .map(
          evidence =>
            `${evidence.referenceId}${evidence.sectionId ? `#${evidence.sectionId}` : ''}: ${evidence.evidence}`
        )
        .join(' '),
      pageType: entry.pageType,
      designVariable: entry.designVariable,
      prompt: `Candidate ${entry.kind}: "${entry.statement}". Approve, reject, or add nuance?`,
    }));
  return [...references, ...candidates].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
}

/**
 * Projects a certified reference into a `jovie.certification/v1`
 * `canonical_references` evidence receipt. Callers must bind the receipt to
 * the packet's canonical source SHA; uncertified records cannot project.
 */
export function certifiedReferenceToReceipt(
  record: CorpusReferenceRecord,
  input: { readonly receiptId: string; readonly sourceSha: string }
): CertificationEvidenceReceipt {
  if (record.status !== 'certified') {
    throw new Error(
      `Design reference ${record.reference.id} is not founder-certified.`
    );
  }
  return {
    id: input.receiptId,
    tier: 'canonical_references',
    status: 'passed',
    sourceSha: input.sourceSha,
    ref: `design-reference-corpus:${record.reference.id}`,
    digest: designReferenceCorpusDigest({ record }),
    summary: `Certified design reference "${record.reference.source.title}" (${record.reference.pageType}).`,
  };
}
