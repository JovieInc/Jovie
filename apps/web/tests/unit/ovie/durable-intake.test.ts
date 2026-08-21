import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEST_KANBAN,
  DEST_PERSONAL,
  DEST_TASTE,
  OVIE_QUEUED_ACK,
  OVIE_UNAVAILABLE_ACK,
  readOvieAckLatencies,
  readOvieLinearRoutes,
  resetOvieIngestLog,
  setOvieIntakeMode,
} from '@/lib/ovie/ingest';
import { MemoryOperatingStore } from '@/lib/ovie/mcp/store';
import {
  applyOvieDump,
  defaultOvieDumpKey,
  inspectOvieIntake,
  ovieWorkIdFromKey,
} from '@/lib/ovie/persist';
import { listSummerKanban } from '@/lib/ovie/summer-kanban';

const DUMP_20 = [
  'post this tweet about the drop',
  'tweet the merch restock',
  'post this clip to x.com',
  'send this slack to the crew',
  'do this now: publish the teaser',
  'research 23 growth ideas and write evals',
  'deep dive the onboarding funnel',
  'write evals for chat quality',
  'research skill lock options',
  'dogfood the invite flow',
  'growth ideas for waitlist conversion',
  'eval the billing upgrade copy',
  'Jovie signup returns 500 on /start',
  'signup is broken on /start',
  'typeerror in the checkout bug',
  'ci traceback on main',
  'pr review: crash in profile',
  'remind me to text Liv about Catalina',
  'taste: is the hero too salesy',
  'does this look like taste swipe material',
] as const;

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index] ?? 0;
}

