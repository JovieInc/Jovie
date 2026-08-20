import { beforeEach, describe, expect, it } from 'vitest';
import { prepareOvieChatTurn } from '@/lib/ovie/chat-entry';
import {
  DEST_LINEAR,
  DEST_PERSONAL,
  OVIE_QUEUED_ACK,
  readOvieLinearRoutes,
  readOvieReceiptLog,
  resetOvieIngestLog,
} from '@/lib/ovie/ingest';
import { MemoryOperatingStore } from '@/lib/ovie/mcp/store';
import { applyOvieDump } from '@/lib/ovie/persist';

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
    const receipts = await applyOvieDump(MIXED, {
      store: new MemoryOperatingStore(),
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
    expect(receipts[3]?.destination).not.toBe(DEST_LINEAR);
    for (const receipt of receipts) {
      expect(receipt.ack).toBe(OVIE_QUEUED_ACK);
      expect(receipt.destinationHandle).toBeNull();
      expect(receipt.workerSpawned).toBe(false);
    }
    expect(readOvieReceiptLog()).toEqual(receipts);
    expect(readOvieLinearRoutes()).toEqual([receipts[2]]);
  });

  it('persists mixed dump on the shipped chat entry and skips spawn', async () => {
    const spawned: string[] = [];
    const { eveTurn, receipts } = await prepareOvieChatTurn('ov', MIXED[2], {
      store: new MemoryOperatingStore(),
      spawn: goal => {
        spawned.push(goal);
      },
    });
    expect(eveTurn.pack.id).toBe('ovie');
    expect(spawned).toEqual([]);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.lane).toBe('engineering');
    expect(receipts[0]?.destination).toBe(DEST_LINEAR);
    expect(readOvieReceiptLog()).toEqual(receipts);
    expect(readOvieLinearRoutes()).toEqual(receipts);
  });

  it('does not ingest on the Jovie artist chat entry', async () => {
    const { eveTurn, receipts } = await prepareOvieChatTurn(
      null,
      'Jovie signup returns 500 on /start',
      { store: new MemoryOperatingStore() }
    );
    expect(eveTurn.pack.id).toBe('jovie');
    expect(receipts).toEqual([]);
    expect(readOvieReceiptLog()).toEqual([]);
    expect(readOvieLinearRoutes()).toEqual([]);
  });
});
