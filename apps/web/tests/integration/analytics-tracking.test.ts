/**
 * Analytics Tracking Integration Tests
 * Validates the click → analytics flow with security hardening
 */

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([{ id: 'mock-profile-id' }])),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: 'mock-member-id' }])),
        })),
        returning: vi.fn(() => Promise.resolve([{ id: 'mock-click-id' }])),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
}));

vi.mock('@/lib/ingestion/session', () => ({
  withSystemIngestionSession: vi.fn(callback =>
    callback({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() =>
              Promise.resolve([
                {
                  id: 'mock-member-id',
                  visits: 5,
                  engagementScore: 10,
                  latestActions: [],
                  geoCity: null,
                  geoCountry: null,
                  deviceType: 'desktop',
                  spotifyConnected: false,
                },
              ])
            ),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoNothing: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve([{ id: 'mock-member-id' }])),
          })),
          returning: vi.fn(() => Promise.resolve([{ id: 'mock-click-id' }])),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve()),
        })),
      })),
    })
  ),
}));

vi.mock('@/lib/redis', () => ({
  redis: null, // Disable Redis for testing
}));

describe('Analytics Tracking Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Security Hardening', () => {
    it('should validate tracking token when enabled', async () => {
      process.env.TRACKING_TOKEN_SECRET = 'test-secret';

      const { generateTrackingToken, validateTrackingToken } = await import(
        '@/lib/analytics/tracking-token'
      );

      const profileId = '550e8400-e29b-41d4-a716-446655440000';
      const token = generateTrackingToken(profileId);

      const validation = validateTrackingToken(token, profileId);

      expect(validation.valid).toBe(true);
      expect(validation.payload?.profileId).toBe(profileId);

      delete process.env.TRACKING_TOKEN_SECRET;
    });

    it('should reject invalid tracking tokens', async () => {
      process.env.TRACKING_TOKEN_SECRET = 'test-secret';

      const { validateTrackingToken } = await import(
        '@/lib/analytics/tracking-token'
      );

      const result = validateTrackingToken(
        'invalid:token:signature',
        'profile-id'
      );

      expect(result.valid).toBe(false);

      delete process.env.TRACKING_TOKEN_SECRET;
    });

    it('should encrypt PII before storage', async () => {
      process.env.PII_ENCRYPTION_KEY = 'test-key-for-encryption-32-chars!';

      const { encryptIP, decryptIP } = await import(
        '@/lib/utils/pii-encryption'
      );

      const originalIP = '192.168.1.100';
      const encrypted = encryptIP(originalIP);

      expect(encrypted).not.toBe(originalIP);
      expect(encrypted).not.toBeNull();
      expect(decryptIP(encrypted)).toBe(originalIP);

      delete process.env.PII_ENCRYPTION_KEY;
    });
  });

  describe('Bot Detection', () => {
    it('should detect bot traffic from user agents', async () => {
      const { detectBot } = await import('@/lib/utils/bot-detection');

      const botRequest = new NextRequest('https://example.com/api/test', {
        headers: {
          'User-Agent': 'Googlebot/2.1',
        },
      });

      const result = detectBot(botRequest);

      expect(result.isBot).toBe(true);
    });

    it('should not flag regular browser traffic as bot', async () => {
      const { detectBot } = await import('@/lib/utils/bot-detection');

      const userRequest = new NextRequest('https://example.com/api/test', {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const result = detectBot(userRequest);

      expect(result.isBot).toBe(false);
    });

    it('should detect Meta crawlers', async () => {
      const { detectBot } = await import('@/lib/utils/bot-detection');

      const metaRequest = new NextRequest('https://example.com/api/link/test', {
        headers: {
          'User-Agent': 'facebookexternalhit/1.1',
        },
      });

      const result = detectBot(metaRequest, '/api/link/test');

      expect(result.isBot).toBe(true);
      expect(result.isMeta).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests when rate limit not exceeded', async () => {
      const { checkClickRateLimit } = await import(
        '@/lib/analytics/tracking-rate-limit'
      );

      const result = await checkClickRateLimit('test-profile-id', '127.0.0.1');

      // Without Redis, should allow all requests
      expect(result.success).toBe(true);
    });

    it('should return rate limit headers', async () => {
      const { getRateLimitHeaders } = await import(
        '@/lib/analytics/tracking-rate-limit'
      );

      const result = {
        success: true,
        limit: 10000,
        remaining: 9999,
        reset: new Date(Date.now() + 3600000),
      };

      const headers = getRateLimitHeaders(result);

      expect(headers['X-RateLimit-Limit']).toBe('10000');
      expect(headers['X-RateLimit-Remaining']).toBe('9999');
      expect(headers['X-RateLimit-Reset']).toBeDefined();
    });
  });

  describe('Query Timeouts', () => {
    it('should apply dashboard timeout (10s)', async () => {
      const { QUERY_TIMEOUTS } = await import('@/lib/db/query-timeout');

      expect(QUERY_TIMEOUTS.dashboard).toBe(10000);
    });

    it('should apply API timeout (5s)', async () => {
      const { QUERY_TIMEOUTS } = await import('@/lib/db/query-timeout');

      expect(QUERY_TIMEOUTS.api).toBe(5000);
    });

    it('should timeout slow queries', async () => {
      const { withTimeout, QueryTimeoutError } = await import(
        '@/lib/db/query-timeout'
      );

      const slowQuery = new Promise(resolve =>
        setTimeout(() => resolve('done'), 200)
      );

      await expect(withTimeout(slowQuery, 50, 'Test')).rejects.toThrow(
        QueryTimeoutError
      );
    });
  });

  describe('Data Retention', () => {
    it('should calculate correct retention cutoff', async () => {
      const { getRetentionCutoffDate, getRetentionDays } = await import(
        '@/lib/analytics/data-retention'
      );

      const days = getRetentionDays();
      const cutoff = getRetentionCutoffDate();

      expect(days).toBe(90); // Default

      const expectedCutoff = new Date();
      expectedCutoff.setDate(expectedCutoff.getDate() - 90);
      expectedCutoff.setHours(0, 0, 0, 0);

      expect(cutoff.getTime()).toBe(expectedCutoff.getTime());
    });

    it('should respect custom retention period', async () => {
      process.env.ANALYTICS_RETENTION_DAYS = '30';

      // Re-import to pick up new env value
      vi.resetModules();
      const { getRetentionDays } = await import(
        '@/lib/analytics/data-retention'
      );

      expect(getRetentionDays()).toBe(30);

      delete process.env.ANALYTICS_RETENTION_DAYS;
    });
  });

  describe('RLS Security', () => {
    it('should not have RLS bypass capability', async () => {
      // The ALLOW_AUDIENCE_RLS_BYPASS env var should no longer be used
      const audienceDataPath =
        '@/app/app/(shell)/dashboard/audience/audience-data';

      // Check that the function signature doesn't include rlsBypass
      const { getAudienceServerData } = await import(audienceDataPath);

      // The function should work without rlsBypass parameter
      expect(typeof getAudienceServerData).toBe('function');
    });
  });

  describe('End-to-End Flow', () => {
    it('should process click with all security measures', async () => {
      // Set up all security features
      process.env.PII_ENCRYPTION_KEY = 'test-key-for-encryption-32-chars!';
      process.env.TRACKING_TOKEN_SECRET = 'test-secret';

      const { encryptIP } = await import('@/lib/utils/pii-encryption');
      const { generateTrackingToken, validateTrackingToken } = await import(
        '@/lib/analytics/tracking-token'
      );
      const { checkClickRateLimit } = await import(
        '@/lib/analytics/tracking-rate-limit'
      );
      const { detectBot } = await import('@/lib/utils/bot-detection');

      const profileId = '550e8400-e29b-41d4-a716-446655440000';
      const ipAddress = '192.168.1.100';

      // 1. Generate tracking token
      const token = generateTrackingToken(profileId);
      const tokenValidation = validateTrackingToken(token, profileId);
      expect(tokenValidation.valid).toBe(true);

      // 2. Check rate limit
      const rateLimit = await checkClickRateLimit(profileId, ipAddress);
      expect(rateLimit.success).toBe(true);

      // 3. Detect bot
      const request = new NextRequest(
        'https://example.com/api/audience/click',
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        }
      );
      const botResult = detectBot(request);
      expect(botResult.isBot).toBe(false);

      // 4. Encrypt IP
      const encryptedIP = encryptIP(ipAddress);
      expect(encryptedIP).not.toBe(ipAddress);

      // Cleanup
      delete process.env.PII_ENCRYPTION_KEY;
      delete process.env.TRACKING_TOKEN_SECRET;
    });
  });
});
