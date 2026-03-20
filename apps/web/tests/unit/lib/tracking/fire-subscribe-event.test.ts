import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---
const mockForwardToFacebook = vi.fn().mockResolvedValue({
  platform: 'facebook',
  success: true,
  responseId: '1',
});

vi.mock('@/lib/tracking/forwarding/facebook', () => ({
  forwardToFacebook: (...args: unknown[]) => mockForwardToFacebook(...args),
}));

const mockCheckBoolean = vi.fn().mockReturnValue(true);
vi.mock('@/lib/entitlements/registry', () => ({
  checkBoolean: (...args: unknown[]) => mockCheckBoolean(...args),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/utils/pii-encryption', () => ({
  decryptPII: vi.fn((val: string) => val),
}));

// Mock db with configurable query result
let mockDbResult: unknown[] = [];
const mockLimit = vi.fn(() => Promise.resolve(mockDbResult));
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockInnerJoin2 = vi.fn(() => ({ where: mockWhere }));
const mockInnerJoin1 = vi.fn(() => ({ innerJoin: mockInnerJoin2 }));
const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin1 }));
const mockSelectResult = vi.fn(() => ({ from: mockFrom }));

vi.mock('@/lib/db', () => ({
  db: {
    select: () => mockSelectResult(),
  },
}));

vi.mock('@/lib/db/schema/pixels', async importOriginal => {
  const orig = await importOriginal<typeof import('@/lib/db/schema/pixels')>();
  return { ...orig };
});

