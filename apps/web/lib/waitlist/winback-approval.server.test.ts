import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';
import {
  WINBACK_EMAIL_TEMPLATE_VERSION,
  type WinbackApprovalRecord,
  winbackApprovalKvKey,
} from '@/lib/waitlist/winback';
import {
  getLastUnansweredWinbackSentAt,
  promoteApprovedWinbackBatch,
  saveWinbackApprovalRecord,
} from '@/lib/waitlist/winback-approval.server';

vi.mock('@/lib/waitlist/winback-analytics', () => ({
  trackWinbackEvent: vi.fn(async () => undefined),
}));

const ENTRY_ID = '11111111-1111-4111-8111-111111111111';

const APPROVAL = {
  contract: 'jovie.winback-approval/v1',
  batchId: 'batch-2026-11-09-a',
  capabilityKey: 'public-profile-pages',
  templateVersion: WINBACK_EMAIL_TEMPLATE_VERSION,
  entryIds: [ENTRY_ID],
  approvedBy: 'tim',
  approvedAt: '2026-11-09T12:00:00.000Z',
} satisfies WinbackApprovalRecord;

function sqlText(sql: unknown): string {
  const seen = new WeakSet<object>();
  return (
    JSON.stringify(sql, (_key, value: unknown) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return undefined;
        seen.add(value);
      }
      if (typeof value === 'function') return undefined;
      return value;
    }) ?? ''
  );
}

function query(rows: unknown[]) {
  const pending = Promise.resolve(rows);
  return Object.assign(pending, {
    limit: () => Promise.resolve(rows),
    orderBy: () => ({ limit: () => Promise.resolve(rows) }),
  });
}

function fakeTx(responses: unknown[][]): {
  tx: DbOrTransaction;
  clauses: string[];
  inserted: unknown[];
} {
  const clauses: string[] = [];
  const inserted: unknown[] = [];
  let call = 0;
  const tx = {
    select: () => ({
      from: () => ({
        where: (clause: unknown) => {
          clauses.push(sqlText(clause));
          const rows = responses[call] ?? [];
          call += 1;
          return query(rows);
        },
      }),
    }),
    insert: () => ({
      values: (value: unknown) => {
        inserted.push(value);
        return {
          onConflictDoUpdate: async () => undefined,
          onConflictDoNothing: async () => undefined,
        };
      },
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [{ id: 'job-1' }],
        }),
      }),
    }),
  };
  return { tx: tx as unknown as DbOrTransaction, clauses, inserted };
}

describe('saveWinbackApprovalRecord', () => {
  it('stores the approval record under the batch ledger key', async () => {
    const { tx, inserted } = fakeTx([]);

    await saveWinbackApprovalRecord(tx, APPROVAL);

    expect(inserted).toEqual([
      {
        key: winbackApprovalKvKey(APPROVAL.batchId),
        value: APPROVAL,
        updatedAt: expect.any(Date),
      },
    ]);
  });
});

describe('promoteApprovedWinbackBatch', () => {
  it('promotes nothing without a valid approval record', async () => {
    const { tx } = fakeTx([[]]);

    await expect(
      promoteApprovedWinbackBatch(tx, 'batch-missing')
    ).rejects.toThrow(/no valid approval record/);
  });

  it('selects held send_waitlist_winback_email jobs for an approved batch', async () => {
    const { tx, clauses } = fakeTx([
      [{ value: APPROVAL }],
      [
        {
          id: 'job-1',
          payload: {
            type: 'winback_capability_shipped',
            entryId: ENTRY_ID,
          },
        },
      ],
    ]);

    const result = await promoteApprovedWinbackBatch(tx, APPROVAL.batchId);

    expect(result).toEqual({ promoted: 1 });
    expect(
      clauses.some(clause => clause.includes('send_waitlist_winback_email'))
    ).toBe(true);
    expect(
      clauses.some(clause => clause.includes('send_waitlist_email"'))
    ).toBe(false);
  });
});

describe('getLastUnansweredWinbackSentAt', () => {
  it('returns null when this person has no winback_sent event', async () => {
    const { tx } = fakeTx([[]]);

    await expect(
      getLastUnansweredWinbackSentAt(tx, ENTRY_ID)
    ).resolves.toBeNull();
  });
});
