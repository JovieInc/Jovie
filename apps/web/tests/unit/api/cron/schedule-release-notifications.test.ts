import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const {
  mockDbSelect,
  mockDbInsert,
  mockDbInsertValues,
  mockDbInsertOnConflictDoUpdate,
  mockDbInsertReturning,
  mockGetBatchCreatorEntitlements,
  mockLoggerInfo,
  mockLoggerWarn,
  mockGte,
  mockLte,
  mockInArray,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbInsertValues: vi.fn(),
  mockDbInsertOnConflictDoUpdate: vi.fn(),
  mockDbInsertReturning: vi.fn(),
  mockGetBatchCreatorEntitlements: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  // Simplified passthrough mocks so assertions can inspect exact args instead
  // of walking drizzle-orm's internal SQL queryChunks structure. `and`/`eq`/
  // `asc`/`sql`/`gt` stay real (via importActual below) — they just need to
  // not throw when combining these plain objects, which they don't.
  mockGte: vi.fn((col: unknown, val: unknown) => ({ op: 'gte', col, val })),
  mockLte: vi.fn((col: unknown, val: unknown) => ({ op: 'lte', col, val })),
  mockInArray: vi.fn((col: unknown, vals: unknown) => ({
    op: 'inArray',
    col,
    vals,
  })),
}));

vi.mock('drizzle-orm', async () => {
  const actual =
    await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    gte: mockGte,
    lte: mockLte,
    inArray: mockInArray,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
  },
}));

vi.mock('@/lib/db/schema/analytics', () => ({
  notificationSubscriptions: {
    id: 'notificationSubscriptions.id',
    creatorProfileId: 'notificationSubscriptions.creatorProfileId',
    unsubscribedAt: 'notificationSubscriptions.unsubscribedAt',
    confirmedAt: 'notificationSubscriptions.confirmedAt',
    preferences: 'notificationSubscriptions.preferences',
    email: 'notificationSubscriptions.email',
    phone: 'notificationSubscriptions.phone',
    channel: 'notificationSubscriptions.channel',
  },
}));

vi.mock('@/lib/db/schema/content', () => ({
  discogReleases: {
    id: 'discogReleases.id',
    creatorProfileId: 'discogReleases.creatorProfileId',
    title: 'discogReleases.title',
    releaseDate: 'discogReleases.releaseDate',
    sourceType: 'discogReleases.sourceType',
  },
  providerLinks: {
    ownerType: 'providerLinks.ownerType',
    releaseId: 'providerLinks.releaseId',
  },
}));

vi.mock('@/lib/db/schema/dsp-enrichment', () => ({
  fanReleaseNotifications: {
    dedupKey: 'fanReleaseNotifications.dedupKey',
    status: 'fanReleaseNotifications.status',
    id: 'fanReleaseNotifications.id',
    campaignId: 'fanReleaseNotifications.campaignId', // JOV-2211
  },
}));

vi.mock('@/lib/entitlements/creator-plan', () => ({
  getBatchCreatorEntitlements: mockGetBatchCreatorEntitlements,
}));

vi.mock('@/lib/env-server', () => ({
  env: { CRON_SECRET: 'test-secret' },
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    error: vi.fn(),
  },
}));

function createFromWhereChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(result),
    }),
  };
}

function createFromLeftJoinWhereChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createFromWhereGroupByChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        groupBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

function createFromWhereOrderByLimitChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(result),
        }),
      }),
    }),
  };
}

const NOW = new Date('2026-03-24T18:00:00.000Z');
let scheduleReleaseNotifications: typeof import('@/app/api/cron/schedule-release-notifications/route').scheduleReleaseNotifications;