vi.mock('@/lib/db/schema/auth', () => ({
  users: { plan: 'plan', id: 'id' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', userId: 'userId' },
}));

// Mock env
const mockEnv: Record<string, string | undefined> = {};
vi.mock('@/lib/env-server', () => ({
  env: new Proxy({} as Record<string, string | undefined>, {
    get: (_target, prop) => mockEnv[prop as string],
  }),
}));

import { fireSubscribeCAPIEvent } from '@/lib/tracking/fire-subscribe-event';

describe('fireSubscribeCAPIEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbResult = [];
    mockEnv.JOVIE_FACEBOOK_PIXEL_ID = undefined;
    mockEnv.JOVIE_FACEBOOK_ACCESS_TOKEN = undefined;
  });

  it('hashes email with SHA-256 to expected hex', async () => {
    mockEnv.JOVIE_FACEBOOK_PIXEL_ID = 'jovie-fb-pixel';
    mockEnv.JOVIE_FACEBOOK_ACCESS_TOKEN = 'jovie-fb-token';

    await fireSubscribeCAPIEvent({
      creatorProfileId: 'prof-1',
      email: 'Test@Example.COM',
      sourceUrl: 'https://jov.ie/artist',
    });

    expect(mockForwardToFacebook).toHaveBeenCalled();
    const normalizedEvent = mockForwardToFacebook.mock.calls[0][0];

    // SHA-256 of "test@example.com" (lowercased, trimmed)
    // Using Web Crypto API in test environment
    expect(normalizedEvent.hashedEmail).toMatch(/^[0-9a-f]{64}$/);
    expect(normalizedEvent.eventType).toBe('subscribe');
  });

  it('forwards to creator Facebook pixel when configured and entitled', async () => {
    mockDbResult = [
      {
        pixels: {
          facebookPixelId: 'creator-fb-pixel',
          facebookAccessToken: 'creator-fb-token',
          facebookEnabled: true,
          profileId: 'prof-1',
        },
        plan: 'pro',
      },
    ];
    mockCheckBoolean.mockReturnValue(true);

    await fireSubscribeCAPIEvent({
      creatorProfileId: 'prof-1',
      email: 'fan@test.com',
      sourceUrl: 'https://jov.ie/artist',
    });

    // Should forward to creator pixel
    expect(mockForwardToFacebook).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'subscribe' }),
      expect.objectContaining({ pixelId: 'creator-fb-pixel' })
    );
  });

  it('forwards to Jovie pixel when env vars are set', async () => {
    mockEnv.JOVIE_FACEBOOK_PIXEL_ID = 'jovie-fb-pixel';
    mockEnv.JOVIE_FACEBOOK_ACCESS_TOKEN = 'jovie-fb-token';

    await fireSubscribeCAPIEvent({
      creatorProfileId: 'prof-1',
      sourceUrl: 'https://jov.ie/artist',
    });

    expect(mockForwardToFacebook).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'subscribe' }),
      expect.objectContaining({ pixelId: 'jovie-fb-pixel' })
    );
  });

  it('does NOT forward to creator pixel when not entitled', async () => {
    mockDbResult = [
      {
        pixels: {
          facebookPixelId: 'creator-fb-pixel',
          facebookAccessToken: 'creator-fb-token',
          facebookEnabled: true,
          profileId: 'prof-1',
        },
        plan: 'free',
      },
    ];
    mockCheckBoolean.mockReturnValue(false);

    await fireSubscribeCAPIEvent({
      creatorProfileId: 'prof-1',
      email: 'fan@test.com',
      sourceUrl: 'https://jov.ie/artist',
    });

    // Should NOT forward to creator pixel
    expect(mockForwardToFacebook).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pixelId: 'creator-fb-pixel' })
    );
  });

  it('forwards to both creator and Jovie when both configured', async () => {
    mockDbResult = [
      {
        pixels: {
          facebookPixelId: 'creator-fb-pixel',
          facebookAccessToken: 'creator-fb-token',
          facebookEnabled: true,
          profileId: 'prof-1',
        },
        plan: 'pro',
      },
    ];
    mockCheckBoolean.mockReturnValue(true);
    mockEnv.JOVIE_FACEBOOK_PIXEL_ID = 'jovie-fb-pixel';
    mockEnv.JOVIE_FACEBOOK_ACCESS_TOKEN = 'jovie-fb-token';

    await fireSubscribeCAPIEvent({
      creatorProfileId: 'prof-1',
      email: 'fan@test.com',
      sourceUrl: 'https://jov.ie/artist',
    });

    expect(mockForwardToFacebook).toHaveBeenCalledTimes(2);
  });

  it('does nothing when no pixels are configured', async () => {
    // No creator pixel, no Jovie env
    await fireSubscribeCAPIEvent({
      creatorProfileId: 'prof-1',
      sourceUrl: 'https://jov.ie/artist',
    });

    expect(mockForwardToFacebook).not.toHaveBeenCalled();
  });

  it('catches and logs errors without throwing', async () => {
    mockEnv.JOVIE_FACEBOOK_PIXEL_ID = 'jovie-fb-pixel';
    mockEnv.JOVIE_FACEBOOK_ACCESS_TOKEN = 'jovie-fb-token';
    mockForwardToFacebook.mockRejectedValueOnce(new Error('Network error'));

    // Should NOT throw
    await expect(
      fireSubscribeCAPIEvent({
        creatorProfileId: 'prof-1',
        sourceUrl: 'https://jov.ie/artist',
      })
    ).resolves.toBeUndefined();
  });

  it('includes hashed phone when provided', async () => {
    mockEnv.JOVIE_FACEBOOK_PIXEL_ID = 'jovie-fb-pixel';
    mockEnv.JOVIE_FACEBOOK_ACCESS_TOKEN = 'jovie-fb-token';

    await fireSubscribeCAPIEvent({
      creatorProfileId: 'prof-1',
      phone: '+1234567890',
      sourceUrl: 'https://jov.ie/artist',
    });

    const normalizedEvent = mockForwardToFacebook.mock.calls[0][0];
    expect(normalizedEvent.hashedPhone).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sets correct event metadata', async () => {
    mockEnv.JOVIE_FACEBOOK_PIXEL_ID = 'jovie-fb-pixel';
    mockEnv.JOVIE_FACEBOOK_ACCESS_TOKEN = 'jovie-fb-token';

    await fireSubscribeCAPIEvent({
      creatorProfileId: 'prof-1',
      ipAddress: '10.0.0.1',
      userAgent: 'TestBrowser/1.0',
      sourceUrl: 'https://jov.ie/artist',
    });

    const normalizedEvent = mockForwardToFacebook.mock.calls[0][0];
    expect(normalizedEvent.eventType).toBe('subscribe');
    expect(normalizedEvent.clientIp).toBe('10.0.0.1');
    expect(normalizedEvent.userAgent).toBe('TestBrowser/1.0');
    expect(normalizedEvent.sourceUrl).toBe('https://jov.ie/artist');
    expect(normalizedEvent.eventId).toContain('sub_prof-1_');
  });
});
