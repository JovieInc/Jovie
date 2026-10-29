import { z } from 'zod';

export const COPY_VERDICTS = ['sucks', 'meh', 'great'] as const;
export type CopyVerdict = (typeof COPY_VERDICTS)[number];

export const COPY_VERDICT_SOURCES = [
  'ovie-tap',
  'ovie-voice',
  'imessage',
] as const;
export type CopyVerdictSource = (typeof COPY_VERDICT_SOURCES)[number];

export const copyVerdictInputSchema = z
  .object({
    copyId: z.string().regex(/^[A-Z]+-\d+$/),
    verdict: z.enum(COPY_VERDICTS),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

export interface CopyVerdictEntry {
  readonly verdict: CopyVerdict;
  readonly note: string;
  readonly by: string;
  readonly source: CopyVerdictSource;
  readonly at: string;
  /** The text that was on the page when it was judged. */
  readonly text: string;
}

/** Latest verdict for one line, plus its short history (newest first). */
export interface CopyVerdictRecord extends CopyVerdictEntry {
  readonly copyId: string;
  readonly history: readonly CopyVerdictEntry[];
}

export const COPY_VERDICT_HISTORY_CAP = 20;
export const COPY_VERDICT_PREFIX = 'copy-jam/verdict/';

export interface CopyJamStats {
  readonly total: number;
  readonly reviewed: number;
  readonly great: number;
  readonly meh: number;
  readonly sucks: number;
  /** Share of reviewed lines whose latest verdict is great, 0..1. */
  readonly greatShare: number | null;
}

export function computeStats(
  total: number,
  records: readonly Pick<CopyVerdictRecord, 'verdict'>[]
): CopyJamStats {
  const count = (v: CopyVerdict) => records.filter(r => r.verdict === v).length;
  const reviewed = records.length;
  const great = count('great');
  return {
    total,
    reviewed,
    great,
    meh: count('meh'),
    sucks: count('sucks'),
    greatShare: reviewed === 0 ? null : great / reviewed,
  };
}

/**
 * Rewrite to re-rated-great rate: of lines judged sucks/meh whose text has
 * since changed and been judged again, the share now rated great. Null until
 * a rewrite has been re-rated.
 */
export function rewriteRatedGreatRate(
  records: readonly Pick<CopyVerdictRecord, 'verdict' | 'history' | 'text'>[]
): { rerated: number; great: number; rate: number | null } {
  let rerated = 0;
  let great = 0;
  for (const record of records) {
    const rewritten = record.history.some(
      h =>
        (h.verdict === 'sucks' || h.verdict === 'meh') && h.text !== record.text
    );
    if (!rewritten) continue;
    rerated += 1;
    if (record.verdict === 'great') great += 1;
  }
  return { rerated, great, rate: rerated === 0 ? null : great / rerated };
}
