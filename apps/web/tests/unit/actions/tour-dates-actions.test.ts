import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks (resolved before any module imports)
// ---------------------------------------------------------------------------

const {
  mockGetCachedAuth,
  mockGetDashboardData,
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockDbDelete,
  mockRevalidatePath,
  mockRevalidateTag,
  mockVerifyBandsintownArtist,
  mockFetchBandsintownEvents,
  mockIsBandsintownConfigured,
  mockEncryptPII,
  mockDecryptPII,
  mockCheckBandsintownSyncRateLimit,
  mockCaptureError,
  mockTrackServerEvent,
  mockRedirect,
} = vi.hoisted(() => ({
  mockGetCachedAuth: vi.fn(),
  mockGetDashboardData: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockRevalidateTag: vi.fn(),
  mockVerifyBandsintownArtist: vi.fn(),
  mockFetchBandsintownEvents: vi.fn(),
  mockIsBandsintownConfigured: vi.fn(),
  mockEncryptPII: vi.fn(),
  mockDecryptPII: vi.fn(),
  mockCheckBandsintownSyncRateLimit: vi.fn(),
  mockCaptureError: vi.fn(),
  mockTrackServerEvent: vi.fn(),
  mockRedirect: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth/cached', () => ({
  getCachedAuth: mockGetCachedAuth,
}));

// The source file imports getDashboardData from '../actions' which resolves to
// the dashboard actions barrel. We mock the entire barrel re-export here.
vi.mock('@/app/app/(shell)/dashboard/actions', () => ({
  getDashboardData: mockGetDashboardData,
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
  },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id' },
}));

vi.mock('@/lib/db/schema/tour', () => ({
  tourDates: {
    id: 'id',
    profileId: 'profileId',
    externalId: 'externalId',
    provider: 'provider',
    startDate: 'startDate',
    lastSyncedAt: 'lastSyncedAt',
  },
}));

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
  unstable_cache: vi.fn((fn: () => unknown) => fn),
  revalidatePath: mockRevalidatePath,
  revalidateTag: mockRevalidateTag,
}));

vi.mock('next/dist/client/components/redirect-error', () => ({
  isRedirectError: vi.fn(() => false),
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/constants/routes', () => ({
  APP_ROUTES: { SETTINGS_TOURING: '/app/settings/touring' },
}));

vi.mock('@/lib/bandsintown', () => ({
  fetchBandsintownEvents: mockFetchBandsintownEvents,
  isBandsintownConfigured: mockIsBandsintownConfigured,
  verifyBandsintownArtist: mockVerifyBandsintownArtist,
}));

vi.mock('@/lib/utils/pii-encryption', () => ({
  encryptPII: mockEncryptPII,
  decryptPII: mockDecryptPII,
}));

vi.mock('@/lib/rate-limit/limiters', () => ({
  checkBandsintownSyncRateLimit: mockCheckBandsintownSyncRateLimit,
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: mockCaptureError,
}));

vi.mock('@/lib/server-analytics', () => ({
  trackServerEvent: mockTrackServerEvent,
}));

