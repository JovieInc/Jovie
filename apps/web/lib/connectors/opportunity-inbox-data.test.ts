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
import {
  resolveInboxNavigationAvailability,
  shouldShowInboxNavigation,
} from '@/lib/inbox/navigation-availability';
import { buildMobileInbox } from '@/lib/mobile/action-loop-inbox';
import {
  countPendingCreatorInboxActions,
  loadOpportunityInboxData,
  loadOpportunityInboxTourDateSections,
} from './opportunity-inbox-data';

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
  // Case-insensitive exact-kind exclusion, mirroring the lowercased JS
  // predicate in isCreatorInboxSourceKind.
  expect(query.sql).toContain('lower("suggested_actions"."kind") <>');
  expect(query.params).toEqual([
    'owner',
    'pending',
    'workflow_capture.request',
    'founder.%',
    'ops.%',
    'ovie.%',
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
      expect(mocks.limit).toHaveBeenCalledWith(200);
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
  it('applies learned artist feedback when ranking social replies', async () => {
    const basePayload = {
      schemaVersion: 1,
      platform: 'youtube',
      sourceId: 'video-1',
      authorLabel: '@listener',
      authorKind: 'anonymous',
      inboundText: 'Hello',
      inboundAt: '2026-10-02T12:00:00.000Z',
      draftedText: 'Thanks for reaching out.',
      sourceUrl: 'https://youtube.com/watch?v=video-1',
    };
    mocks.limit
      .mockResolvedValueOnce([
        {
          id: 'prior-thread',
          kind: 'social_reply.draft',
          payload: {
            ...basePayload,
            title: 'Prior thread',
            targetId: 'comment-1',
            rankingSignals: { relationship: ['prior_thread'] },
          },
          rationale: null,
          createdAt: new Date('2026-10-02T12:00:00.000Z'),
        },
        {
          id: 'repeat-commenter',
          kind: 'social_reply.draft',
          payload: {
            ...basePayload,
            title: 'Repeat commenter',
            targetId: 'comment-2',
            rankingSignals: { relationship: ['repeat_commenter'] },
          },
          rationale: null,
          createdAt: new Date('2026-10-02T12:00:00.000Z'),
        },
      ])
      .mockResolvedValueOnce([
        ...Array.from({ length: 12 }, () => ({
          context: {
            verdict: 'rejected',
            socialInboxFeatureKeys: ['relationship:prior_thread'],
          },
        })),
        ...Array.from({ length: 12 }, () => ({
          context: {
            rating: 'positive',
            socialInboxFeatureKeys: ['relationship:repeat_commenter'],
          },
        })),
      ]);

    const result = await loadOpportunityInboxData('signed-in');

    expect(result?.cards.map(card => card.id)).toEqual([
      'repeat-commenter',
      'prior-thread',
    ]);
    expect(mocks.limit).toHaveBeenNthCalledWith(1, 200);
    expect(mocks.limit).toHaveBeenNthCalledWith(2, 500);
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
  it('reports missing storage as unknown rather than a verified empty inbox', async () => {
    mocks.limit.mockRejectedValueOnce(
      new Error('relation "suggested_actions" does not exist')
    );
    const result = await loadOpportunityInboxData('signed-in');
    expect(result?.cards).toEqual([]);
    expect(result?.availability).toEqual({
      suggestedActions: 'unknown',
      tourDates: 'not_requested',
    });
  });
  it('distinguishes healthy empty reads from an unrequested tour-date source', async () => {
    mocks.limit.mockResolvedValueOnce([]);
    expect((await loadOpportunityInboxData('signed-in'))?.availability).toEqual(
      { suggestedActions: 'available', tourDates: 'not_requested' }
    );
    expect(mocks.limit).toHaveBeenCalledTimes(1);
  });
  it('keeps successful date sections when another attempted section fails', async () => {
    mocks.limit.mockResolvedValueOnce([
      {
        id: 'date-1',
        title: 'Detroit show',
        startDate: new Date('2026-11-01'),
        startTime: null,
        venueName: 'Venue',
        city: 'Detroit',
        region: 'MI',
        country: 'US',
        provider: 'bandsintown',
        confirmationStatus: 'pending',
      },
    ]);
    mocks.limit.mockRejectedValueOnce(new Error('dates unavailable'));
    mocks.limit.mockResolvedValueOnce([]);
    const result = await loadOpportunityInboxTourDateSections('profile-1');
    expect(result.availability).toBe('unknown');
    expect(result.pending.map(item => item.id)).toEqual(['date-1']);
    expect(result.confirmed).toEqual([]);
  });
  it('marks successfully checked empty date sections as available', async () => {
    mocks.limit.mockResolvedValue([]);
    expect(
      (await loadOpportunityInboxTourDateSections('profile-1')).availability
    ).toBe('available');
  });
});

describe('explicit operator provenance', () => {
  it.each([false, true])(
    'keeps operator sources out of creator payloads for admin=%s without keyword filtering history',
    async isAdmin => {
      mocks.user.mockResolvedValue({ id: 'owner', isAdmin });
      const kinds = [
        'calendar.create_event',
        'founder.brain_dump',
        'ops.healthcheck',
        'ovie.review',
        'healthcheck.legacy_customer',
      ];
      mocks.limit.mockResolvedValue(
        kinds.map(kind => ({
          id: kind,
          kind,
          payload: { title: kind },
          rationale: null,
          createdAt: new Date(),
        }))
      );
      const response = await GET();
      expect(response.status).toBe(200);
      expect(
        (await response.json()).cards.map((card: { id: string }) => card.id)
      ).toEqual(['calendar.create_event', 'healthcheck.legacy_customer']);
      const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0][0]);
      expect(query.params).toContain('owner');
      expect(query.params).toContain('founder.%');
      expect(query.params).toContain('ops.%');
      expect(query.params).toContain('ovie.%');
    }
  );
});

