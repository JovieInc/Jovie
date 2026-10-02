import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureError: vi.fn(),
  getCanonicalContacts: vi.fn(),
  select: vi.fn(),
  selectRows: [] as unknown[][],
}));

vi.mock('@/lib/db', () => ({
  db: { select: mocks.select },
  doesTableExist: vi.fn(),
}));
vi.mock('@/lib/admin/contacts', () => ({
  getCanonicalContacts: mocks.getCanonicalContacts,
}));
vi.mock('@/lib/error-tracking', () => ({
  captureError: mocks.captureError,
}));

import {
  deriveCustomerBlocker,
  getCustomerRecovery,
  selectRecoveryMatch,
} from '@/lib/admin/customer-recovery';

function installDbRows(...rowSets: unknown[][]) {
  mocks.selectRows.splice(0, mocks.selectRows.length, ...rowSets);
  mocks.select.mockImplementation(() => {
    const rows = mocks.selectRows.shift() ?? [];
    const chain = {
      from: vi.fn(),
      limit: vi.fn(() => Promise.resolve(rows)),
      orderBy: vi.fn(),
      then: (
        onFulfilled?: (value: unknown[]) => unknown,
        onRejected?: (reason: unknown) => unknown
      ) => Promise.resolve(rows).then(onFulfilled, onRejected),
      where: vi.fn(),
    };
    chain.from.mockReturnValue(chain);
    chain.orderBy.mockReturnValue(chain);
    chain.where.mockReturnValue(chain);
    return chain;
  });
}

beforeEach(() => {
  mocks.captureError.mockReset();
  mocks.getCanonicalContacts.mockReset();
  mocks.select.mockReset();
  installDbRows();
});

describe('deriveCustomerBlocker', () => {
  it('offers rerun-ingestion when ingestion failed and a Spotify source exists', () => {
    const blocker = deriveCustomerBlocker({
      ingestionStatus: 'failed',
      lastIngestionError: 'spotify rate limited',
      hasSpotifySource: true,
    });
    expect(blocker.kind).toBe('ingestion-failed');
    expect(blocker.operation).toBe('rerun-ingestion');
    expect(blocker.preconditionNote).toBeNull();
    expect(blocker.summary).toBe('spotify rate limited');
  });

  it('is read-only when ingestion failed without a Spotify source', () => {
    const blocker = deriveCustomerBlocker({
      ingestionStatus: 'failed',
      lastIngestionError: null,
      hasSpotifySource: false,
    });
    expect(blocker.kind).toBe('ingestion-missing-source');
    expect(blocker.operation).toBeNull();
    expect(blocker.preconditionNote).toContain('Spotify');
  });

  it.each(['pending', 'processing'])(
    'blocks duplicate retry while ingestion is %s',
    status => {
      const blocker = deriveCustomerBlocker({
        ingestionStatus: status,
        lastIngestionError: null,
        hasSpotifySource: true,
      });
      expect(blocker.kind).toBe('ingestion-in-flight');
      expect(blocker.operation).toBeNull();
    }
  );

  it('reports no blocker for a healthy idle profile', () => {
    expect(
      deriveCustomerBlocker({
        ingestionStatus: 'idle',
        lastIngestionError: null,
        hasSpotifySource: true,
      }).kind
    ).toBe('none');
  });
});

describe('selectRecoveryMatch', () => {
  const contacts = [
    {
      dedupeKey: 'email:ada@x.com',
      email: 'ada@x.com',
      handle: null,
      userId: 'u1',
      creatorProfileId: 'p1',
      leadId: null,
      waitlistEntryId: null,
    },
    {
      dedupeKey: 'handle:ada',
      email: null,
      handle: 'ada',
      userId: null,
      creatorProfileId: 'p2',
      leadId: 'l1',
      waitlistEntryId: 'w1',
    },
  ];

  it('returns null with no matches', () => {
    expect(selectRecoveryMatch([], 'ada')).toBeNull();
  });

  it('prefers the explicit key param when present', () => {
    expect(selectRecoveryMatch(contacts, 'ada', 'handle:ada')).toBe(
      'handle:ada'
    );
  });

  it('ignores an unknown key and falls back to exact identifier match', () => {
    expect(selectRecoveryMatch(contacts, 'u1', 'bogus')).toBe(
      'email:ada@x.com'
    );
  });

  it('exact-matches on supported identifiers (email, handle, linked ids)', () => {
    expect(selectRecoveryMatch(contacts, 'ADA@X.COM')).toBe('email:ada@x.com');
    expect(selectRecoveryMatch(contacts, 'w1')).toBe('handle:ada');
  });

  it('requires explicit selection for ambiguous fuzzy searches', () => {
    expect(selectRecoveryMatch(contacts, 'ad')).toBeNull();
  });
});

