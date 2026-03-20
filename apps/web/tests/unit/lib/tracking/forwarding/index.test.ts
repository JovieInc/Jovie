import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorPixel, PixelEvent } from '@/lib/db/schema/pixels';

// --- Mocks ---
const mockUpdate = vi.fn().mockReturnValue({
  set: vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  }),
});

const mockSelect = vi.fn().mockReturnValue({
  from: vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([]),
    }),
    innerJoin: vi.fn().mockReturnValue({
      innerJoin: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  }),
});

vi.mock('@/lib/db', () => ({
  db: {
    update: (...args: unknown[]) => mockUpdate(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock('@/lib/db/schema/pixels', async importOriginal => {
  const orig = await importOriginal<typeof import('@/lib/db/schema/pixels')>();
  return {
    ...orig,
  };
});

vi.mock('@/lib/db/schema/auth', () => ({
  users: { plan: 'plan', id: 'id', isPro: 'isPro' },
}));

vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: { id: 'id', userId: 'userId' },
}));

vi.mock('@/lib/entitlements/registry', () => ({
  checkBoolean: vi.fn().mockReturnValue(true),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock('@/lib/utils/pii-encryption', () => ({
  decryptPII: vi.fn((val: string) => val),
}));

const mockForwardToFacebook = vi.fn().mockResolvedValue({
  platform: 'facebook',
  success: true,
  responseId: '1',
});

const mockForwardToGoogle = vi.fn().mockResolvedValue({
  platform: 'google',
  success: true,
});

const mockForwardToTikTok = vi.fn().mockResolvedValue({
  platform: 'tiktok',
  success: true,
  responseId: 'req-abc',
});

vi.mock('@/lib/tracking/forwarding/facebook', () => ({
  forwardToFacebook: (...args: unknown[]) => mockForwardToFacebook(...args),
}));

vi.mock('@/lib/tracking/forwarding/google', () => ({
  forwardToGoogle: (...args: unknown[]) => mockForwardToGoogle(...args),
}));

vi.mock('@/lib/tracking/forwarding/tiktok', () => ({
  forwardToTikTok: (...args: unknown[]) => mockForwardToTikTok(...args),
}));

// Mock env with Jovie pixel credentials
vi.mock('@/lib/env-server', () => ({
  env: {
    JOVIE_FACEBOOK_PIXEL_ID: 'jovie-fb-pixel',
    JOVIE_FACEBOOK_ACCESS_TOKEN: 'jovie-fb-token',
    JOVIE_GOOGLE_MEASUREMENT_ID: 'G-JOVIE',
    JOVIE_GOOGLE_API_SECRET: 'jovie-google-secret',
    JOVIE_TIKTOK_PIXEL_ID: 'jovie-tt-pixel',
    JOVIE_TIKTOK_ACCESS_TOKEN: 'jovie-tt-token',
  },
}));

// Import after mocks are set up
import { forwardEvent } from '@/lib/tracking/forwarding/index';

function makePixelEvent(overrides: Partial<PixelEvent> = {}): PixelEvent {
  return {
    id: 'evt-123',
    profileId: 'prof-456',
    sessionId: 'sess-789',
    eventType: 'page_view',
    eventData: { pageUrl: 'https://jov.ie/artist' },
    consentGiven: true,
    clientIp: '1.2.3.4',
    ipHash: 'hash123',
    userAgent: 'Mozilla/5.0',
    forwardingStatus: {},
    retryCount: 0,
    forwardAt: new Date(),
    createdAt: new Date(),
    ...overrides,
  };
}

describe('forwardEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock chain for update
    mockUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
  });

  it('skips forwarding when consent is not given', async () => {
    const event = makePixelEvent({ consentGiven: false });
    const results = await forwardEvent(event);

    expect(results).toEqual([]);
    // Should call db.update to mark as skipped
    expect(mockUpdate).toHaveBeenCalled();
    // Should NOT call any forwarder
    expect(mockForwardToFacebook).not.toHaveBeenCalled();
    expect(mockForwardToGoogle).not.toHaveBeenCalled();
    expect(mockForwardToTikTok).not.toHaveBeenCalled();
  });

  it('forwards to Jovie pixels when env vars are set', async () => {
    const event = makePixelEvent();
    const results = await forwardEvent(event);

    // Should call all three Jovie forwarders
    expect(mockForwardToFacebook).toHaveBeenCalled();
    expect(mockForwardToGoogle).toHaveBeenCalled();
    expect(mockForwardToTikTok).toHaveBeenCalled();

    // Results should include jovie-prefixed platforms
    expect(results.length).toBeGreaterThanOrEqual(3);
  });

  it('forwards to creator pixels when configured and entitled', async () => {
    const creatorConfig: CreatorPixel = {
      id: 'px-1',
      profileId: 'prof-456',
      facebookPixelId: 'creator-fb-pixel',
      facebookAccessToken: 'creator-fb-token',
      googleMeasurementId: null,
      googleApiSecret: null,
      tiktokPixelId: null,
      tiktokAccessToken: null,
      enabled: true,
      facebookEnabled: true,
      googleEnabled: true,
      tiktokEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const configMap = new Map<string, CreatorPixel>([
      ['prof-456', creatorConfig],
    ]);
    const event = makePixelEvent();
    const results = await forwardEvent(event, configMap);

    // Facebook should be called for both Jovie and creator
    // The total calls = 3 (Jovie: fb, google, tiktok) + 1 (creator: fb)
    expect(mockForwardToFacebook).toHaveBeenCalledTimes(2);
    expect(results.length).toBeGreaterThanOrEqual(4);
  });

  it('does not forward creator pixels when creator config not in map', async () => {
    const configMap = new Map<string, CreatorPixel>();
    const event = makePixelEvent();

    mockForwardToFacebook.mockClear();
    await forwardEvent(event, configMap);

    // Only Jovie pixels (3 platforms), no creator pixels
    expect(mockForwardToFacebook).toHaveBeenCalledTimes(1); // only Jovie FB
  });

  it('handles mixed success/failure results', async () => {
    mockForwardToFacebook.mockResolvedValueOnce({
      platform: 'facebook',
      success: true,
    });
    mockForwardToGoogle.mockResolvedValueOnce({
      platform: 'google',
      success: false,
      error: 'API error',
    });
    mockForwardToTikTok.mockResolvedValueOnce({
      platform: 'tiktok',
      success: true,
    });

    const event = makePixelEvent();
    const results = await forwardEvent(event);

    const successes = results.filter(r => r.success);
    const failures = results.filter(r => !r.success);
    expect(successes.length).toBeGreaterThanOrEqual(2);
    expect(failures.length).toBeGreaterThanOrEqual(1);

    // Should still update DB with forwarding status
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('does not forward to creator when config is disabled', async () => {
    const creatorConfig: CreatorPixel = {
      id: 'px-1',
      profileId: 'prof-456',
      facebookPixelId: 'creator-fb-pixel',
      facebookAccessToken: 'creator-fb-token',
      googleMeasurementId: null,
      googleApiSecret: null,
      tiktokPixelId: null,
      tiktokAccessToken: null,
      enabled: false, // disabled
      facebookEnabled: true,
      googleEnabled: true,
      tiktokEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const configMap = new Map<string, CreatorPixel>([
      ['prof-456', creatorConfig],
    ]);
    const event = makePixelEvent();

    mockForwardToFacebook.mockClear();
    await forwardEvent(event, configMap);

    // Should only be called once for Jovie's pixel, not creator's
    expect(mockForwardToFacebook).toHaveBeenCalledTimes(1);
  });

  it('updates the database with forwarding status after forwarding', async () => {
    const event = makePixelEvent();
    await forwardEvent(event);

    // Last call to update should be for forwarding status (not skipped)
    expect(mockUpdate).toHaveBeenCalled();
  });
});
