import { beforeEach, describe, expect, it } from 'vitest';
import { prepareOvieChatTurn } from '@/lib/ovie/chat-entry';
import {
  ackOvieDumpBeforeModel,
  DEST_KANBAN,
  DEST_LINEAR,
  DEST_PERSONAL,
  OVIE_LINEAR_QUEUED_ACK,
  OVIE_QUEUED_ACK,
  readOvieLinearRoutes,
  readOvieReceiptLog,
  resetOvieIngestLog,
} from '@/lib/ovie/ingest';
import { MemoryOperatingStore } from '@/lib/ovie/mcp/store';
import { applyOvieDump } from '@/lib/ovie/persist';
import { listSummerKanban } from '@/lib/ovie/summer-kanban';

const MIXED = [
  'post this tweet',
  'research 23 growth ideas and write evals',
  'Jovie signup returns 500 on /start',
  'remind me to text Liv about Catalina',
  'taste: is the hero too salesy',
] as const;

describe('Ovie dump ingest (JOV-5215)', () => {
  beforeEach(() => {
    resetOvieIngestLog();
  });

  it('acks a mixed dump without spawning workers', async () => {
    const spawned: string[] = [];
    const store = new MemoryOperatingStore();
    const receipts = await applyOvieDump(MIXED, {
      store,
      spawn: goal => {
        spawned.push(goal);
      },
    });

    expect(receipts).toHaveLength(MIXED.length);
    expect(spawned).toEqual([]);
    expect(receipts.map(r => r.lane)).toEqual([
      'flash',
      'heavy',
      'engineering',
      'personal',
      'taste',
    ]);
    expect(receipts[2]?.destination).toBe(DEST_LINEAR);
    expect(receipts[3]?.destination).toBe(DEST_PERSONAL);
    expect(receipts[3]?.destination).not.toBe(DEST_KANBAN);
    for (const receipt of receipts) {
      expect(receipt.ack).toBe(
        receipt.destination === DEST_LINEAR
          ? OVIE_LINEAR_QUEUED_ACK
          : OVIE_QUEUED_ACK
      );
      expect(receipt.destinationHandle).toBeNull();
      expect(receipt.workerSpawned).toBe(false);
    }
    expect(readOvieReceiptLog()).toEqual(receipts);
    expect(readOvieLinearRoutes()).toEqual([]);
    const board = await listSummerKanban(store);
    expect(board.map(card => card.workId)).toEqual(
      receipts
        .filter(receipt => receipt.destination === DEST_KANBAN)
        .map(receipt => receipt.workId)
    );
    expect(board.some(card => card.lane === 'personal')).toBe(false);
  });

  it('persists mixed dump on the shipped chat entry and skips spawn', async () => {
    const spawned: string[] = [];
    const { eveTurn, receipts, generation } = await prepareOvieChatTurn(
      'ov',
      MIXED[2],
      {
        store: new MemoryOperatingStore(),
        spawn: goal => {
          spawned.push(goal);
        },
      }
    );
    expect(eveTurn.pack.id).toBe('summer');
    expect(generation.kind).toBe('summer-transport');
    expect(spawned).toEqual([]);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.lane).toBe('engineering');
    expect(receipts[0]?.destination).toBe(DEST_LINEAR);
    expect(receipts[0]?.ack).toBe(OVIE_LINEAR_QUEUED_ACK);
    expect(readOvieReceiptLog()).toEqual(receipts);
    expect(readOvieLinearRoutes()).toEqual([]);
  });

  it('does not ingest on the Jovie artist chat entry', async () => {
    const { eveTurn, receipts, generation } = await prepareOvieChatTurn(
      null,
      'Jovie signup returns 500 on /start',
      { store: new MemoryOperatingStore() }
    );
    expect(eveTurn.pack.id).toBe('jovie');
    expect(generation.kind).toBe('artist-jovie');
    expect(receipts).toEqual([]);
    expect(readOvieReceiptLog()).toEqual([]);
    expect(readOvieLinearRoutes()).toEqual([]);
  });

  it('classifies a dump without persisting when the chat hook is used', () => {
    expect(ackOvieDumpBeforeModel(null)).toEqual([]);
    expect(ackOvieDumpBeforeModel('   ')).toEqual([]);
    const classified = ackOvieDumpBeforeModel(
      'Jovie signup returns 500 on /start'
    );
    expect(classified).toHaveLength(1);
    expect(classified[0]?.lane).toBe('engineering');
    expect(classified[0]?.destination).toBe(DEST_LINEAR);
  });
});