describe('getCustomerRecovery', () => {
  it('returns an empty dossier without querying for a blank search', async () => {
    const result = await getCustomerRecovery('   ');

    expect(result).toMatchObject({
      search: '',
      matches: [],
      dossier: null,
      error: null,
      generatedAt: expect.any(String),
    });
    expect(mocks.getCanonicalContacts).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('assembles independently sourced facts and offers the supported repair', async () => {
    const observedAt = new Date('2026-10-02T16:00:00.000Z');
    mocks.getCanonicalContacts.mockResolvedValue({
      contacts: [
        {
          dedupeKey: 'email:ada@analytical-engine.co',
          displayName: 'Ada',
          email: 'ada@analytical-engine.co',
          handle: 'ada',
          stage: 'paying',
          overrideStage: null,
          sources: ['user', 'profile', 'waitlist'],
          certifiedAt: observedAt,
          activityAt: observedAt,
          userId: 'user-1',
          creatorProfileId: 'profile-1',
          leadId: null,
          waitlistEntryId: 'waitlist-1',
        },
      ],
    });
    installDbRows(
      [
        {
          userStatus: 'active',
          plan: 'pro',
          isPro: true,
          stripeSubscriptionId: 'sub_1',
          email: 'ada@analytical-engine.co',
          deletedAt: null,
        },
      ],
      [
        {
          status: 'approved',
          approvedAt: observedAt,
          invitedAt: null,
          signedUpAt: observedAt,
        },
      ],
      [
        {
          claimedAt: observedAt,
          isVerified: true,
          ingestionStatus: 'failed',
          lastIngestionError: 'spotify rate limited',
          spotifyId: 'spotify-artist-1',
          spotifyUrl: null,
          usernameNormalized: 'ada',
        },
      ],
      [{ value: 2 }],
      [{ value: 7 }],
      [{ title: 'Analytical Engine' }],
      [
        {
          type: 'artist-ingest',
          result: 'failed',
          failureReason: 'spotify rate limited',
          createdAt: observedAt,
        },
      ]
    );

    const result = await getCustomerRecovery('  ADA@analytical-engine.co  ');

    expect(mocks.getCanonicalContacts).toHaveBeenCalledWith({
      page: 1,
      pageSize: 8,
      search: 'ADA@analytical-engine.co',
      throwOnError: true,
    });
    expect(result).toMatchObject({
      search: 'ADA@analytical-engine.co',
      matches: [
        {
          dedupeKey: 'email:ada@analytical-engine.co',
          displayName: 'Ada',
          email: 'ada@analytical-engine.co',
          handle: 'ada',
          stage: 'paying',
        },
      ],
      dossier: {
        identity: {
          dedupeKey: 'email:ada@analytical-engine.co',
          certifiedAt: observedAt.toISOString(),
          activityAt: observedAt.toISOString(),
        },
        account: {
          userStatus: 'active',
          plan: 'pro',
          isPro: true,
          isPaying: true,
          deletedAt: null,
        },
        authority: {
          profileClaimed: true,
          claimedAt: observedAt.toISOString(),
          isVerified: true,
          ingestionStatus: 'failed',
          hasSpotifySource: true,
        },
        admission: {
          status: 'approved',
          approvedAt: observedAt.toISOString(),
          invitedAt: null,
          signedUpAt: observedAt.toISOString(),
        },
        connections: { activeSocialLinks: 2 },
        launch: {
          releaseCount: 7,
          latestReleaseTitle: 'Analytical Engine',
        },
        recentOperations: [
          {
            type: 'artist-ingest',
            result: 'failed',
            failureReason: 'spotify rate limited',
            createdAt: observedAt.toISOString(),
          },
        ],
        blocker: {
          kind: 'ingestion-failed',
          operation: 'rerun-ingestion',
        },
      },
    });
    expect(mocks.select).toHaveBeenCalledTimes(7);
  });

  it('reports contact failures as unavailable instead of no-match', async () => {
    const error = new Error('contacts unavailable');
    mocks.getCanonicalContacts.mockRejectedValue(error);

    const result = await getCustomerRecovery('ada', 'email:ada@example.com');

    expect(result).toMatchObject({
      search: 'ada',
      matches: [],
      dossier: null,
      error: 'unavailable',
    });
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Error loading customer recovery matches',
      error,
      { search: 'ada', key: 'email:ada@example.com' }
    );
  });

  it('keeps ambiguous matches read-only until the operator selects one', async () => {
    mocks.getCanonicalContacts.mockResolvedValue({
      contacts: [
        {
          dedupeKey: 'email:ada@example.com',
          displayName: 'Ada One',
          email: 'ada@example.com',
          handle: 'ada-one',
          stage: 'lead',
        },
        {
          dedupeKey: 'handle:ada-two',
          displayName: 'Ada Two',
          email: null,
          handle: 'ada-two',
          stage: 'lead',
        },
      ],
    });

    const result = await getCustomerRecovery('ada');

    expect(result.matches).toHaveLength(2);
    expect(result.dossier).toBeNull();
    expect(result.error).toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('keeps matches visible when dossier evidence is unavailable', async () => {
    const error = new Error('profile read unavailable');
    const contact = {
      dedupeKey: 'email:ada@example.com',
      displayName: 'Ada',
      email: 'ada@example.com',
      handle: 'ada',
      stage: 'lead',
      overrideStage: null,
      sources: ['user'],
      certifiedAt: null,
      activityAt: null,
      userId: 'user-1',
      creatorProfileId: 'profile-1',
      leadId: null,
      waitlistEntryId: null,
    };
    mocks.getCanonicalContacts.mockResolvedValue({ contacts: [contact] });
    mocks.select.mockImplementationOnce(() => {
      throw error;
    });

    const result = await getCustomerRecovery('ada@example.com');

    expect(result).toMatchObject({
      matches: [{ dedupeKey: 'email:ada@example.com' }],
      dossier: null,
      error: 'unavailable',
    });
    expect(mocks.captureError).toHaveBeenCalledWith(
      'Error building customer recovery dossier',
      error,
      {
        search: 'ada@example.com',
        key: undefined,
        dedupeKey: 'email:ada@example.com',
      }
    );
  });

  it('resolves a key-only deep link through the canonical projection', async () => {
    mocks.getCanonicalContacts.mockResolvedValue({ contacts: [] });

    const result = await getCustomerRecovery('', 'email:missing@example.com');

    expect(mocks.getCanonicalContacts).toHaveBeenCalledWith({
      page: 1,
      pageSize: 8,
      search: 'email:missing@example.com',
      throwOnError: true,
    });
    expect(result).toMatchObject({
      matches: [],
      dossier: null,
      error: null,
    });
  });
});
