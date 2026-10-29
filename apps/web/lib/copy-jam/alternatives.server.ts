import 'server-only';
import { lintCopy } from '@jovie/copy';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { getCopyRow } from './inventory';
import type { AlternativesRecord } from './queue';

export const COPY_ALT_PREFIX = 'copy-jam/alt/';
const PAGE = 100;

export type SaveAlternativesResult =
  | { readonly ok: true; readonly record: AlternativesRecord }
  | { readonly ok: false; readonly error: 'unknown_copy_id' }
  | {
      readonly ok: false;
      readonly error: 'lint_blocked';
      readonly findings: ReadonlyArray<{
        index: number;
        rule: string;
        message: string;
      }>;
    };

/**
 * Summer's 2-3 rewrites for one line. Held as pending suggestions linked to
 * the line; nothing here changes the page. Every alternative passes the
 * `@jovie/copy` blocking rules first, and a line backed by a content record
 * still goes live only through that record's draft, validate and publish.
 */
export async function saveAlternatives(input: {
  readonly copyId: string;
  readonly alternatives: readonly string[];
  readonly by: string;
  readonly now?: Date;
}): Promise<SaveAlternativesResult> {
  const row = getCopyRow(input.copyId);
  if (!row) return { ok: false, error: 'unknown_copy_id' };
  const findings: Array<{ index: number; rule: string; message: string }> = [];
  input.alternatives.forEach((text, index) => {
    const lint = lintCopy(text, {
      register: 'jovie-marketing',
      headline: row.role === 'h1' || row.role === 'h2',
    });
    for (const f of lint.blocking)
      findings.push({ index, rule: f.rule, message: f.message });
  });
  if (findings.length) return { ok: false, error: 'lint_blocked', findings };

  const record: AlternativesRecord = {
    copyId: input.copyId,
    forText: row.text,
    alternatives: input.alternatives,
    by: input.by,
    at: (input.now ?? new Date()).toISOString(),
    status: 'pending',
  };
  await postgresRecordBackend().set(
    `${COPY_ALT_PREFIX}${input.copyId}`,
    record
  );
  return { ok: true, record };
}

export async function listAlternatives(): Promise<
  ReadonlyMap<string, AlternativesRecord>
> {
  const backend = postgresRecordBackend();
  const out = new Map<string, AlternativesRecord>();
  if (!backend.listRecords) return out;
  let after: string | undefined;
  for (;;) {
    const page = await backend.listRecords(COPY_ALT_PREFIX, after, PAGE);
    for (const { value } of page)
      out.set(
        (value as AlternativesRecord).copyId,
        value as AlternativesRecord
      );
    if (page.length < PAGE) return out;
    after = page[page.length - 1]?.key;
  }
}
