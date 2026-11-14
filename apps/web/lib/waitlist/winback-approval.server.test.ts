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

  it('refuses a record for an obsolete template before selecting jobs', async () => {
    const { tx, clauses } = fakeTx([
      [{ value: { ...APPROVAL, templateVersion: 'obsolete/v0' } }],
    ]);

    await expect(
      promoteApprovedWinbackBatch(tx, APPROVAL.batchId)
    ).rejects.toThrow(/no valid approval record/);
    expect(clauses).toHaveLength(1);
  });

  it('leaves entries outside the approved batch held', async () => {
    const { tx } = fakeTx([
      [{ value: APPROVAL }],
      [
        {
          id: 'other-job',
          payload: {
            type: 'winback_capability_shipped',
            entryId: 'other-entry',
          },
        },
      ],
    ]);

    await expect(
      promoteApprovedWinbackBatch(tx, APPROVAL.batchId)
    ).resolves.toEqual({ promoted: 0 });
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
  it('keeps the latest unanswered send charged to the outreach budget', async () => {
    const sentAt = new Date('2026-11-09T12:00:00.000Z');
    const { tx } = fakeTx([[{ occurredAt: sentAt }], []]);

    await expect(getLastUnansweredWinbackSentAt(tx, ENTRY_ID)).resolves.toEqual(
      sentAt
    );
  });

  it('frees the outreach budget after a later reply', async () => {
    const { tx } = fakeTx([
      [{ occurredAt: new Date('2026-11-09T12:00:00.000Z') }],
      [{ occurredAt: new Date('2026-11-10T12:00:00.000Z') }],
    ]);

    await expect(
      getLastUnansweredWinbackSentAt(tx, ENTRY_ID)
    ).resolves.toBeNull();
  });

  it('does not free the budget for a reply preceding the latest send', async () => {
    const sentAt = new Date('2026-11-09T12:00:00.000Z');
    const { tx } = fakeTx([
      [{ occurredAt: sentAt }],
      [{ occurredAt: new Date('2026-11-08T12:00:00.000Z') }],
    ]);

    await expect(getLastUnansweredWinbackSentAt(tx, ENTRY_ID)).resolves.toEqual(
      sentAt
    );
  });

  it('returns null when this person has no winback_sent event', async () => {
    const { tx } = fakeTx([[]]);

    await expect(
      getLastUnansweredWinbackSentAt(tx, ENTRY_ID)
    ).resolves.toBeNull();
  });
});