describe('scheduleReleaseNotifications', () => {
  beforeAll(async () => {
    ({ scheduleReleaseNotifications } = await import(
      '@/app/api/cron/schedule-release-notifications/route'
    ));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          {
            id: 'release_1',
            creatorProfileId: 'creator_1',
            title: 'Launch Day',
            releaseDate: new Date('2026-03-24T18:00:00.000Z'),
          },
        ]),
      }),
    });

    mockGetBatchCreatorEntitlements.mockRejectedValue(
      new Error('temporary entitlements outage')
    );

    mockDbInsert.mockReturnValue({ values: mockDbInsertValues });
    mockDbInsertValues.mockReturnValue({
      onConflictDoUpdate: mockDbInsertOnConflictDoUpdate,
    });
    mockDbInsertOnConflictDoUpdate.mockReturnValue({
      returning: mockDbInsertReturning,
    });
    mockDbInsertReturning.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws so the cron can retry when entitlements lookup fails', async () => {
    await expect(scheduleReleaseNotifications()).rejects.toThrow(
      'Creator entitlements lookup failed while scheduling release notifications'
    );
    expect(mockGetBatchCreatorEntitlements).toHaveBeenCalledWith(['creator_1']);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      '[schedule-release-notifications] Batch entitlements lookup failed, preserving releases for retry',
      expect.objectContaining({
        error: 'temporary entitlements outage',
        creatorCount: 1,
      })
    );
  });

  it('short-circuits with a zero-count result when no releases fall in the scheduling window', async () => {
    // Overrides the shared beforeEach fixture (one release in-window) so the
    // upcomingReleases query resolves empty instead.
    mockDbSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });

    const result = await scheduleReleaseNotifications();

    expect(result).toEqual({ scheduled: 0, releasesFound: 0 });
    // Proves the early return happens before the entitlements lookup and
    // before any further db.select call — not just that the counts happen
    // to end up at zero via some other path.
    expect(mockGetBatchCreatorEntitlements).not.toHaveBeenCalled();
    expect(mockDbSelect).toHaveBeenCalledTimes(1);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      '[schedule-release-notifications] No upcoming releases found'
    );
  });

  it('queries releases using the exact +/-15 minute scheduling window around now', async () => {
    // The entitlements lookup still rejects (beforeEach default) — this test only
    // cares about the upcomingReleases query built before that point.
    await expect(scheduleReleaseNotifications()).rejects.toThrow();

    expect(mockGte).toHaveBeenCalledWith(
      'discogReleases.releaseDate',
      new Date('2026-03-24T17:45:00.000Z')
    );
    expect(mockLte).toHaveBeenCalledWith(
      'discogReleases.releaseDate',
      new Date('2026-03-24T18:15:00.000Z')
    );
  });

  it('schedules an eligible subscriber and upserts the release-day dedup key', async () => {
    const releaseDate = new Date('2026-03-24T18:05:00.000Z');

    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(
        createFromWhereChain([
          {
            id: 'release_1',
            creatorProfileId: 'creator_1',
            title: 'Launch Day',
            releaseDate,
            sourceType: 'spotify',
          },
        ])
      )
      .mockReturnValueOnce(
        createFromLeftJoinWhereChain([
          {
            id: 'creator_1',
            isClaimed: true,
            settings: { spotifyImportStatus: 'complete' },
            spotifyId: 'spotify_1',
            trialNotificationsSent: 0,
          },
        ])
      )
      .mockReturnValueOnce(createFromWhereChain([{ releaseId: 'release_1' }]))
      .mockReturnValueOnce(
        createFromWhereGroupByChain([
          { creatorProfileId: 'creator_1', verifiedSubscriberCount: 5 },
        ])
      )
      .mockReturnValueOnce(
        createFromWhereOrderByLimitChain([
          {
            id: 'sub_1',
            creatorProfileId: 'creator_1',
            channel: 'email',
            email: 'fan@example.com',
            phone: null,
            preferences: { releaseDay: true },
          },
        ])
      );

    mockGetBatchCreatorEntitlements.mockResolvedValue(
      new Map([
        [
          'creator_1',
          {
            plan: 'pro',
            entitlements: {
              booleans: { canSendNotifications: true },
              limits: {},
            },
          },
        ],
      ])
    );

    mockDbInsertReturning.mockResolvedValue([{ id: 'notif_1' }]);

    const result = await scheduleReleaseNotifications();

    expect(result).toEqual({ scheduled: 1, releasesFound: 1 });

    // Exact insert payload — mutation-sensitive on dedupKey format, scheduledFor
    // (must be the release date, not `now`), and metadata shape.
    expect(mockDbInsertValues).toHaveBeenCalledWith([
      {
        creatorProfileId: 'creator_1',
        releaseId: 'release_1',
        notificationSubscriptionId: 'sub_1',
        notificationType: 'release_day',
        scheduledFor: releaseDate,
        status: 'pending',
        dedupKey: 'release_day:release_1:sub_1',
        metadata: { releaseTitle: 'Launch Day', channel: 'email' },
      },
    ]);

    // Dedup-suppression guard: conflicts target the dedupKey unique index and
    // only overwrite rows still `cancelled`/`pending` — a `sent`/`failed` row for
    // the same subscriber+release must not be clobbered by a re-run.
    expect(mockDbInsertOnConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'fanReleaseNotifications.dedupKey',
        set: expect.objectContaining({
          status: 'pending',
          error: null,
          updatedAt: NOW,
        }),
      })
    );
    const conflictArg = mockDbInsertOnConflictDoUpdate.mock.calls[0]?.[0];
    expect(conflictArg.setWhere).toEqual({
      op: 'inArray',
      col: 'fanReleaseNotifications.status',
      vals: ['cancelled', 'pending'],
    });
  });

  it('skips releases whose creator profile is not claimed and inserts nothing', async () => {
    mockDbSelect.mockReset();
    mockDbSelect
      .mockReturnValueOnce(
        createFromWhereChain([
          {
            id: 'release_1',
            creatorProfileId: 'creator_1',
            title: 'Launch Day',
            releaseDate: new Date('2026-03-24T18:05:00.000Z'),
            sourceType: 'spotify',
          },
        ])
      )
      .mockReturnValueOnce(
        createFromLeftJoinWhereChain([
          {
            id: 'creator_1',
            isClaimed: false,
            settings: { spotifyImportStatus: 'complete' },
            spotifyId: 'spotify_1',
            trialNotificationsSent: 0,
          },
        ])
      )
      .mockReturnValueOnce(createFromWhereChain([{ releaseId: 'release_1' }]))
      .mockReturnValueOnce(
        createFromWhereGroupByChain([
          { creatorProfileId: 'creator_1', verifiedSubscriberCount: 5 },
        ])
      );

    mockGetBatchCreatorEntitlements.mockResolvedValue(
      new Map([
        [
          'creator_1',
          {
            plan: 'pro',
            entitlements: {
              booleans: { canSendNotifications: true },
              limits: {},
            },
          },
        ],
      ])
    );

    const result = await scheduleReleaseNotifications();

    expect(result).toEqual({ scheduled: 0, releasesFound: 1 });
    expect(mockDbInsert).not.toHaveBeenCalled();
    // Exactly the 4 queued selects (releases, creators, smart links, subscriber
    // counts) must run — a 5th call would mean the ineligible release wrongly
    // reached the per-subscriber fetch loop. This is asserted directly (not just
    // via the log message) because `scheduleReleaseNotifications` wraps the
    // per-release call in try/catch, so a missing eligibility gate would
    // otherwise fail silently as a caught error rather than a visible mismatch.
    expect(mockDbSelect).toHaveBeenCalledTimes(4);
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      '[schedule-release-notifications] Skipped 1 ineligible releases'
    );
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      '[schedule-release-notifications] No eligible releases after eligibility checks'
    );
  });
});
