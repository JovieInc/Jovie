/**
 * Pixel Forwarding Types
 *
 * Shared types for server-side pixel forwarding to ad platforms.
 */

import type { CreatorPixel, PixelEvent } from '@/lib/db/schema';

/**
 * Result of a forwarding attempt to a single platform
 */
export interface ForwardingResult {
  platform: 'facebook' | 'google' | 'tiktok' | 'jovie';
  success: boolean;
  error?: string;
  responseId?: string;
}

/**
 * Normalized event data for forwarding
 */
export interface NormalizedEvent {
  eventId: string;
  eventType: 'page_view' | 'link_click' | 'form_submit' | 'scroll_depth';
  eventTime: number; // Unix timestamp in seconds
  sourceUrl: string;
  referrer?: string;

  // User data (hashed/anonymized)
  ipHash: string;
  userAgent?: string;

  // UTM parameters
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;

  // Event-specific data
  linkId?: string;
  linkUrl?: string;
  formType?: string;
}

/**
 * Config for forwarding to a specific platform
 */
export interface PlatformConfig {
  pixelId: string;
  accessToken: string;
  enabled: boolean;
}

/**
 * Normalize a pixel event for forwarding
 */
export function normalizeEvent(event: PixelEvent): NormalizedEvent {
  const eventData = event.eventData as Record<string, unknown> | null;

  return {
    eventId: event.id,
    eventType: event.eventType as NormalizedEvent['eventType'],
    eventTime: Math.floor(event.createdAt.getTime() / 1000),
    sourceUrl: (eventData?.pageUrl as string) || '',
    referrer: (eventData?.referrer as string) || undefined,
    ipHash: event.ipHash || '',
    userAgent: event.userAgent || undefined,
    utmSource: (eventData?.utmSource as string) || undefined,
    utmMedium: (eventData?.utmMedium as string) || undefined,
    utmCampaign: (eventData?.utmCampaign as string) || undefined,
    linkId: (eventData?.linkId as string) || undefined,
    linkUrl: (eventData?.linkUrl as string) || undefined,
    formType: (eventData?.formType as string) || undefined,
  };
}

/**
 * Extract platform config from creator pixel settings
 */
export function extractPlatformConfigs(config: CreatorPixel): {
  facebook: PlatformConfig | null;
  google: PlatformConfig | null;
  tiktok: PlatformConfig | null;
} {
  return {
    facebook:
      config.facebookPixelId &&
      config.facebookAccessToken &&
      config.facebookEnabled
        ? {
            pixelId: config.facebookPixelId,
            accessToken: config.facebookAccessToken,
            enabled: config.facebookEnabled,
          }
        : null,
    google:
      config.googleMeasurementId &&
      config.googleApiSecret &&
      config.googleEnabled
        ? {
            pixelId: config.googleMeasurementId,
            accessToken: config.googleApiSecret,
            enabled: config.googleEnabled,
          }
        : null,
    tiktok:
      config.tiktokPixelId && config.tiktokAccessToken && config.tiktokEnabled
        ? {
            pixelId: config.tiktokPixelId,
            accessToken: config.tiktokAccessToken,
            enabled: config.tiktokEnabled,
          }
        : null,
  };
}
