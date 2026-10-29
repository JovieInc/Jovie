import type { CopyRow } from './inventory';
import type { CopyVerdictRecord } from './verdicts';

export interface AlternativesRecord {
  readonly copyId: string;
  /** The text the alternatives were written against. */
  readonly forText: string;
  readonly alternatives: readonly string[];
  readonly by: string;
  readonly at: string;
  readonly status: 'pending';
}

export interface RewriteTask {
  readonly copyId: string;
  readonly route: string;
  readonly section: string;
  readonly role: string;
  readonly text: string;
  readonly source: string;
  readonly verdict: 'sucks' | 'meh';
  readonly note: string;
}

/**
 * Lines Summer should rewrite: latest verdict is sucks or meh, the text still
 * matches what was judged, and no alternatives are pending for that text.
 */
export function buildRewriteQueue(
  rows: ReadonlyMap<string, CopyRow>,
  verdicts: Iterable<CopyVerdictRecord>,
  alternatives: ReadonlyMap<string, AlternativesRecord>
): RewriteTask[] {
  const tasks: RewriteTask[] = [];
  for (const v of verdicts) {
    if (v.verdict === 'great') continue;
    const row = rows.get(v.copyId);
    if (!row || row.text !== v.text) continue;
    const alt = alternatives.get(v.copyId);
    if (alt && alt.forText === row.text) continue;
    tasks.push({
      copyId: row.id,
      route: row.route,
      section: row.section,
      role: row.role,
      text: row.text,
      source: row.source,
      verdict: v.verdict,
      note: v.note,
    });
  }
  return tasks.sort((a, b) =>
    a.copyId.localeCompare(b.copyId, 'en', { numeric: true })
  );
}

export interface TasteExamples {
  /** Lines Tim called great: positive examples for the judge's voiceSamples. */
  readonly great: ReadonlyArray<{ copyId: string; role: string; text: string }>;
  /** Lines Tim rejected, with his note: what to avoid. */
  readonly avoid: ReadonlyArray<{
    copyId: string;
    role: string;
    text: string;
    note: string;
  }>;
}

export function buildTasteExamples(
  rows: ReadonlyMap<string, CopyRow>,
  verdicts: Iterable<CopyVerdictRecord>
): TasteExamples {
  const great: Array<TasteExamples['great'][number]> = [];
  const avoid: Array<TasteExamples['avoid'][number]> = [];
  for (const v of verdicts) {
    const row = rows.get(v.copyId);
    // Judge the text Tim actually heard, even if the line has changed since.
    const role = row?.role ?? 'body';
    if (v.verdict === 'great')
      great.push({ copyId: v.copyId, role, text: v.text });
    else if (v.verdict === 'sucks')
      avoid.push({ copyId: v.copyId, role, text: v.text, note: v.note });
  }
  return { great, avoid };
}
