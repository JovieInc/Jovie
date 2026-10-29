import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const store = vi.hoisted(() => new Map<string, unknown>());

vi.mock('@/lib/ovie/mcp/postgres-backend', () => ({
  postgresRecordBackend: () => ({
    get: async (key: string) => store.get(key) ?? null,
    setIfAbsent: async (key: string, value: unknown) => {
      if (store.has(key)) return false;
      store.set(key, value);
      return true;
    },
    compareAndSet: async (key: string, expected: unknown, next: unknown) => {
      if (JSON.stringify(store.get(key)) !== JSON.stringify(expected))
        return false;
      store.set(key, next);
      return true;
    },
    listRecords: async (
      prefix: string,
      after: string | undefined,
      limit: number
    ) =>
      [...store.entries()]
        .filter(([k]) => k.startsWith(prefix) && (!after || k > after))
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, limit)
        .map(([key, value]) => ({ key, value })),
  }),
}));

import { COPY_ROWS } from './inventory';
import { listCopyVerdicts, recordCopyVerdict } from './verdicts.server';

const id = COPY_ROWS[0]?.id ?? 'HOME-1';

describe('recordCopyVerdict', () => {
  beforeEach(() => store.clear());

  it('stores the verdict with the text that was judged', async () => {
    const record = await recordCopyVerdict({
      copyId: id,
      verdict: 'sucks',
      note: ' too long ',
      by: 'tim',
      source: 'ovie-tap',
    });
    expect(record).toMatchObject({
      copyId: id,
      verdict: 'sucks',
      note: 'too long',
      history: [],
    });
    expect(record?.text).toBe(COPY_ROWS[0]?.text);
  });

  it('moves the previous verdict into history on re-rate', async () => {
    await recordCopyVerdict({
      copyId: id,
      verdict: 'sucks',
      by: 'tim',
      source: 'ovie-tap',
    });
    const second = await recordCopyVerdict({
      copyId: id,
      verdict: 'great',
      by: 'tim',
      source: 'ovie-voice',
    });
    expect(second?.verdict).toBe('great');
    expect(second?.history.map(h => h.verdict)).toEqual(['sucks']);
  });

  it('rejects an ID that is not in the inventory', async () => {
    expect(
      await recordCopyVerdict({
        copyId: 'NOPE-99',
        verdict: 'meh',
        by: 'tim',
        source: 'ovie-tap',
      })
    ).toBeNull();
    expect(store.size).toBe(0);
  });

  it('lists the latest verdict per line', async () => {
    await recordCopyVerdict({
      copyId: id,
      verdict: 'meh',
      by: 'tim',
      source: 'ovie-tap',
    });
    const all = await listCopyVerdicts();
    expect(all.get(id)?.verdict).toBe('meh');
  });
});
