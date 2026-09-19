import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  db: { select: () => ({ from: () => ({ where: mocks.where }) }) },
}));
vi.mock('@/lib/db/queries/shared', () => ({ getUserByClerkId: mocks.user }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { GET } from '@/app/api/connectors/suggested-actions/route';
import { buildMobileInbox } from '@/lib/mobile/action-loop-inbox';
import { loadOpportunityInboxData } from './opportunity-inbox-data';

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth: async () => ({ userId: 'signed-in', error: null }),
}));
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: 'owner', isAdmin: false });
  mocks.where.mockReturnValue({ orderBy: () => ({ limit: mocks.limit }) });
  mocks.limit.mockResolvedValue([
    {
      id: 'creator-opportunity',
      kind: 'calendar.create_event',
      payload: { title: 'Creator workflow recommendation' },
      rationale: 'Creator value',
      createdAt: new Date(),
    },
  ]);
});

function expectConsumerQuery(call: number) {
  const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[call][0]);
  expect(query.sql).toContain('"suggested_actions"."kind" <>');
  expect(query.params).toEqual([
    'owner',
    'pending',
    'workflow_capture.request',
  ]);
}

describe('consumer opportunity storage boundary', () => {
  it.each([false, true])(
    'keeps founder/admin=%s on the consumer read policy',
    async isAdmin => {
      mocks.user.mockResolvedValue({ id: 'owner', isAdmin });
      const response = await GET();
      expect(response.status).toBe(200);
      expect(
        (await response.json()).cards.map((c: { id: string }) => c.id)
      ).toEqual(['creator-opportunity']);
      expectConsumerQuery(0);
      expect(mocks.limit).toHaveBeenCalledWith(50);
    }
  );
  it('uses the same owner and audience restriction through migration fallback and mobile', async () => {
    mocks.limit.mockRejectedValueOnce(
      new Error('column signal_type does not exist')
    );
    const result = await buildMobileInbox('signed-in');
    expect(result?.items.map(c => c.id)).toEqual(['creator-opportunity']);
    expect(result?.pendingCount).toBe(1);
    expectConsumerQuery(0);
    expectConsumerQuery(1);
  });
  it('does not query for an unknown owner and degrades missing tables to empty', async () => {
    mocks.user.mockResolvedValueOnce(null);
    expect(await loadOpportunityInboxData('unknown')).toBeNull();
    expect(mocks.where).not.toHaveBeenCalled();
    mocks.limit.mockRejectedValueOnce(
      new Error('relation "suggested_actions" does not exist')
    );
    expect((await loadOpportunityInboxData('signed-in'))?.cards).toEqual([]);
  });
  it('propagates unrelated storage failures', async () => {
    mocks.limit.mockRejectedValueOnce(new Error('offline'));
    await expect(loadOpportunityInboxData('signed-in')).rejects.toThrow(
      'offline'
    );
  });
});