describe('creator-work badge count', () => {
  interface PendingRow {
    readonly userId: string;
    readonly status: string;
    readonly kind: string;
  }

  /**
   * A fake db handle whose where() evaluates the compiled SQL the helper
   * actually emits against fixture rows. Clause shapes are located in the
   * emitted SQL and asserted present, so a dropped eligibility clause fails
   * the test instead of silently passing.
   */
  function countingDb(rows: readonly PendingRow[]) {
    let captured: ReturnType<PgDialect['sqlToQuery']> | undefined;
    const handle = {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            const query = new PgDialect().sqlToQuery(
              condition as Parameters<PgDialect['sqlToQuery']>[0]
            );
            captured = query;
            const count = rows.filter(row =>
              matchesPendingCreatorWhere(row, query)
            ).length;
            return Promise.resolve([{ count }]);
          },
        }),
      }),
    };
    return {
      captured: () => captured,
      handle: handle as unknown as Parameters<
        typeof countPendingCreatorInboxActions
      >[1],
    };
  }

  function matchesPendingCreatorWhere(
    row: PendingRow,
    query: ReturnType<PgDialect['sqlToQuery']>
  ): boolean {
    const userClause = /"suggested_actions"\."user_id" = \$(\d+)/.exec(
      query.sql
    );
    const statusClause = /"suggested_actions"\."status" = \$(\d+)/.exec(
      query.sql
    );
    const kindInsensitive =
      /lower\("suggested_actions"\."kind"\) <> \$(\d+)/.exec(query.sql);
    const kindSensitive = /"suggested_actions"\."kind" <> \$(\d+)/.exec(
      query.sql
    );
    const kindExact = kindInsensitive ?? kindSensitive;
    const kindPrefixes = [
      ...query.sql.matchAll(/"suggested_actions"\."kind" not ilike \$(\d+)/g),
    ];
    expect(userClause, 'user clause').not.toBeNull();
    expect(statusClause, 'status clause').not.toBeNull();
    expect(kindExact, 'exact-kind exclusion').not.toBeNull();
    expect(kindPrefixes.length, 'operator prefix exclusions').toBeGreaterThan(
      0
    );
    if (row.userId !== query.params[Number(userClause![1]) - 1]) return false;
    if (row.status !== query.params[Number(statusClause![1]) - 1]) return false;
    const exactValue = String(query.params[Number(kindExact![1]) - 1]);
    if (
      kindInsensitive
        ? row.kind.toLowerCase() === exactValue.toLowerCase()
        : row.kind === exactValue
    ) {
      return false;
    }
    for (const match of kindPrefixes) {
      const pattern = String(query.params[Number(match[1]) - 1]);
      if (
        row.kind.toLowerCase().startsWith(pattern.slice(0, -1).toLowerCase())
      ) {
        return false;
      }
    }
    return true;
  }

  it('produces no creator-work badge from operator-only pending rows', async () => {
    const db = countingDb([
      { userId: 'owner', status: 'pending', kind: 'workflow_capture.request' },
      { userId: 'owner', status: 'pending', kind: 'WORKFLOW_CAPTURE.REQUEST' },
      { userId: 'owner', status: 'pending', kind: 'founder.brain_dump' },
      { userId: 'owner', status: 'pending', kind: 'ops.healthcheck' },
      { userId: 'owner', status: 'pending', kind: 'ovie.review' },
    ]);
    const count = await countPendingCreatorInboxActions('owner', db.handle);
    expect(count).toBe(0);
    // A zero count resolves to a conclusively empty Inbox — no badge.
    expect(resolveInboxNavigationAvailability(count, 0)).toEqual({
      state: 'empty',
      pendingCount: 0,
    });
    expect(
      shouldShowInboxNavigation(resolveInboxNavigationAvailability(count, 0))
    ).toBe(false);
  });

  it('counts only creator-review rows in a mixed pending set', async () => {
    const db = countingDb([
      { userId: 'owner', status: 'pending', kind: 'calendar.create_event' },
      { userId: 'owner', status: 'pending', kind: 'social_reply.draft' },
      { userId: 'owner', status: 'pending', kind: 'ops.healthcheck' },
      { userId: 'owner', status: 'approved', kind: 'calendar.create_event' },
      { userId: 'other-user', status: 'pending', kind: 'creator.suggestion' },
    ]);
    await expect(
      countPendingCreatorInboxActions('owner', db.handle)
    ).resolves.toBe(2);
  });

  it('runs on the supplied transaction instead of the module db', async () => {
    const db = countingDb([]);
    await countPendingCreatorInboxActions('owner', db.handle);
    expect(mocks.where).not.toHaveBeenCalled();
    const query = db.captured();
    expect(query).toBeDefined();
    // Same eligibility the feed query applies (see expectConsumerQuery)…
    expect(query!.sql).toContain('lower("suggested_actions"."kind") <>');
    expect(query!.params).toEqual([
      'owner',
      'pending',
      'workflow_capture.request',
      'founder.%',
      'ops.%',
      'ovie.%',
    ]);
    // …and the badge is the uncapped source-eligible total, never derived
    // from the feed's capped candidate page: no limit clause, and the fake
    // handle exposes no limit method (calling one would throw).
    expect(query!.sql.toLowerCase()).not.toContain('limit');
    expect(mocks.limit).not.toHaveBeenCalled();
  });
});
