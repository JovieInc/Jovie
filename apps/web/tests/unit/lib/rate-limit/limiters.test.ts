import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RateLimitResult } from '@/lib/rate-limit/types';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockLimit } = vi.hoisted(() => ({
  mockLimit: vi.fn(),
}));

/**
 * Every call to createRateLimiter returns a fake RateLimiter whose `.limit`
 * method delegates to `mockLimit`. This lets us control allowed/denied
 * results from one place while still verifying the correct key is passed.
 */
vi.mock('@/lib/rate-limit/rate-limiter', () => {
  class FakeRateLimiter {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
    limit = mockLimit;
    getStatus = vi.fn();
    wouldBeRateLimited = vi.fn();
    getBackend = vi.fn().mockReturnValue('memory');
    isRedisActive = vi.fn().mockReturnValue(false);
    getConfig = vi.fn(() => this.config);
    reset = vi.fn();
  }
  return {
    RateLimiter: FakeRateLimiter,
    createRateLimiter: (config: unknown) => new FakeRateLimiter(config),
  };
});

// Mock the config module so it does not pull in env-server / entitlements
vi.mock('@/lib/rate-limit/config', () => ({
  RATE_LIMITERS: {
    avatarUpload: {
      name: 'Avatar Upload',
      limit: 3,
      window: '1 m',
      prefix: 'avatar_upload',
    },
    artworkUpload: {
      name: 'Artwork Upload',
      limit: 5,
      window: '1 m',
      prefix: 'artwork_upload',
    },
    api: { name: 'API', limit: 100, window: '1 m', prefix: 'api_calls' },
    onboarding: {
      name: 'Onboarding',
      limit: 3,
      window: '1 h',
      prefix: 'onboarding',
    },
    handleCheck: {
      name: 'Handle Check',
      limit: 30,
      window: '1 m',
      prefix: 'handle_check',
    },
    dashboardLinks: {
      name: 'Dashboard Links',
      limit: 30,
      window: '1 m',
      prefix: 'dashboard_links',
    },
    paymentIntent: {
      name: 'Payment Intent',
      limit: 10,
      window: '1 h',
      prefix: 'payment_intent',
    },
    adminImpersonate: {
      name: 'Admin Impersonate',
      limit: 5,
      window: '1 h',
      prefix: 'admin:impersonate',
    },
    adminFitScores: {
      name: 'Admin Fit Scores',
      limit: 5,
      window: '1 h',
      prefix: 'admin:fit-scores',
    },
    adminCreatorIngest: {
      name: 'Admin Creator Ingest',
      limit: 10,
      window: '1 m',
      prefix: 'admin:creator-ingest',
    },
    trackingClicks: {
      name: 'Tracking Clicks (Creator)',
      limit: 10000,
      window: '1 h',
      prefix: 'tracking:clicks',
    },
    trackingVisits: {
      name: 'Tracking Visits (Creator)',
      limit: 50000,
      window: '1 h',
      prefix: 'tracking:visits',
    },
    trackingIpClicks: {
      name: 'Tracking Clicks (IP)',
      limit: 60,
      window: '1 m',
      prefix: 'tracking:ip:clicks',
    },
    trackingIpVisits: {
      name: 'Tracking Visits (IP)',
      limit: 120,
      window: '1 m',
      prefix: 'tracking:ip:visits',
    },
    publicProfile: {
      name: 'Public Profile',
      limit: 100,
      window: '1 m',
      prefix: 'public:profile',
    },
    publicClick: {
      name: 'Public Click',
      limit: 50,
      window: '1 m',
      prefix: 'public:click',
    },
    publicVisit: {
      name: 'Public Visit',
      limit: 50,
      window: '1 m',
      prefix: 'public:visit',
    },
    health: { name: 'Health', limit: 30, window: '1 m', prefix: 'health' },
    general: { name: 'General', limit: 60, window: '1 m', prefix: 'general' },
    spotifySearch: {
      name: 'Spotify Search',
      limit: 30,
      window: '1 m',
      prefix: 'spotify:search',
    },
    spotifyClaim: {
      name: 'Spotify Claim',
      limit: 5,
      window: '1 h',
      prefix: 'spotify:claim',
    },
    spotifyRefresh: {
      name: 'Spotify Refresh',
      limit: 10,
      window: '1 h',
      prefix: 'spotify:refresh',
    },
    spotifyPublicSearch: {
      name: 'Spotify Public Search',
      limit: 10,
      window: '1 m',
      prefix: 'spotify:public-search',
    },
    aiChat: { name: 'AI Chat', limit: 30, window: '1 h', prefix: 'ai:chat' },
    aiChatDailyFree: {
      name: 'AI Chat Daily (Free)',
      limit: 10,
      window: '1 d',
      prefix: 'ai:chat:daily:free',
    },
    aiChatDailyPro: {
      name: 'AI Chat Daily (Pro)',
      limit: 100,
      window: '1 d',
      prefix: 'ai:chat:daily:pro',
    },
    aiChatDailyGrowth: {
      name: 'AI Chat Daily (Growth)',
      limit: 200,
      window: '1 d',
      prefix: 'ai:chat:daily:growth',
    },
    bandsintownSync: {
      name: 'Bandsintown Sync',
      limit: 1,
      window: '5 m',
      prefix: 'bandsintown:sync',
    },
    dspDiscovery: {
      name: 'DSP Discovery',
      limit: 10,
      window: '1 m',
      prefix: 'dsp:discovery',
    },
    isrcRescan: {
      name: 'ISRC Rescan',
      limit: 1,
      window: '5 m',
      prefix: 'dsp:isrc-rescan',
    },
    accountDelete: {
      name: 'Account Delete',
      limit: 3,
      window: '1 d',
      prefix: 'account:delete',
    },
    accountExport: {
      name: 'Account Export',
      limit: 5,
      window: '1 h',
      prefix: 'account:export',
    },
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAllowedResult(
  overrides?: Partial<RateLimitResult>
): RateLimitResult {
  return {
    success: true,
    limit: 100,
    remaining: 99,
    reset: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

function makeDeniedResult(
  overrides?: Partial<RateLimitResult>
): RateLimitResult {
  return {
    success: false,
    limit: 100,
    remaining: 0,
    reset: new Date(Date.now() + 60_000),
    reason: 'rate limited',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('limiters.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // getAllLimiters
  // =========================================================================

  describe('getAllLimiters', () => {
    it('returns a map containing all expected limiter keys', async () => {
      const { getAllLimiters } = await import('@/lib/rate-limit/limiters');
      const limiters = getAllLimiters();

      const expectedKeys = [
        'avatarUpload',
        'artworkUpload',
        'api',
        'onboarding',
        'handleCheck',
        'dashboardLinks',
        'paymentIntent',
        'adminImpersonate',
        'adminFitScores',
        'adminCreatorIngest',
        'dspDiscovery',
        'isrcRescan',
        'trackingClicks',
        'trackingVisits',
        'trackingIpClicks',
        'trackingIpVisits',
        'publicProfile',
        'publicClick',
        'publicVisit',
        'health',
        'general',
        'spotifySearch',
        'spotifyClaim',
        'spotifyRefresh',
        'spotifyPublicSearch',
        'aiChat',
        'bandsintownSync',
        'accountDelete',
        'accountExport',
      ];

      for (const key of expectedKeys) {
        expect(limiters).toHaveProperty(key);
        expect(limiters[key]).toBeDefined();
      }
    });

    it('returns objects with a limit method', async () => {
      const { getAllLimiters } = await import('@/lib/rate-limit/limiters');
      const limiters = getAllLimiters();

      for (const limiter of Object.values(limiters)) {
        expect(typeof limiter.limit).toBe('function');
      }
    });
  });

  // =========================================================================
  // checkTrackingRateLimit
  // =========================================================================

  describe('checkTrackingRateLimit', () => {
    it('returns success when both creator and IP limits pass (click)', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkTrackingRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkTrackingRateLimit(
        'click',
        'creator-1',
        '1.2.3.4'
      );

      expect(result.success).toBe(true);
      // Should be called twice: once for creator limiter, once for IP limiter
      expect(mockLimit).toHaveBeenCalledTimes(2);
      expect(mockLimit).toHaveBeenCalledWith('creator-1');
      expect(mockLimit).toHaveBeenCalledWith('1.2.3.4');
    });

    it('returns success without IP check when ipAddress is omitted', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkTrackingRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkTrackingRateLimit('visit', 'creator-2');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledTimes(1);
      expect(mockLimit).toHaveBeenCalledWith('creator-2');
    });

    it('returns failure with reason when creator limit is exceeded', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { checkTrackingRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkTrackingRateLimit(
        'click',
        'creator-1',
        '1.2.3.4'
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBe('Creator rate limit exceeded');
      // Should stop after creator check fails -- no IP check
      expect(mockLimit).toHaveBeenCalledTimes(1);
    });

    it('returns failure with reason when IP limit is exceeded', async () => {
      mockLimit
        .mockResolvedValueOnce(makeAllowedResult()) // creator passes
        .mockResolvedValueOnce(makeDeniedResult()); // IP fails

      const { checkTrackingRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkTrackingRateLimit(
        'visit',
        'creator-1',
        '1.2.3.4'
      );

      expect(result.success).toBe(false);
      expect(result.reason).toBe('IP rate limit exceeded');
    });
  });

  // =========================================================================
  // checkOnboardingRateLimit
  // =========================================================================

  describe('checkOnboardingRateLimit', () => {
    it('returns success when both user and IP pass', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkOnboardingRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkOnboardingRateLimit('user-1', '10.0.0.1');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledWith('user:user-1');
      expect(mockLimit).toHaveBeenCalledWith('ip:10.0.0.1');
    });

    it('returns failure when user limit is exceeded', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { checkOnboardingRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkOnboardingRateLimit('user-1', '10.0.0.1');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'Too many onboarding attempts. Please try again later.'
      );
      expect(mockLimit).toHaveBeenCalledTimes(1);
    });

    it('returns failure when IP limit is exceeded', async () => {
      mockLimit
        .mockResolvedValueOnce(makeAllowedResult())
        .mockResolvedValueOnce(makeDeniedResult());

      const { checkOnboardingRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkOnboardingRateLimit('user-1', '10.0.0.1');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'Too many onboarding attempts from this network.'
      );
    });

    it('skips IP check when checkIP is false', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkOnboardingRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkOnboardingRateLimit(
        'user-1',
        '10.0.0.1',
        false
      );

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledTimes(1);
      expect(mockLimit).toHaveBeenCalledWith('user:user-1');
    });
  });

  // =========================================================================
  // checkSpotifySearchRateLimit
  // =========================================================================

  describe('checkSpotifySearchRateLimit', () => {
    it('returns success when under limit', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkSpotifySearchRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkSpotifySearchRateLimit('user-1');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledWith('user-1');
    });

    it('returns failure with search-specific message', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { checkSpotifySearchRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkSpotifySearchRateLimit('user-1');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'Search rate limit exceeded. Please wait before searching again.'
      );
    });
  });

  // =========================================================================
  // checkBandsintownSyncRateLimit
  // =========================================================================

  describe('checkBandsintownSyncRateLimit', () => {
    it('returns success when under limit', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkBandsintownSyncRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkBandsintownSyncRateLimit('profile-1');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledWith('profile-1');
    });

    it('returns failure with sync-specific message', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { checkBandsintownSyncRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkBandsintownSyncRateLimit('profile-1');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'Tour dates were recently synced. Please wait 5 minutes before syncing again.'
      );
    });
  });

  // =========================================================================
  // checkAiChatRateLimitForPlan
  // =========================================================================

  describe('checkAiChatRateLimitForPlan', () => {
    it('returns success when both burst and daily limits pass (free plan)', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkAiChatRateLimitForPlan } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAiChatRateLimitForPlan('user-1', null);

      expect(result.success).toBe(true);
      // burst + daily = 2 calls
      expect(mockLimit).toHaveBeenCalledTimes(2);
    });

    it('returns success for pro plan', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkAiChatRateLimitForPlan } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAiChatRateLimitForPlan('user-1', 'pro');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledTimes(2);
    });

    it('returns success for growth plan', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkAiChatRateLimitForPlan } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAiChatRateLimitForPlan('user-1', 'growth');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledTimes(2);
    });

    it('returns burst failure before checking daily limit', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { checkAiChatRateLimitForPlan } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAiChatRateLimitForPlan('user-1', 'pro');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'Too many messages in a short time. Please wait a moment.'
      );
      // Only the burst limiter should have been called
      expect(mockLimit).toHaveBeenCalledTimes(1);
    });

    it('returns daily quota failure with upgrade message for free plan', async () => {
      mockLimit
        .mockResolvedValueOnce(makeAllowedResult()) // burst passes
        .mockResolvedValueOnce(makeDeniedResult()); // daily fails

      const { checkAiChatRateLimitForPlan } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAiChatRateLimitForPlan('user-1', null);

      expect(result.success).toBe(false);
      expect(result.reason).toContain('Upgrade to Pro');
    });

    it('returns daily quota failure without upgrade message for pro plan', async () => {
      mockLimit
        .mockResolvedValueOnce(makeAllowedResult())
        .mockResolvedValueOnce(makeDeniedResult());

      const { checkAiChatRateLimitForPlan } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAiChatRateLimitForPlan('user-1', 'pro');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'You have reached your daily AI message limit. Your quota resets tomorrow.'
      );
    });

    it('returns daily quota failure without upgrade message for growth plan', async () => {
      mockLimit
        .mockResolvedValueOnce(makeAllowedResult())
        .mockResolvedValueOnce(makeDeniedResult());

      const { checkAiChatRateLimitForPlan } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAiChatRateLimitForPlan('user-1', 'growth');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'You have reached your daily AI message limit. Your quota resets tomorrow.'
      );
    });
  });

  // =========================================================================
  // checkDspDiscoveryRateLimit
  // =========================================================================

  describe('checkDspDiscoveryRateLimit', () => {
    it('returns success when under limit', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkDspDiscoveryRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkDspDiscoveryRateLimit('user-1');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledWith('user-1');
    });

    it('returns failure with discovery-specific message', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { checkDspDiscoveryRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkDspDiscoveryRateLimit('user-1');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'Discovery rate limit exceeded. Please wait before triggering another discovery.'
      );
    });
  });

  // =========================================================================
  // checkIsrcRescanRateLimit
  // =========================================================================

  describe('checkIsrcRescanRateLimit', () => {
    it('returns success when under limit', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkIsrcRescanRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkIsrcRescanRateLimit('release-1');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledWith('release-1');
    });

    it('returns failure with rescan-specific message', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { checkIsrcRescanRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkIsrcRescanRateLimit('release-1');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'This release was recently scanned. Please wait before scanning again.'
      );
    });
  });

  // =========================================================================
  // checkAdminFitScoresRateLimit
  // =========================================================================

  describe('checkAdminFitScoresRateLimit', () => {
    it('returns success when under limit', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkAdminFitScoresRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAdminFitScoresRateLimit('admin-1');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledWith('admin-1');
    });

    it('returns failure with fit-scores-specific message', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { checkAdminFitScoresRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAdminFitScoresRateLimit('admin-1');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'Fit score recalculation rate limit exceeded. Please wait before trying again.'
      );
    });
  });

  // =========================================================================
  // checkAdminCreatorIngestRateLimit
  // =========================================================================

  describe('checkAdminCreatorIngestRateLimit', () => {
    it('returns success when under limit', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkAdminCreatorIngestRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAdminCreatorIngestRateLimit('admin-1');

      expect(result.success).toBe(true);
      expect(mockLimit).toHaveBeenCalledWith('admin-1');
    });

    it('returns failure with ingest-specific message', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { checkAdminCreatorIngestRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAdminCreatorIngestRateLimit('admin-1');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'Creator ingest rate limit exceeded. Please wait before ingesting another profile.'
      );
    });
  });

  // =========================================================================
  // checkAccountDeleteRateLimit
  // =========================================================================

  describe('checkAccountDeleteRateLimit', () => {
    it('returns success when under limit', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkAccountDeleteRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAccountDeleteRateLimit('user-1');

      expect(result.success).toBe(true);
    });

    it('returns failure with deletion-specific message', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { checkAccountDeleteRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAccountDeleteRateLimit('user-1');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'Too many deletion attempts. Please try again later.'
      );
    });
  });

  // =========================================================================
  // checkAccountExportRateLimit
  // =========================================================================

  describe('checkAccountExportRateLimit', () => {
    it('returns success when under limit', async () => {
      mockLimit.mockResolvedValue(makeAllowedResult());

      const { checkAccountExportRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAccountExportRateLimit('user-1');

      expect(result.success).toBe(true);
    });

    it('returns failure with export-specific message', async () => {
      mockLimit.mockResolvedValue(makeDeniedResult());

      const { checkAccountExportRateLimit } = await import(
        '@/lib/rate-limit/limiters'
      );
      const result = await checkAccountExportRateLimit('user-1');

      expect(result.success).toBe(false);
      expect(result.reason).toBe(
        'Too many export requests. Please try again later.'
      );
    });
  });
});
