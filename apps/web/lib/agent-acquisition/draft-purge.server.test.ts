import { beforeEach, describe, expect, it, vi } from 'vitest';

const selects = vi.hoisted(() => ({ queue: [] as unknown[][] }));
const deleted = vi.hoisted(() => ({ ids: [] as string[][] }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/schema/agent-drafts', () => ({
  agentVisibilityDrafts: { id: 'id', expiresAt: 'expiresAt' },
}));
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => a,
  inArray: (_f: unknown, ids: string[]) => ({ ids }),
  lt: (f: unknown, v: Date) => ({ f, v }),
  sql: () => ({}),
}));
vi.mock('@/lib/db', () => {
  const chain = (result: () => unknown) => {
    const p: unknown = new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === 'then'
            ? (res: (v: unknown) => void) => Promise.resolve(result()).then(res)
            : (...args: unknown[]) => {
                const first = args[0] as { ids?: string[] } | undefined;
                if (first?.ids) deleted.ids.push(first.ids);
                return p;
              },
      }
    );
    return p;
  };
  return {
    db: {
      select: () => chain(() => selects.queue.shift() ?? []),
      delete: () => chain(() => (deleted.ids.at(-1) ?? []).map(id => ({ id }))),
    },
  };
});

import {
  AGENT_DRAFT_PURGE_AFTER_EXPIRY_DAYS,
  deleteAgentDraftsByIds,
  purgeExpiredAgentDrafts,
} from './draft-purge.server';

describe('agent draft purge', () => {
  beforeEach(() => {
    selects.queue = [];
    deleted.ids = [];
  });

  it('retains for 30 days past expiry', () => {
    expect(AGENT_DRAFT_PURGE_AFTER_EXPIRY_DAYS).toBe(30);
  });

  it('deletes overdue rows in a batch and reports none left', async () => {
    selects.queue = [[{ id: 'a' }, { id: 'b' }], [{ days: null }]];
    const summary = await purgeExpiredAgentDrafts(new Date('2026-11-30'));
    expect(deleted.ids).toEqual([['a', 'b']]);
    expect(summary).toEqual({
      deleted: 2,
      retentionDays: 30,
      oldestOverdueDays: null,
    });
  });

  it('does nothing when no rows are overdue', async () => {
    selects.queue = [[], [{ days: null }]];
    const summary = await purgeExpiredAgentDrafts();
    expect(summary.deleted).toBe(0);
    expect(deleted.ids).toEqual([]);
  });

  it('deletes drafts by id for account deletion and skips empty input', async () => {
    expect(await deleteAgentDraftsByIds([])).toBe(0);
    expect(await deleteAgentDraftsByIds(['x'])).toBe(1);
  });
});