vi.mock('@/lib/utils/date', () => ({
  toISOStringSafe: vi.fn((d: Date | string) =>
    typeof d === 'string' ? d : new Date(d).toISOString()
  ),
  toISOStringOrNull: vi.fn((d: Date | string | null | undefined) =>
    d == null ? null : typeof d === 'string' ? d : new Date(d).toISOString()
  ),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ _and: args })),
  desc: vi.fn((col: unknown) => ({ _desc: col })),
  eq: vi.fn((a: unknown, b: unknown) => ({ _eq: [a, b] })),
  gte: vi.fn((a: unknown, b: unknown) => ({ _gte: [a, b] })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    _sql: strings.join('?'),
    values,
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default authenticated profile returned by getDashboardData */
const DEFAULT_PROFILE = {
  id: 'prof_123',
  username: 'testartist',
  usernameNormalized: 'testartist',
  bandsintownArtistName: null as string | null,
  bandsintownApiKey: null as string | null,
};

function setupAuthenticatedUser(
  overrides: Partial<typeof DEFAULT_PROFILE> = {}
) {
  mockGetCachedAuth.mockResolvedValue({ userId: 'user_123' });
  mockGetDashboardData.mockResolvedValue({
    needsOnboarding: false,
    selectedProfile: { ...DEFAULT_PROFILE, ...overrides },
  });
}

/** A sample TourDate row as it would come from the database */
function makeTourDateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'td_1',
    profileId: 'prof_123',
    externalId: null,
    provider: 'manual' as const,
    title: 'Test Show',
    startDate: new Date('2026-06-15T20:00:00Z'),
    startTime: '20:00',
    timezone: 'America/New_York',
    venueName: 'The Venue',
    city: 'New York',
    region: 'NY',
    country: 'US',
    latitude: 40.7128,
    longitude: -74.006,
    ticketUrl: 'https://tickets.example.com',
    ticketStatus: 'available' as const,
    lastSyncedAt: null,
    rawData: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/** Build a chained Drizzle-style query mock */
function chainMock(result: unknown) {
  const chain: Record<string, unknown> = {};
  const proxy = new Proxy(chain, {
    get(_target, prop) {
      if (prop === 'then') {
        // Make it thenable so await works on the chain directly
        return undefined;
      }
      // Every chained method returns the proxy, except terminal ones
      return vi.fn().mockReturnValue(
        new Proxy(
          {},
          {
            get(_t, p) {
              if (p === 'then') {
                // When the chain resolves (e.g. after the last call), resolve the result
                return (resolve: (v: unknown) => void) => resolve(result);
              }
              return vi.fn().mockReturnValue(
                new Proxy(
                  {},
                  {
                    get(_t2, p2) {
                      if (p2 === 'then') {
                        return (resolve: (v: unknown) => void) =>
                          resolve(result);
                      }
                      return vi.fn().mockReturnValue(
                        new Proxy(
                          {},
                          {
                            get(_t3, p3) {
                              if (p3 === 'then') {
                                return (resolve: (v: unknown) => void) =>
                                  resolve(result);
                              }
                              return vi.fn().mockReturnValue(
                                new Proxy(
                                  {},
                                  {
                                    get(_t4, p4) {
                                      if (p4 === 'then') {
                                        return (
                                          resolve: (v: unknown) => void
                                        ) => resolve(result);
                                      }
                                      return vi.fn().mockResolvedValue(result);
                                    },
                                  }
                                )
                              );
                            },
                          }
                        )
                      );
                    },
                  }
                )
              );
            },
          }
        )
      );
    },
  });
  return proxy;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('tour-dates/actions.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEncryptPII.mockImplementation((v: string) => `encrypted:${v}`);
    mockDecryptPII.mockImplementation((v: string | null) =>
      v ? v.replace('encrypted:', '') : null
    );
    mockCaptureError.mockResolvedValue(undefined);
    mockTrackServerEvent.mockReturnValue(undefined);
  });

  // ========================================================================
  // loadTourDates
  // ========================================================================

  describe('loadTourDates', () => {
    it('returns tour dates for authenticated user', async () => {
      setupAuthenticatedUser();
      const row = makeTourDateRow();
      mockDbSelect.mockReturnValue(chainMock([row]));

      const { loadTourDates } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await loadTourDates();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('td_1');
      expect(result[0].venueName).toBe('The Venue');
    });

    it('redirects unauthenticated users to sign-in', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { loadTourDates } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      await loadTourDates();

      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining('/sign-in')
      );
    });
  });

  // ========================================================================
  // loadUpcomingTourDates
  // ========================================================================

  describe('loadUpcomingTourDates', () => {
    it('returns only upcoming dates for a given profile', async () => {
      const row = makeTourDateRow({
        startDate: new Date('2026-12-01T20:00:00Z'),
      });
      mockDbSelect.mockReturnValue(chainMock([row]));

      const { loadUpcomingTourDates } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await loadUpcomingTourDates('prof_123');

      expect(result).toHaveLength(1);
      expect(mockDbSelect).toHaveBeenCalled();
    });

    it('does not require authentication', async () => {
      mockDbSelect.mockReturnValue(chainMock([]));

      const { loadUpcomingTourDates } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      await loadUpcomingTourDates('prof_public');

      // getCachedAuth should NOT have been called for this public action
      expect(mockGetCachedAuth).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // checkBandsintownConnection
  // ========================================================================

  describe('checkBandsintownConnection', () => {
    it('returns connected status when artist is configured', async () => {
      setupAuthenticatedUser({ bandsintownArtistName: 'My Artist' });
      mockIsBandsintownConfigured.mockReturnValue(true);
      mockDbSelect.mockReturnValue(
        chainMock([{ lastSyncedAt: new Date('2026-02-01T00:00:00Z') }])
      );

      const { checkBandsintownConnection } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const status = await checkBandsintownConnection();

      expect(status.connected).toBe(true);
      expect(status.artistName).toBe('My Artist');
      expect(status.hasApiKey).toBe(true);
    });

    it('returns disconnected for unauthenticated user', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { checkBandsintownConnection } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const status = await checkBandsintownConnection();

      expect(status.connected).toBe(false);
      expect(status.artistName).toBeNull();
      expect(status.hasApiKey).toBe(false);
    });
  });

  // ========================================================================
  // saveBandsintownApiKey
  // ========================================================================

  describe('saveBandsintownApiKey', () => {
    it('encrypts and stores the API key', async () => {
      setupAuthenticatedUser();
      mockDbUpdate.mockReturnValue(chainMock(undefined));

      const { saveBandsintownApiKey } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await saveBandsintownApiKey({
        apiKey: 'a-valid-api-key-12345',
      });

      expect(result.success).toBe(true);
      expect(mockEncryptPII).toHaveBeenCalledWith('a-valid-api-key-12345');
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/settings/touring');
    });

    it('rejects keys shorter than 10 characters', async () => {
      setupAuthenticatedUser();

      const { saveBandsintownApiKey } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await saveBandsintownApiKey({ apiKey: 'short' });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/too short/i);
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it('throws Unauthorized when not authenticated', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { saveBandsintownApiKey } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );

      await expect(
        saveBandsintownApiKey({ apiKey: 'a-valid-api-key-12345' })
      ).rejects.toThrow('Unauthorized');
    });
  });

  // ========================================================================
  // removeBandsintownApiKey
  // ========================================================================

  describe('removeBandsintownApiKey', () => {
    it('clears both API key and artist name from the profile', async () => {
      setupAuthenticatedUser({ bandsintownApiKey: 'encrypted:abc123' });
      mockDbUpdate.mockReturnValue(chainMock(undefined));

      const { removeBandsintownApiKey } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await removeBandsintownApiKey();

      expect(result.success).toBe(true);
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/settings/touring');
    });

    it('throws Unauthorized when not authenticated', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { removeBandsintownApiKey } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );

      await expect(removeBandsintownApiKey()).rejects.toThrow('Unauthorized');
    });
  });

  // ========================================================================
  // connectBandsintownArtist
  // ========================================================================

  describe('connectBandsintownArtist', () => {
    it('verifies artist, syncs events, and returns tour dates', async () => {
      setupAuthenticatedUser();
      mockVerifyBandsintownArtist.mockResolvedValue({ name: 'My Artist' });
      mockDecryptPII.mockReturnValue(null);
      mockDbUpdate.mockReturnValue(chainMock(undefined));

      const mockEvent = {
        externalId: 'bit_1',
        title: 'Concert',
        startDate: new Date('2026-07-01'),
        startTime: '21:00',
        timezone: 'America/Chicago',
        venueName: 'Big Hall',
        city: 'Chicago',
        region: 'IL',
        country: 'US',
        latitude: 41.8,
        longitude: -87.6,
        ticketUrl: 'https://tickets.example.com',
        ticketStatus: 'available' as const,
        rawData: {},
      };
      mockFetchBandsintownEvents.mockResolvedValue([mockEvent]);
      mockDbInsert.mockReturnValue(chainMock(undefined));
      // For the final select of updated tour dates
      mockDbSelect.mockReturnValue(chainMock([makeTourDateRow()]));

      const { connectBandsintownArtist } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await connectBandsintownArtist({
        artistName: 'My Artist',
      });

      expect(result.success).toBe(true);
      expect(result.synced).toBe(1);
      expect(result.tourDates).toHaveLength(1);
      expect(mockVerifyBandsintownArtist).toHaveBeenCalledWith(
        'My Artist',
        null
      );
    });

    it('returns failure when artist is not found on Bandsintown', async () => {
      setupAuthenticatedUser();
      mockVerifyBandsintownArtist.mockResolvedValue(null);
      mockDecryptPII.mockReturnValue(null);

      const { connectBandsintownArtist } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await connectBandsintownArtist({
        artistName: 'Unknown Artist',
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/not found/i);
      expect(result.synced).toBe(0);
    });
  });

  // ========================================================================
  // syncFromBandsintown
  // ========================================================================

  describe('syncFromBandsintown', () => {
    it('syncs events when rate limit allows', async () => {
      setupAuthenticatedUser({ bandsintownArtistName: 'Synced Artist' });
      mockCheckBandsintownSyncRateLimit.mockResolvedValue({ success: true });
      mockDecryptPII.mockReturnValue(null);
      mockFetchBandsintownEvents.mockResolvedValue([]);
      // upsertBandsintownEvents will call db.insert only if events.length > 0
      // With empty events, it short-circuits and returns 0

      const { syncFromBandsintown } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await syncFromBandsintown();

      expect(result.success).toBe(true);
      expect(result.synced).toBe(0);
      expect(mockRevalidateTag).toHaveBeenCalled();
    });

    it('rejects sync when rate limited', async () => {
      setupAuthenticatedUser({ bandsintownArtistName: 'Synced Artist' });
      mockCheckBandsintownSyncRateLimit.mockResolvedValue({
        success: false,
        reason: 'Please wait 3 minutes before syncing again.',
      });

      const { syncFromBandsintown } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await syncFromBandsintown();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/wait/i);
      expect(mockFetchBandsintownEvents).not.toHaveBeenCalled();
    });

    it('returns failure when no artist is connected', async () => {
      setupAuthenticatedUser({ bandsintownArtistName: null });

      const { syncFromBandsintown } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await syncFromBandsintown();

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/connect first/i);
    });
  });

  // ========================================================================
  // createTourDate
  // ========================================================================

  describe('createTourDate', () => {
    it('creates a manual tour date and invalidates cache', async () => {
      setupAuthenticatedUser();
      const row = makeTourDateRow();
      mockDbInsert.mockReturnValue(chainMock([row]));

      const { createTourDate } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await createTourDate({
        startDate: '2026-08-01T20:00:00Z',
        venueName: 'Test Venue',
        city: 'Austin',
        country: 'US',
      });

      expect(result.id).toBe('td_1');
      expect(mockDbInsert).toHaveBeenCalled();
      expect(mockRevalidateTag).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/settings/touring');
    });

    it('rejects invalid start date', async () => {
      setupAuthenticatedUser();

      const { createTourDate } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );

      await expect(
        createTourDate({
          startDate: 'not-a-date',
          venueName: 'Venue',
          city: 'City',
          country: 'US',
        })
      ).rejects.toThrow('Invalid start date');
    });

    it('rejects invalid ticket URL', async () => {
      setupAuthenticatedUser();

      const { createTourDate } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );

      await expect(
        createTourDate({
          startDate: '2026-08-01T20:00:00Z',
          venueName: 'Venue',
          city: 'City',
          country: 'US',
          ticketUrl: 'ftp://bad-protocol.com',
        })
      ).rejects.toThrow('Invalid ticket URL');
    });
  });

  // ========================================================================
  // updateTourDate
  // ========================================================================

  describe('updateTourDate', () => {
    it('updates an existing tour date with ownership check', async () => {
      setupAuthenticatedUser();
      const existing = makeTourDateRow();
      const updated = makeTourDateRow({ title: 'Updated Show' });

      // First call: ownership check select
      mockDbSelect.mockReturnValue(chainMock([existing]));
      // Second call: update returning
      mockDbUpdate.mockReturnValue(chainMock([updated]));

      const { updateTourDate } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await updateTourDate({
        id: 'td_1',
        title: 'Updated Show',
      });

      expect(result.id).toBe('td_1');
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockRevalidateTag).toHaveBeenCalled();
    });

    it('throws when tour date is not found (ownership check fails)', async () => {
      setupAuthenticatedUser();
      mockDbSelect.mockReturnValue(chainMock([]));

      const { updateTourDate } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );

      await expect(
        updateTourDate({ id: 'td_nonexistent', title: 'No' })
      ).rejects.toThrow('Tour date not found');
    });

    it('validates ticket URL on update', async () => {
      setupAuthenticatedUser();
      const existing = makeTourDateRow();
      mockDbSelect.mockReturnValue(chainMock([existing]));

      const { updateTourDate } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );

      await expect(
        updateTourDate({ id: 'td_1', ticketUrl: 'javascript:alert(1)' })
      ).rejects.toThrow('Invalid ticket URL');
    });
  });

  // ========================================================================
  // deleteTourDate
  // ========================================================================

  describe('deleteTourDate', () => {
    it('deletes a tour date owned by the user', async () => {
      setupAuthenticatedUser();
      mockDbDelete.mockReturnValue(chainMock({ rowCount: 1 }));

      const { deleteTourDate } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await deleteTourDate('td_1');

      expect(result.success).toBe(true);
      expect(mockDbDelete).toHaveBeenCalled();
      expect(mockRevalidateTag).toHaveBeenCalled();
    });

    it('throws when tour date is not found (ownership check)', async () => {
      setupAuthenticatedUser();
      mockDbDelete.mockReturnValue(chainMock({ rowCount: 0 }));

      const { deleteTourDate } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );

      await expect(deleteTourDate('td_not_mine')).rejects.toThrow(
        'Tour date not found'
      );
    });

    it('throws Unauthorized when not authenticated', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { deleteTourDate } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );

      await expect(deleteTourDate('td_1')).rejects.toThrow('Unauthorized');
    });
  });

  // ========================================================================
  // disconnectBandsintown
  // ========================================================================

  describe('disconnectBandsintown', () => {
    it('clears artist name and removes synced events', async () => {
      setupAuthenticatedUser({ bandsintownArtistName: 'Connected Artist' });
      mockDbUpdate.mockReturnValue(chainMock(undefined));
      mockDbDelete.mockReturnValue(chainMock({ rowCount: 3 }));

      const { disconnectBandsintown } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await disconnectBandsintown();

      expect(result.success).toBe(true);
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockDbDelete).toHaveBeenCalled();
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/settings/touring');
    });

    it('returns failure and captures error on database failure', async () => {
      setupAuthenticatedUser();
      // Make the update throw synchronously
      mockDbUpdate.mockImplementation(() => {
        throw new Error('DB error');
      });

      const { disconnectBandsintown } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const result = await disconnectBandsintown();

      expect(result.success).toBe(false);
      expect(mockCaptureError).toHaveBeenCalledWith(
        'Bandsintown disconnect failed',
        expect.any(Error),
        expect.objectContaining({ action: 'disconnectBandsintown' })
      );
    });

    it('throws Unauthorized when not authenticated', async () => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });

      const { disconnectBandsintown } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );

      await expect(disconnectBandsintown()).rejects.toThrow('Unauthorized');
    });
  });

  // ========================================================================
  // Cross-cutting: auth rejection
  // ========================================================================

  describe('auth rejection for protected actions', () => {
    beforeEach(() => {
      mockGetCachedAuth.mockResolvedValue({ userId: null });
    });

    it.each([
      ['saveBandsintownApiKey', { apiKey: 'valid-api-key-123' }],
      ['removeBandsintownApiKey', undefined],
      ['connectBandsintownArtist', { artistName: 'Test' }],
      ['syncFromBandsintown', undefined],
      [
        'createTourDate',
        { startDate: '2026-01-01', venueName: 'V', city: 'C', country: 'US' },
      ],
      ['updateTourDate', { id: 'td_1', title: 'T' }],
      ['deleteTourDate', 'td_1'],
      ['disconnectBandsintown', undefined],
    ] as const)('%s throws Unauthorized for unauthenticated users', async (actionName, args) => {
      const mod = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      const action = (
        mod as Record<string, (...a: unknown[]) => Promise<unknown>>
      )[actionName];

      await expect(
        args !== undefined ? action(args) : action()
      ).rejects.toThrow('Unauthorized');
    });
  });

  // ========================================================================
  // Cross-cutting: cache invalidation on mutations
  // ========================================================================

  describe('cache invalidation on mutations', () => {
    it('revalidates tag and path after createTourDate', async () => {
      setupAuthenticatedUser();
      mockDbInsert.mockReturnValue(chainMock([makeTourDateRow()]));

      const { createTourDate } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      await createTourDate({
        startDate: '2026-08-01T20:00:00Z',
        venueName: 'V',
        city: 'C',
        country: 'US',
      });

      expect(mockRevalidateTag).toHaveBeenCalledWith(
        'tour-dates:user_123:prof_123',
        'max'
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/settings/touring');
    });

    it('revalidates tag and path after deleteTourDate', async () => {
      setupAuthenticatedUser();
      mockDbDelete.mockReturnValue(chainMock({ rowCount: 1 }));

      const { deleteTourDate } = await import(
        '@/app/app/(shell)/dashboard/tour-dates/actions'
      );
      await deleteTourDate('td_1');

      expect(mockRevalidateTag).toHaveBeenCalledWith(
        'tour-dates:user_123:prof_123',
        'max'
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith('/app/settings/touring');
    });
  });
});
