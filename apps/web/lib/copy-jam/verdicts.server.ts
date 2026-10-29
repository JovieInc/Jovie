import 'server-only';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { getCopyRow } from './inventory';
import {
  COPY_VERDICT_HISTORY_CAP,
  COPY_VERDICT_PREFIX,
  type CopyVerdict,
  type CopyVerdictRecord,
  type CopyVerdictSource,
} from './verdicts';

const PAGE = 100;

/**
 * The one write path for a copy verdict. The Ovie tap, the voice jam and
 * Summer's API all call this, so a verdict stored from any of them is the
 * same row. Last write wins; the previous verdict moves into `history`.
 */
export async function recordCopyVerdict(input: {
  readonly copyId: string;
  readonly verdict: CopyVerdict;
  readonly note?: string;
  readonly by: string;
  readonly source: CopyVerdictSource;
  readonly now?: Date;
}): Promise<CopyVerdictRecord | null> {
  const row = getCopyRow(input.copyId);
  if (!row) return null;
  const backend = postgresRecordBackend();
  const key = `${COPY_VERDICT_PREFIX}${input.copyId}`;
  const at = (input.now ?? new Date()).toISOString();
  const next = {
    verdict: input.verdict,
    note: input.note?.trim() ?? '',
    by: input.by,
    source: input.source,
    at,
    text: row.text,
  };

  // Compare-and-set so two writers (Tim's tap and a voice jam) cannot drop
  // each other's history entry.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = (await backend.get(key)) as CopyVerdictRecord | null;
    const history = current
      ? [
          {
            verdict: current.verdict,
            note: current.note,
            by: current.by,
            source: current.source,
            at: current.at,
            text: current.text,
          },
          ...current.history,
        ].slice(0, COPY_VERDICT_HISTORY_CAP)
      : [];
    const record: CopyVerdictRecord = {
      copyId: input.copyId,
      ...next,
      history,
    };
    const written = current
      ? await backend.compareAndSet(key, current, record, 0)
      : await backend.setIfAbsent(key, record, 0);
    if (written) return record;
  }
  throw new Error(`copy verdict write contended: ${input.copyId}`);
}

export async function listCopyVerdicts(): Promise<
  ReadonlyMap<string, CopyVerdictRecord>
> {
  const backend = postgresRecordBackend();
  const out = new Map<string, CopyVerdictRecord>();
  if (!backend.listRecords) return out;
  let after: string | undefined;
  for (;;) {
    const page = await backend.listRecords(COPY_VERDICT_PREFIX, after, PAGE);
    for (const { value } of page) {
      const record = value as CopyVerdictRecord;
      out.set(record.copyId, record);
    }
    if (page.length < PAGE) return out;
    after = page[page.length - 1]?.key;
  }
}
