import { beforeEach, describe, expect, it } from 'vitest';
import { EveAuthorityError } from '@/lib/ovie/eve-authority';
import {
  DEST_KANBAN,
  DEST_PERSONAL,
  resetOvieIngestLog,
} from '@/lib/ovie/ingest';
import { MemoryOperatingStore } from '@/lib/ovie/mcp/store';
import { applyOvieDump, ovieIdempotencyKey } from '@/lib/ovie/persist';
import {
  inspectSummerCard,
  listSummerKanban,
  transitionSummerCard,
} from '@/lib/ovie/summer-kanban';

describe('Summer Kanban (JOV-5215)', () => {
  beforeEach(() => {
    resetOvieIngestLog();
  });

  it('exposes company IDs and lets Summer transition them', async () => {
    const store = new MemoryOperatingStore();
    const receipts = await applyOvieDump(
      [
        'post this tweet',
        'Jovie signup returns 500 on /start',
        'remind me to text Liv about Catalina',
      ],
      { store }
    );
    const board = await listSummerKanban(store);
    expect(board).toHaveLength(2);
    expect(board.map(card => card.workId).sort()).toEqual(
      receipts
        .filter(receipt => receipt.destination === DEST_KANBAN)
        .map(receipt => receipt.workId)
        .sort()
    );
    expect(board.every(card => card.owner === 'summer')).toBe(true);
    expect(
      receipts.find(receipt => receipt.destination === DEST_PERSONAL)?.workId
    ).toBeTruthy();
    expect(
      board.some(
        card =>
          card.workId ===
          receipts.find(receipt => receipt.destination === DEST_PERSONAL)
            ?.workId
      )
    ).toBe(false);

    const workId = board[0]?.workId;
    if (!workId) throw new Error('expected company card');
    await expect(
      transitionSummerCard(store, {
        workId,
        routingState: 'accepted',
        actor: 'eve',
      })
    ).rejects.toBeInstanceOf(EveAuthorityError);

    const moved = await transitionSummerCard(store, {
      workId,
      routingState: 'accepted',
      actor: 'summer',
    });
    expect(moved.routingState).toBe('accepted');
    expect(moved.id).toBe(workId);
    expect((await inspectSummerCard(store, workId))?.routingState).toBe(
      'accepted'
    );
    expect(ovieIdempotencyKey(workId)).toBe(`ovie-${workId}`);

    for (const routingState of [
      'in_progress',
      'blocked',
      'unavailable',
      'done',
    ] as const) {
      const next = await transitionSummerCard(store, {
        workId,
        routingState,
        actor: 'summer',
      });
      expect(next.routingState).toBe(routingState);
      expect((await inspectSummerCard(store, workId))?.routingState).toBe(
        routingState
      );
    }

    expect(await inspectSummerCard(store, 'ini_missing')).toBeUndefined();
    await expect(
      transitionSummerCard(store, {
        workId: 'ini_missing',
        routingState: 'blocked',
        actor: 'summer',
      })
    ).rejects.toThrow(/unknown summer card/);

    const personalId = receipts.find(
      receipt => receipt.destination === DEST_PERSONAL
    )?.workId;
    if (!personalId) throw new Error('expected personal receipt');
    expect(await inspectSummerCard(store, personalId)).toBeUndefined();
    await expect(
      transitionSummerCard(store, {
        workId: personalId,
        routingState: 'accepted',
        actor: 'summer',
      })
    ).rejects.toThrow(/not a company kanban item/);
  });
});
