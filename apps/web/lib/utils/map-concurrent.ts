/**
 * Map over items with a concurrency limit.
 *
 * Spawns up to `limit` async workers that pull items from a shared index.
 * Results are returned in the same order as the input array.
 * If any item rejects, no new items are started (in-flight items run to
 * completion since JS has no cooperative cancellation), then the first
 * error is propagated.
 */
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let aborted = false;

  async function worker() {
    while (!aborted && nextIndex < items.length) {
      const i = nextIndex++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        aborted = true;
        throw err;
      }
    }
  }

  const workerCount = Math.min(Math.max(limit, 1), items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
