import { describe, expect, it } from 'vitest';
import type { CreatorPixel, PixelEvent } from '@/lib/db/schema/pixels';
import {
  extractPlatformConfigs,
  normalizeEvent,
} from '@/lib/tracking/forwarding/types';

function makePixelEvent(overrides: Partial<PixelEvent> = {}): PixelEvent {
  return {
    id: 'evt-123',
    profileId: 'prof-456',
    sessionId: 'sess-789',
    eventType: 'page_view',
    eventData: {
      pageUrl: 'https://jov.ie/artist',
      referrer: 'https://google.com',
      utmSource: 'meta',
      utmMedium: 'retargeting',
      utmCampaign: 'spring',
      linkId: 'link-1',
      linkUrl: 'https://spotify.com/track/123',
      formType: 'subscribe',
      tipAmount: 5.0,
      tipMethod: 'stripe',
    },
    consentGiven: true,
    clientIp: '192.168.1.1',
    ipHash: 'abc123hash',
    userAgent: 'Mozilla/5.0',
    forwardingStatus: {},
    retryCount: 0,
    forwardAt: new Date('2025-01-01T00:00:00Z'),
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeCreatorPixel(overrides: Partial<CreatorPixel> = {}): CreatorPixel {
  return {
    id: 'px-1',
    profileId: 'prof-1',
    facebookPixelId: 'fb-pixel-123',
    facebookAccessToken: 'fb-token-secret',
    googleMeasurementId: 'G-XXXXX',
    googleApiSecret: 'google-secret',
    tiktokPixelId: 'tt-pixel-456',
    tiktokAccessToken: 'tt-token-secret',
    enabled: true,
    facebookEnabled: true,
    googleEnabled: true,
    tiktokEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('normalizeEvent', () => {
  it('maps all PixelEvent fields correctly', () => {
    const event = makePixelEvent();
    const normalized = normalizeEvent(event);

    expect(normalized.eventId).toBe('evt-123');
    expect(normalized.eventType).toBe('page_view');
    expect(normalized.eventTime).toBe(
      Math.floor(new Date('2025-01-01T00:00:00Z').getTime() / 1000)
    );
    expect(normalized.sourceUrl).toBe('https://jov.ie/artist');
    expect(normalized.referrer).toBe('https://google.com');
    expect(normalized.clientIp).toBe('192.168.1.1');
    expect(normalized.ipHash).toBe('abc123hash');
    expect(normalized.userAgent).toBe('Mozilla/5.0');
    expect(normalized.utmSource).toBe('meta');
    expect(normalized.utmMedium).toBe('retargeting');
    expect(normalized.utmCampaign).toBe('spring');
    expect(normalized.linkId).toBe('link-1');
    expect(normalized.linkUrl).toBe('https://spotify.com/track/123');
    expect(normalized.formType).toBe('subscribe');
    expect(normalized.tipAmount).toBe(5.0);
    expect(normalized.tipMethod).toBe('stripe');
  });

  it('handles missing eventData gracefully', () => {
    const event = makePixelEvent({ eventData: null as unknown as undefined });
    const normalized = normalizeEvent(event);

    expect(normalized.sourceUrl).toBe('');
    expect(normalized.referrer).toBeUndefined();
    expect(normalized.utmSource).toBeUndefined();
    expect(normalized.linkId).toBeUndefined();
    expect(normalized.tipAmount).toBeUndefined();
  });

  it('handles empty eventData object', () => {
    const event = makePixelEvent({ eventData: {} });
    const normalized = normalizeEvent(event);

    expect(normalized.sourceUrl).toBe('');
    expect(normalized.referrer).toBeUndefined();
    expect(normalized.utmSource).toBeUndefined();
  });

  it('handles missing clientIp and userAgent', () => {
    const event = makePixelEvent({
      clientIp: null,
      userAgent: null,
      ipHash: null,
    });
    const normalized = normalizeEvent(event);

    expect(normalized.clientIp).toBeUndefined();
    expect(normalized.userAgent).toBeUndefined();
    expect(normalized.ipHash).toBe('');
  });

  it('converts createdAt to unix seconds', () => {
    const date = new Date('2025-06-15T12:30:45.123Z');
    const event = makePixelEvent({ createdAt: date });
    const normalized = normalizeEvent(event);

    expect(normalized.eventTime).toBe(Math.floor(date.getTime() / 1000));
  });
});

describe('extractPlatformConfigs', () => {
  it('returns configs for all platforms when fully configured', () => {
    const config = makeCreatorPixel();
    const result = extractPlatformConfigs(config);

    expect(result.facebook).toEqual({
      pixelId: 'fb-pixel-123',
      accessToken: 'fb-token-secret',
      enabled: true,
    });
    expect(result.google).toEqual({
      pixelId: 'G-XXXXX',
      accessToken: 'google-secret',
      enabled: true,
    });
    expect(result.tiktok).toEqual({
      pixelId: 'tt-pixel-456',
      accessToken: 'tt-token-secret',
      enabled: true,
    });
  });

  it('returns null for facebook when pixelId is missing', () => {
    const config = makeCreatorPixel({ facebookPixelId: null });
    const result = extractPlatformConfigs(config);
    expect(result.facebook).toBeNull();
  });

  it('returns null for facebook when accessToken is missing', () => {
    const config = makeCreatorPixel({ facebookAccessToken: null });
    const result = extractPlatformConfigs(config);
    expect(result.facebook).toBeNull();
  });

  it('returns null for facebook when disabled', () => {
    const config = makeCreatorPixel({ facebookEnabled: false });
    const result = extractPlatformConfigs(config);
    expect(result.facebook).toBeNull();
  });

  it('returns null for google when measurementId is missing', () => {
    const config = makeCreatorPixel({ googleMeasurementId: null });
    const result = extractPlatformConfigs(config);
    expect(result.google).toBeNull();
  });

  it('returns null for google when apiSecret is missing', () => {
    const config = makeCreatorPixel({ googleApiSecret: null });
    const result = extractPlatformConfigs(config);
    expect(result.google).toBeNull();
  });

  it('returns null for google when disabled', () => {
    const config = makeCreatorPixel({ googleEnabled: false });
    const result = extractPlatformConfigs(config);
    expect(result.google).toBeNull();
  });

  it('returns null for tiktok when pixelId is missing', () => {
    const config = makeCreatorPixel({ tiktokPixelId: null });
    const result = extractPlatformConfigs(config);
    expect(result.tiktok).toBeNull();
  });

  it('returns null for tiktok when accessToken is missing', () => {
    const config = makeCreatorPixel({ tiktokAccessToken: null });
    const result = extractPlatformConfigs(config);
    expect(result.tiktok).toBeNull();
  });

  it('returns null for tiktok when disabled', () => {
    const config = makeCreatorPixel({ tiktokEnabled: false });
    const result = extractPlatformConfigs(config);
    expect(result.tiktok).toBeNull();
  });

  it('returns all null when nothing is configured', () => {
    const config = makeCreatorPixel({
      facebookPixelId: null,
      facebookAccessToken: null,
      googleMeasurementId: null,
      googleApiSecret: null,
      tiktokPixelId: null,
      tiktokAccessToken: null,
    });
    const result = extractPlatformConfigs(config);
    expect(result.facebook).toBeNull();
    expect(result.google).toBeNull();
    expect(result.tiktok).toBeNull();
  });

  it('respects per-platform enabled flags independently', () => {
    const config = makeCreatorPixel({
      facebookEnabled: true,
      googleEnabled: false,
      tiktokEnabled: true,
    });
    const result = extractPlatformConfigs(config);
    expect(result.facebook).not.toBeNull();
    expect(result.google).toBeNull();
    expect(result.tiktok).not.toBeNull();
  });
});