describe('durable Eve intake (JOV-5215)', () => {
  beforeEach(() => {
    resetOvieIngestLog();
  });

  it('persists a 20-item mixed dump before ack with stable IDs', async () => {
    const store = new MemoryOperatingStore();
    const order: string[] = [];
    const receipts = await applyOvieDump(DUMP_20, {
      store,
      afterPersist: () => {
        order.push('persist');
      },
    });
    order.push('ack');
    expect(order[0]).toBe('persist');
    expect(order.at(-1)).toBe('ack');
    expect(receipts).toHaveLength(20);
    const ids = receipts.map(receipt => receipt.workId);
    expect(new Set(ids).size).toBe(20);
    expect(
      receipts.filter(receipt => receipt.lane === 'personal')
    ).toHaveLength(1);
    expect(receipts.filter(receipt => receipt.lane === 'taste')).toHaveLength(
      2
    );
    expect(readOvieLinearRoutes()).toEqual([]);

    const replay = await applyOvieDump(DUMP_20, { store });
    expect(replay.map(receipt => receipt.workId)).toEqual(ids);
    expect(await store.listInitiatives()).toHaveLength(20);

    const board = await listSummerKanban(store);
    const personal = receipts.find(receipt => receipt.lane === 'personal');
    const taste = receipts.filter(receipt => receipt.lane === 'taste');
    expect(personal?.destination).toBe(DEST_PERSONAL);
    expect(taste.every(receipt => receipt.destination === DEST_TASTE)).toBe(
      true
    );
    expect(board).toHaveLength(17);
    expect(board.some(card => card.workId === personal?.workId)).toBe(false);
    expect(
      taste.every(
        receipt => !board.some(card => card.workId === receipt.workId)
      )
    ).toBe(true);
    expect(
      board.every(
        card =>
          card.lane === 'flash' ||
          card.lane === 'heavy' ||
          card.lane === 'engineering'
      )
    ).toBe(true);
    expect(
      receipts
        .filter(receipt => receipt.destination === DEST_KANBAN)
        .every(receipt => receipt.ack === OVIE_QUEUED_ACK)
    ).toBe(true);

    const latencies = readOvieAckLatencies();
    expect(latencies.length).toBeGreaterThanOrEqual(20);
    expect(latencies.every(ms => Number.isFinite(ms) && ms >= 0)).toBe(true);
    expect(percentile(latencies, 50)).toBeGreaterThanOrEqual(0);
    expect(percentile(latencies, 95)).toBeGreaterThanOrEqual(
      percentile(latencies, 50)
    );
  });

  it('inspects an existing receipt before retrying a lost transport', async () => {
    const store = new MemoryOperatingStore();
    const text = 'research 23 growth ideas and write evals';
    const key = defaultOvieDumpKey(text);
    expect(await inspectOvieIntake(store, key)).toBeUndefined();
    const [first] = await applyOvieDump([text], { store });
    const inspected = await inspectOvieIntake(store, key);
    expect(inspected?.workId).toBe(first?.workId);
    expect(inspected?.workId).toBe(ovieWorkIdFromKey(key));
    const [retry] = await applyOvieDump([text], {
      store,
      idempotencyKeys: [key],
    });
    expect(retry?.workId).toBe(first?.workId);
    expect(await store.listInitiatives()).toHaveLength(1);
  });

  it('recovers persist-success/ack-failure without duplication', async () => {
    const store = new MemoryOperatingStore();
    const text = 'Jovie signup returns 500 on /start';
    await expect(
      applyOvieDump([text], {
        store,
        afterPersist: () => {
          throw new Error('ack-transport-lost');
        },
      })
    ).rejects.toThrow('ack-transport-lost');
    expect(await store.listInitiatives()).toHaveLength(1);
    const key = defaultOvieDumpKey(text);
    const inspected = await inspectOvieIntake(store, key);
    expect(inspected?.workId).toBe(ovieWorkIdFromKey(key));
    const [recovered] = await applyOvieDump([text], { store });
    expect(recovered?.workId).toBe(inspected?.workId);
    expect(await store.listInitiatives()).toHaveLength(1);
  });

  it('keeps a truthful unavailable state when downstream routing fails', async () => {
    const store = new MemoryOperatingStore();
    const text = 'post this tweet about the drop';
    const [receipt] = await applyOvieDump([text], {
      store,
      routeCompany: async () => {
        throw new Error('kanban-outage');
      },
    });
    expect(receipt?.ack).toBe(OVIE_UNAVAILABLE_ACK);
    expect(receipt?.routingState).toBe('unavailable');
    const listed = await store.listInitiatives();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.routingState).toBe('unavailable');
    expect(listed[0]?.routingReason).toBe('kanban-outage');
    const board = await listSummerKanban(store);
    expect(board).toHaveLength(1);
    expect(board[0]?.routingState).toBe('unavailable');

    const [recovered] = await applyOvieDump([text], { store });
    expect(recovered?.workId).toBe(receipt?.workId);
    expect(recovered?.ack).toBe(OVIE_QUEUED_ACK);
    expect((await listSummerKanban(store))[0]?.routingState).toBe('queued');
  });

  it('enters receipt-only fail-closed mode without dropping receipts', async () => {
    const store = new MemoryOperatingStore();
    setOvieIntakeMode('receipt-only');
    const receipts = await applyOvieDump(
      ['post this tweet', 'remind me to text Liv about Catalina'],
      { store }
    );
    expect(receipts).toHaveLength(2);
    expect(
      receipts.every(receipt => receipt.ack === OVIE_UNAVAILABLE_ACK)
    ).toBe(true);
    expect(await store.listInitiatives()).toHaveLength(2);
    expect(
      (await store.listInitiatives()).every(
        row => row.routingState === 'unavailable'
      )
    ).toBe(true);
    const replay = await applyOvieDump(
      ['post this tweet', 'remind me to text Liv about Catalina'],
      { store }
    );
    expect(replay.map(receipt => receipt.workId)).toEqual(
      receipts.map(receipt => receipt.workId)
    );
    expect(await store.listInitiatives()).toHaveLength(2);

    setOvieIntakeMode('normal');
    const queuedStore = new MemoryOperatingStore();
    const queued = await applyOvieDump(['research 23 growth ideas'], {
      store: queuedStore,
    });
    expect(queued[0]?.routingState).toBe('queued');
    setOvieIntakeMode('receipt-only');
    const closed = await applyOvieDump(['research 23 growth ideas'], {
      store: queuedStore,
    });
    expect(closed[0]?.workId).toBe(queued[0]?.workId);
    expect(closed[0]?.routingState).toBe('unavailable');
    expect(closed[0]?.ack).toBe(OVIE_UNAVAILABLE_ACK);
    expect(await queuedStore.listInitiatives()).toHaveLength(1);
  });
});
