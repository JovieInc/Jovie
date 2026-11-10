import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    update: () => ({
      set: (value: unknown) => {
        mocks.set(value);
        return {
          where: (predicate: unknown) => {
            mocks.where(predicate);
            const result = Promise.resolve(undefined) as Promise<unknown> & {
              returning: () => Promise<unknown>;
            };
            result.returning = () => mocks.returning();
            return result;
          },
        };
      },
    }),
  },
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: mocks.capture }));

import {
  AGENT_CLAIM_RESERVATION_STALE_MS,
  releaseAgentDraft,
  reserveAgentDraft,
} from './draft-reservation.server';
import type { AgentDraftRow } from './draft-store';

const row = {
  id: '9efebd98-39b7-4a77-8965-04b5aafad9ad',
  preview: { display_name: 'Signal Artist' },
} as unknown as AgentDraftRow;

/** Flatten a drizzle SQL predicate into its literal chunks and params. */
function sqlText(predicate: unknown): string {
  const seen = new WeakSet<object>();
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (node === null || node === undefined) return;
    if (typeof node === 'string' || typeof node === 'number') {
      parts.push(String(node));
      return;
    }
    if (node instanceof Date) {
      parts.push(node.toISOString());
      return;
    }
    if (typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    const record = node as Record<string, unknown>;
    if (typeof record.name === 'string' && 'columnType' in record) {
      parts.push(record.name);
      return;
    }
    if ('value' in record) walk(record.value);
    if ('queryChunks' in record) walk(record.queryChunks);
    if (Array.isArray(node)) for (const item of node) walk(item);
  };
  walk(predicate);
  return parts.join(' ');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('agent draft reservation', () => {
  it('reserves an unclaimed, unexpired draft only when the preview is unchanged', async () => {
    const now = new Date('2026-10-28T12:00:00Z');
    mocks.returning.mockResolvedValueOnce([{ id: row.id }]);
    expect(await reserveAgentDraft(row, now)).toBe(true);
    expect(mocks.set).toHaveBeenCalledWith({ claimedAt: now });
    const predicate = sqlText(mocks.where.mock.calls[0]?.[0]);
    expect(predicate).toContain('is null');
    expect(predicate).toContain('expires_at');
    expect(predicate).toContain(JSON.stringify(row.preview));
  });

  it('reports a lost race or changed draft as not reserved', async () => {
    mocks.returning.mockResolvedValueOnce([]);
    expect(await reserveAgentDraft(row, new Date())).toBe(false);
  });

  it('takes over a stale reservation only by compare-and-set on the exact stale value', async () => {
    const stale = new Date('2026-10-28T11:50:00Z');
    mocks.returning.mockResolvedValueOnce([{ id: row.id }]);
    expect(
      await reserveAgentDraft(row, new Date('2026-10-28T12:00:00Z'), stale)
    ).toBe(true);
    const predicate = sqlText(mocks.where.mock.calls[0]?.[0]);
    expect(predicate).toContain(stale.toISOString());
    expect(predicate).not.toContain('is null');
    expect(AGENT_CLAIM_RESERVATION_STALE_MS).toBe(5 * 60 * 1000);
  });

  it('releases only its own reservation', async () => {
    const at = new Date('2026-10-28T12:00:00Z');
    await releaseAgentDraft(row.id, at);
    expect(mocks.set).toHaveBeenCalledWith({ claimedAt: null });
    const predicate = sqlText(mocks.where.mock.calls[0]?.[0]);
    expect(predicate).toContain(at.toISOString());
    expect(predicate).toContain(row.id);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it('reports a failed release instead of throwing (the stale takeover recovers it)', async () => {
    const failure = new Error('db down');
    mocks.where.mockImplementationOnce(() => {
      throw failure;
    });
    await expect(releaseAgentDraft(row.id, new Date())).resolves.toBe(
      undefined
    );
    expect(mocks.capture).toHaveBeenCalledWith(
      'Agent draft reservation release failed',
      failure,
      { route: '/claim/agent' }
    );
  });
});
