import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runDataRetentionCleanup } from '@/lib/analytics/data-retention';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: { execute } }));

const dialect = new PgDialect();
const attempts: SQL[] = [];
const outcomes: (Error | number)[] = [];

describe('analytics retention deadlock recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T18:30:00.000Z'));
    attempts.length = 0;
    outcomes.length = 0;
    execute.mockReset();
    execute.mockImplementation(async (statement: SQL) => {
      const { sql } = dialect.sqlToQuery(statement);
      if (!sql.startsWith('DELETE FROM "click_events"')) return { rowCount: 0 };

      attempts.push(statement);
      const outcome = outcomes.shift();
      if (outcome instanceof Error) throw outcome;
      if (outcome === undefined)
        throw new Error('unexpected click-events batch');
      return { rowCount: outcome };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries only the aborted batch, preserving earlier committed counts', async () => {
    const deadlock = new Error('Drizzle query failure', {
      cause: { sourceError: { code: '40P01' } },
    });
    outcomes.push(1000, deadlock, 250);

    await Promise.all([
      expect(runDataRetentionCleanup()).resolves.toMatchObject({
        clickEventsDeleted: 1250,
      }),
      vi.runAllTimersAsync(),
    ]);

    expect(attempts).toHaveLength(3);
    expect(execute).toHaveBeenCalledTimes(19);
    const [committed, aborted, retried] = attempts;
    expect(committed).not.toBe(aborted);
    expect(retried).toBe(aborted);
  });

  it('reports the second deadlock without a third attempt', async () => {
    const first = new Error('Drizzle query failure', {
      cause: { code: '40P01' },
    });
    const second = Object.assign(new Error('deadlock still present'), {
      code: '40P01',
    });
    outcomes.push(first, second, 13);

    await Promise.all([
      expect(runDataRetentionCleanup()).rejects.toBe(second),
      vi.runAllTimersAsync(),
    ]);
    expect(attempts).toHaveLength(2);
    expect(outcomes).toEqual([13]);
  });

  it.each(['55P03', '40001', '08006', undefined])(
    'does not retry an unqualified failure even if the message looks like a deadlock (%s)',
    async code => {
      const error = Object.assign(new Error('deadlock detected'), { code });
      outcomes.push(error, 13);

      await Promise.all([
        expect(runDataRetentionCleanup()).rejects.toBe(error),
        vi.runAllTimersAsync(),
      ]);
      expect(attempts).toHaveLength(1);
      expect(outcomes).toEqual([13]);
    }
  );
});
