import { describe, expect, it } from 'vitest';
import { mapConcurrent } from './map-concurrent';

describe('mapConcurrent', () => {
  it('processes items and returns results in order', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapConcurrent(items, 3, async item => item * 2);
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('respects concurrency limit', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const items = Array.from({ length: 10 }, (_, i) => i);
    await mapConcurrent(items, 3, async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise(r => setTimeout(r, 10));
      concurrent--;
    });

    expect(maxConcurrent).toBeLessThanOrEqual(3);
    expect(maxConcurrent).toBeGreaterThan(1);
  });

  it('returns empty array for empty input', async () => {
    const results = await mapConcurrent([], 5, async (item: number) => item);
    expect(results).toEqual([]);
  });

  it('handles limit greater than items length', async () => {
    const items = [1, 2];
    const results = await mapConcurrent(items, 100, async item => item + 1);
    expect(results).toEqual([2, 3]);
  });

  it('rejects when a single item throws', async () => {
    const items = [1, 2, 3];
    await expect(
      mapConcurrent(items, 2, async item => {
        if (item === 2) throw new Error('fail');
        return item;
      })
    ).rejects.toThrow('fail');
  });

  it('propagates the first error when multiple items throw', async () => {
    const items = [1, 2, 3];
    await expect(
      mapConcurrent(items, 1, async item => {
        if (item >= 2) throw new Error(`fail-${item}`);
        return item;
      })
    ).rejects.toThrow('fail-2');
  });

  it('processes sequentially when limit is 1', async () => {
    const order: number[] = [];
    const items = [1, 2, 3];
    await mapConcurrent(items, 1, async item => {
      order.push(item);
      await new Promise(r => setTimeout(r, 5));
      return item;
    });
    expect(order).toEqual([1, 2, 3]);
  });
});
