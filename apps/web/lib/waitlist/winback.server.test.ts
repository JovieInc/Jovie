import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import { matchWinbackCandidates } from '@/lib/waitlist/winback.server';

function sqlText(sql: unknown): string {
  return JSON.stringify(sql);
}

function selectChain(row: Record<string, unknown> | null) {
  const rows = row ? [row] : [];
  const api = {
    from() {
      return api;
    },
    where() {
      return api;
    },
    limit() {
      return Promise.resolve(rows);
    },
  };
  return api;
}

function fakeTx(input: {
  readonly regclass: string | null;
  readonly wants?: readonly {
    readonly waitlist_entry_id: string;
    readonly kind: string;
    readonly text: string;
  }[];
  readonly statuses?: readonly string[];
  readonly entry?: { readonly id: string; readonly status: string } | null;
  readonly handle?: string | null;
}): DbOrTransaction {
  let selects = 0;
  return {
    execute: vi.fn(async (sql: unknown) => {
      const text = sqlText(sql);
      if (text.includes('to_regclass')) {
        return { rows: [{ regclass: input.regclass }] };
      }
      if (text.includes('capability_wants')) {
        return { rows: input.wants ?? [] };
      }
      if (text.includes('enum_range')) {
        return {
          rows: (input.statuses ?? []).map(value => ({ value })),
        };
      }
      return { rows: [] };
    }),
    select: vi.fn(() => {
      selects += 1;
      if (selects === 1) return selectChain(input.entry ?? null);
      return selectChain(
        input.handle == null ? null : { handle: input.handle }
      );
    }),
  } as unknown as DbOrTransaction;
}

describe('matchWinbackCandidates', () => {
  it('matches nothing while capability_wants is absent', async () => {
    const result = await matchWinbackCandidates(
      fakeTx({ regclass: null }),
      'release_pages'
    );

    expect(result).toEqual({
      capabilityKey: 'release_pages',
      seam: 'capability_wants_pending',
      seamDetail:
        'capability_wants table not present yet (parallel PR pending); matched nothing',
      candidates: [],
    });
  });

  it('keeps a waitlisted entry and skips a status outside the matchable set', async () => {
    const now = new Date('2026-11-09T00:00:00.000Z');
    const tx = fakeTx({
      regclass: 'capability_wants',
      statuses: ['new', 'waitlisted'],
      wants: [
        {
          waitlist_entry_id: 'entry-waitlisted',
          kind: 'want',
          text: 'release pages',
        },
        {
          waitlist_entry_id: 'entry-new',
          kind: 'want',
          text: 'also this',
        },
      ],
      entry: { id: 'entry-waitlisted', status: 'waitlisted' },
      handle: 'ada',
    });
    const select = tx.select as unknown as ReturnType<typeof vi.fn>;
    select.mockImplementation(() => {
      const call = select.mock.calls.length;
      if (call === 1) {
        return selectChain({ id: 'entry-waitlisted', status: 'waitlisted' });
      }
      if (call === 2) return selectChain({ handle: 'ada' });
      if (call === 3) return selectChain({ id: 'entry-new', status: 'new' });
      return selectChain(null);
    });

    const result = await matchWinbackCandidates(tx, 'release_pages', {
      now,
      qualification: async () => ({
        verdict: 'ELIGIBLE',
        detail: 'cone green',
      }),
    });

    expect(result.seam).toBe('ready');
    expect(result.candidates).toEqual([
      {
        entryId: 'entry-waitlisted',
        status: 'waitlisted',
        wants: [{ kind: 'want', text: 'release pages' }],
        handle: 'ada',
        qualification: { verdict: 'ELIGIBLE', detail: 'cone green' },
      },
    ]);
  });

  it('fails closed to UNKNOWN when qualification evidence is not composed', async () => {
    const tx = fakeTx({
      regclass: 'capability_wants',
      statuses: ['waitlisted'],
      wants: [
        {
          waitlist_entry_id: 'entry-1',
          kind: 'want',
          text: 'release pages',
        },
      ],
      entry: { id: 'entry-1', status: 'waitlisted' },
      handle: null,
    });

    const result = await matchWinbackCandidates(tx, 'release_pages', {
      now: new Date('2026-11-09T00:00:00.000Z'),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.qualification.verdict).toBe('UNKNOWN');
    expect(result.candidates[0]?.handle).toBeNull();
  });
});
