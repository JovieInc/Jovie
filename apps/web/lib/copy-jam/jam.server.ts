import 'server-only';
import { postgresRecordBackend } from '@/lib/ovie/mcp/postgres-backend';
import { classifyLeftovers, transcribeAudio } from './ai.server';
import { COPY_ROWS } from './inventory';
import { type JamLeftover, parseJam } from './parse-jam';
import type { CopyVerdict, CopyVerdictSource } from './verdicts';
import { recordCopyVerdict } from './verdicts.server';

const KNOWN_IDS: ReadonlySet<string> = new Set(COPY_ROWS.map(r => r.id));

export interface JamResult {
  readonly jamId: string;
  readonly transcript: string;
  readonly applied: ReadonlyArray<{
    readonly copyId: string;
    readonly verdict: CopyVerdict;
    readonly note: string;
    readonly via: 'rule' | 'model';
  }>;
  /** Spoken lines nobody could settle; Tim taps these in the table. */
  readonly unmatched: readonly JamLeftover[];
}

/**
 * One jam: transcript in (or audio, transcribed first), verdicts out. The
 * deterministic parser settles what it can; a small model gets only the
 * leftovers. Every verdict goes through `recordCopyVerdict`, the same write
 * the Ovie tap uses.
 */
export async function runJam(input: {
  readonly transcript?: string;
  readonly audio?: ArrayBuffer;
  readonly by: string;
  readonly source: CopyVerdictSource;
  readonly now?: Date;
}): Promise<JamResult> {
  const now = input.now ?? new Date();
  const transcript =
    input.transcript ?? (input.audio ? await transcribeAudio(input.audio) : '');
  const jamId = `${now
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;

  const parsed = parseJam(transcript, KNOWN_IDS);
  const applied: Array<JamResult['applied'][number]> = parsed.verdicts.map(
    v => ({ ...v, via: 'rule' as const })
  );
  let unmatched = parsed.leftovers;

  if (parsed.leftovers.some(l => l.reason === 'no-verdict')) {
    try {
      const settled = await classifyLeftovers(parsed.leftovers);
      const done = new Set<string>();
      for (const s of settled) {
        for (const copyId of s.copyIds) {
          applied.push({
            copyId,
            verdict: s.verdict,
            note: s.note,
            via: 'model',
          });
          done.add(copyId);
        }
      }
      unmatched = parsed.leftovers.filter(
        l => l.reason !== 'no-verdict' || !l.copyIds.every(id => done.has(id))
      );
    } catch {
      // Relay down: the rule-parsed verdicts still apply; leftovers stay visible.
    }
  }

  const stored: Array<JamResult['applied'][number]> = [];
  for (const a of applied) {
    const record = await recordCopyVerdict({
      copyId: a.copyId,
      verdict: a.verdict,
      note: a.note,
      by: input.by,
      source: input.source,
      now,
    });
    if (record) stored.push(a);
  }

  const result: JamResult = { jamId, transcript, applied: stored, unmatched };
  await postgresRecordBackend().set(`copy-jam/jam/${jamId}`, {
    ...result,
    by: input.by,
    source: input.source,
    at: now.toISOString(),
  });
  return result;
}
