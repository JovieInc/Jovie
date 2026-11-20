import type { AdmissionScore } from '@/lib/waitlist/admission-score';

export interface RankedQueueRow {
  readonly entryId: string;
  readonly artistName: string | null;
  readonly status: string;
  readonly waitlistedAt: string | null;
  /** Null for entries queued before scoring existed; they sort last. */
  readonly score: number | null;
  readonly components: AdmissionScore['components'] | null;
  readonly unmeasured: readonly string[];
  readonly followers: number | null;
  readonly holdReason: string | null;
}

export interface RankedQueue {
  readonly rows: readonly RankedQueueRow[];
  readonly capacity: {
    readonly dailyLimit: number;
    readonly usedToday: number;
    readonly autoAcceptEnabled: boolean;
  };
}

/** Parse the stored admission score defensively; anything malformed is unscored. */
export function readAdmissionScore(inputs: unknown): AdmissionScore | null {
  if (typeof inputs !== 'object' || inputs === null) return null;
  const raw = (inputs as Record<string, unknown>).admissionScore;
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Partial<AdmissionScore>;
  if (
    typeof candidate.score !== 'number' ||
    !Number.isFinite(candidate.score) ||
    typeof candidate.components !== 'object' ||
    candidate.components === null
  ) {
    return null;
  }
  return candidate as AdmissionScore;
}

/** Best score first; unscored last; ties by longest waiting. */
export function compareRankedRows(
  a: Pick<RankedQueueRow, 'score' | 'waitlistedAt'>,
  b: Pick<RankedQueueRow, 'score' | 'waitlistedAt'>
): number {
  const scoreA = a.score ?? -1;
  const scoreB = b.score ?? -1;
  if (scoreA !== scoreB) return scoreB - scoreA;
  return (a.waitlistedAt ?? '').localeCompare(b.waitlistedAt ?? '');
}
