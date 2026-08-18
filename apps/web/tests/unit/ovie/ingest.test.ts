import { describe, expect, it } from 'vitest';
import {
  ackOvieDumpBeforeModel,
  DEST_LINEAR,
  DEST_PERSONAL,
  ingestOvieDump,
} from '@/lib/ovie/ingest';

describe('Ovie dump ingest (JOV-5215)', () => {
  it('acks a mixed dump without spawning workers', () => {
    const items = [
      'post this tweet',
      'research 23 growth ideas and write evals',
      'Jovie signup returns 500 on /start',
      'remind me to text Liv about Catalina',
      'taste: is the hero too salesy',
    ];
    const spawned: string[] = [];
    const receipts = ingestOvieDump(items, {
      spawn: goal => {
        spawned.push(goal);
      },
    });

    expect(receipts).toHaveLength(items.length);
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
      expect(receipt.ack.startsWith('stored:')).toBe(true);
      expect(receipt.workerSpawned).toBe(false);
    }
  });

  it('acks before model on the chat hook', () => {
    const receipts = ackOvieDumpBeforeModel(
      'Jovie signup returns 500 on /start'
    );
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.lane).toBe('engineering');
    expect(receipts[0]?.destination).toBe(DEST_LINEAR);
  });
});
