import type {
  RecordFileThreadClassification,
  RecordFileThreadMetadata,
} from './classify';
import {
  RECORD_FILE_REGISTRATION_LABELS,
  RECORD_FILE_REGISTRATION_TARGETS,
  type RecordFilePersonRole,
  type RecordFileRegistrationTarget,
} from './taxonomy';

export const RECORD_FILE_GAP_KINDS = [
  'agreement_unsigned',
  'wrong_artist_credit',
  'missing_registration',
  'unknown_vocalist_credit',
] as const;
export type RecordFileGapKind = (typeof RECORD_FILE_GAP_KINDS)[number];

export type RecordFileGapSeverity = 'high' | 'medium';

export interface RecordFileGap {
  readonly kind: RecordFileGapKind;
  readonly severity: RecordFileGapSeverity;
  readonly message: string;
  /** 0..1. Absence-based gaps are capped below thread-backed ones. */
  readonly confidence: number;
  /** Sources the gap was read from; empty when the gap is an absence. */
  readonly sourceRecordIds: readonly string[];
  readonly registrationTarget?: RecordFileRegistrationTarget;
}

export interface ClassifiedRecordFileThread {
  readonly thread: RecordFileThreadMetadata;
  readonly classification: RecordFileThreadClassification;
}

export interface RecordFileGapInput {
  /** ISO date the record came out, if known. */
  readonly releaseDate: string | null;
  readonly threads: readonly ClassifiedRecordFileThread[];
  readonly peopleRoles: readonly RecordFilePersonRole[];
  readonly asOf: Date;
  readonly requiredRegistrations?: readonly RecordFileRegistrationTarget[];
}

function timeOf(date: string | null): number | null {
  if (!date) return null;
  const time = Date.parse(date);
  return Number.isNaN(time) ? null : time;
}

/** True when `later` is not known to be before `earlier`. */
function notBefore(later: string | null, earlier: string | null): boolean {
  const a = timeOf(later);
  const b = timeOf(earlier);
  return a === null || b === null || a >= b;
}

export function compareThreadsByDate(
  a: ClassifiedRecordFileThread,
  b: ClassifiedRecordFileThread
): number {
  const ta = timeOf(a.thread.date);
  const tb = timeOf(b.thread.date);
  if (ta !== tb) {
    if (ta === null) return 1;
    if (tb === null) return -1;
    return ta - tb;
  }
  return a.thread.sourceRecordId.localeCompare(b.thread.sourceRecordId);
}

function hasTag(entry: ClassifiedRecordFileThread, kind: string): boolean {
  return entry.classification.tags.some(tag => tag.kind === kind);
}

function contractGaps(
  threads: readonly ClassifiedRecordFileThread[]
): RecordFileGap[] {
  const groups = new Map<string, ClassifiedRecordFileThread[]>();
  for (const entry of threads) {
    if (!hasTag(entry, 'contract')) continue;
    const key =
      entry.classification.contractKey ??
      `source:${entry.thread.sourceRecordId}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const gaps: RecordFileGap[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort(compareThreadsByDate);
    const first = ordered[0];
    if (!first) continue;
    const states = ordered.flatMap(entry =>
      entry.classification.tags
        .filter(tag => tag.kind === 'contract')
        .map(tag => ({ entry, state: tag.contractState }))
    );
    const signed = states.some(
      ({ entry, state }) =>
        state === 'signed' && notBefore(entry.thread.date, first.thread.date)
    );
    if (signed) continue;
    const explicitlySent = states.some(({ state }) => state === 'sent');
    gaps.push({
      kind: 'agreement_unsigned',
      severity: 'high',
      message: `${first.thread.subject ?? 'An agreement'} was sent with no signed copy back.`,
      confidence: explicitlySent ? 0.8 : 0.6,
      sourceRecordIds: ordered.map(entry => entry.thread.sourceRecordId),
    });
  }
  return gaps;
}

function creditGaps(
  threads: readonly ClassifiedRecordFileThread[]
): RecordFileGap[] {
  const fixes = threads.filter(entry =>
    entry.classification.hints.includes('credit_fixed')
  );
  return threads
    .filter(entry => entry.classification.hints.includes('credit_dispute'))
    .filter(
      dispute =>
        !fixes.some(fix => notBefore(fix.thread.date, dispute.thread.date))
    )
    .map(dispute => ({
      kind: 'wrong_artist_credit' as const,
      severity: 'high' as const,
      message: `${dispute.thread.subject ?? 'A wrong credit'} has no correction on file.`,
      confidence: 0.75,
      sourceRecordIds: [dispute.thread.sourceRecordId],
    }));
}

function registrationGaps(input: RecordFileGapInput): RecordFileGap[] {
  const released = timeOf(input.releaseDate);
  if (released === null || released > input.asOf.getTime()) return [];
  const found = new Set(
    input.threads.flatMap(entry =>
      entry.classification.tags.flatMap(tag =>
        tag.kind === 'registration' && tag.registrationTarget
          ? [tag.registrationTarget]
          : []
      )
    )
  );
  const required =
    input.requiredRegistrations ?? RECORD_FILE_REGISTRATION_TARGETS;
  return required
    .filter(target => !found.has(target))
    .map(target => ({
      kind: 'missing_registration' as const,
      severity: 'medium' as const,
      message: `No ${RECORD_FILE_REGISTRATION_LABELS[target]} registration in the indexed sources.`,
      confidence: 0.6,
      sourceRecordIds: [],
      registrationTarget: target,
    }));
}

function vocalistGaps(input: RecordFileGapInput): RecordFileGap[] {
  if (input.peopleRoles.includes('vocalist')) return [];
  const vocalThreads = input.threads.filter(entry =>
    entry.classification.hints.includes('vocal')
  );
  if (vocalThreads.length === 0) return [];
  return [
    {
      kind: 'unknown_vocalist_credit',
      severity: 'medium',
      message:
        'Vocals are discussed on this record but no vocalist credit is on file yet.',
      confidence: 0.65,
      sourceRecordIds: [...vocalThreads]
        .sort(compareThreadsByDate)
        .map(entry => entry.thread.sourceRecordId),
    },
  ];
}

/**
 * Flags paperwork a record is missing, from tagged thread metadata only.
 * Each gap names the sources it came from so the UI can link back.
 */
export function detectRecordFileGaps(
  input: RecordFileGapInput
): RecordFileGap[] {
  return [
    ...contractGaps(input.threads),
    ...creditGaps(input.threads),
    ...registrationGaps(input),
    ...vocalistGaps(input),
  ];
}
