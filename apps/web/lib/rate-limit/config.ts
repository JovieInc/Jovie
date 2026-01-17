/**
 * Unified Rate Limit Configuration
 *
 * Central configuration for all rate limiters in the application.
 * Consolidates configurations from multiple sources into one place.
 */

import type { RateLimitConfig } from './types';

// ============================================================================
// Environment-configurable limits
// ============================================================================

const TRACKING_CLICKS_PER_HOUR = parseInt(
  process.env.TRACKING_RATE_LIMIT_CLICKS_PER_HOUR ?? '10000',
  10
);

const TRACKING_VISITS_PER_HOUR = parseInt(
  process.env.TRACKING_RATE_LIMIT_VISITS_PER_HOUR ?? '50000',
  10
);

// ============================================================================
// Rate Limiter Configurations
// ============================================================================

/**
 * All rate limiter configurations in the application
 */
export const RATE_LIMITERS = {
  // ---------------------------------------------------------------------------
  // Authentication & User Operations
  // ---------------------------------------------------------------------------

  /** Avatar upload: 3 uploads per minute per user */
  avatarUpload: {
    name: 'Avatar Upload',
    limit: 3,
    window: '1 m',
    prefix: 'avatar_upload',
    analytics: true,
  } satisfies RateLimitConfig,

  /** General API: 100 requests per minute per IP */
  api: {
    name: 'API',
    limit: 100,
    window: '1 m',
    prefix: 'api_calls',
    analytics: true,
  } satisfies RateLimitConfig,

  // ---------------------------------------------------------------------------
  // Onboarding Operations
  // ---------------------------------------------------------------------------

  /** Onboarding: 3 attempts per hour per user/IP - CRITICAL for security */
  onboarding: {
    name: 'Onboarding',
    limit: 3,
    window: '1 h',
    prefix: 'onboarding',
    analytics: true,
  } satisfies RateLimitConfig,

  /** Handle check: 30 checks per minute per IP */
  handleCheck: {
    name: 'Handle Check',
    limit: 30,
    window: '1 m',
    prefix: 'handle_check',
    analytics: true,
  } satisfies RateLimitConfig,

  // ---------------------------------------------------------------------------
  // Dashboard Operations
  // ---------------------------------------------------------------------------

  /** Dashboard links: 30 requests per minute per user */
  dashboardLinks: {
    name: 'Dashboard Links',
    limit: 30,
    window: '1 m',
    prefix: 'dashboard_links',
    analytics: true,
  } satisfies RateLimitConfig,

  // ---------------------------------------------------------------------------
  // Payment Operations
  // ---------------------------------------------------------------------------

  /** Payment intents: 10 intents per hour per user - CRITICAL for Stripe API protection */
  paymentIntent: {
    name: 'Payment Intent',
    limit: 10,
    window: '1 h',
    prefix: 'payment_intent',
    analytics: true,
  } satisfies RateLimitConfig,

  // ---------------------------------------------------------------------------
  // Admin Operations
  // ---------------------------------------------------------------------------

  /** Admin impersonation: 5 attempts per hour per admin - CRITICAL for security */
  adminImpersonate: {
    name: 'Admin Impersonate',
    limit: 5,
    window: '1 h',
    prefix: 'admin:impersonate',
    analytics: true,
  } satisfies RateLimitConfig,

  // ---------------------------------------------------------------------------
  // Tracking & Analytics
  // ---------------------------------------------------------------------------

  /** Click tracking per creator: configurable, default 10k/hour */
  trackingClicks: {
    name: 'Tracking Clicks (Creator)',
    limit: TRACKING_CLICKS_PER_HOUR,
    window: '1 h',
    prefix: 'tracking:clicks',
    analytics: true,
  } satisfies RateLimitConfig,

  /** Visit tracking per creator: configurable, default 50k/hour */
  trackingVisits: {
    name: 'Tracking Visits (Creator)',
    limit: TRACKING_VISITS_PER_HOUR,
    window: '1 h',
    prefix: 'tracking:visits',
    analytics: true,
  } satisfies RateLimitConfig,

  /** Click tracking per IP: 60/minute to prevent single-source attacks */
  trackingIpClicks: {
    name: 'Tracking Clicks (IP)',
    limit: 60,
    window: '1 m',
    prefix: 'tracking:ip:clicks',
    analytics: true,
  } satisfies RateLimitConfig,

  /** Visit tracking per IP: 120/minute to prevent single-source attacks */
  trackingIpVisits: {
    name: 'Tracking Visits (IP)',
    limit: 120,
    window: '1 m',
    prefix: 'tracking:ip:visits',
    analytics: true,
  } satisfies RateLimitConfig,

  // ---------------------------------------------------------------------------
  // Public Endpoints (In-memory only)
  // ---------------------------------------------------------------------------

  /** Public profile: 100 requests per minute per IP */
  publicProfile: {
    name: 'Public Profile',
    limit: 100,
    window: '1 m',
    prefix: 'public:profile',
    analytics: false,
  } satisfies RateLimitConfig,

  /** Public click: 50 requests per minute per IP */
  publicClick: {
    name: 'Public Click',
    limit: 50,
    window: '1 m',
    prefix: 'public:click',
    analytics: false,
  } satisfies RateLimitConfig,

  /** Public visit: 50 requests per minute per IP */
  publicVisit: {
    name: 'Public Visit',
    limit: 50,
    window: '1 m',
    prefix: 'public:visit',
    analytics: false,
  } satisfies RateLimitConfig,

  // ---------------------------------------------------------------------------
  // Health & Monitoring
  // ---------------------------------------------------------------------------

  /** Health endpoints: 30 requests per minute per IP */
  health: {
    name: 'Health',
    limit: 30,
    window: '1 m',
    prefix: 'health',
    analytics: false,
  } satisfies RateLimitConfig,

  /** General endpoints (fallback): 60 requests per minute per IP */
  general: {
    name: 'General',
    limit: 60,
    window: '1 m',
    prefix: 'general',
    analytics: false,
  } satisfies RateLimitConfig,

  // ---------------------------------------------------------------------------
  // Spotify Ingest Operations
  // ---------------------------------------------------------------------------

  /** Artist search: 30 requests per minute per user */
  spotifySearch: {
    name: 'Spotify Search',
    limit: 30,
    window: '1 m',
    prefix: 'spotify:search',
    analytics: true,
  } satisfies RateLimitConfig,

  /** Profile claim: 5 attempts per hour per user - CRITICAL for security */
  spotifyClaim: {
    name: 'Spotify Claim',
    limit: 5,
    window: '1 h',
    prefix: 'spotify:claim',
    analytics: true,
  } satisfies RateLimitConfig,

  /** Data refresh: 10 per hour per artist */
  spotifyRefresh: {
    name: 'Spotify Refresh',
    limit: 10,
    window: '1 h',
    prefix: 'spotify:refresh',
    analytics: true,
  } satisfies RateLimitConfig,

  /** Unauthenticated search (homepage): 10 per minute per IP */
  spotifyPublicSearch: {
    name: 'Spotify Public Search',
    limit: 10,
    window: '1 m',
    prefix: 'spotify:public-search',
    analytics: false,
  } satisfies RateLimitConfig,

  // ---------------------------------------------------------------------------
  // DSP Enrichment Operations
  // ---------------------------------------------------------------------------

  /** Apple Music ISRC lookup: 80 requests per minute (conservative limit for MusicKit API) */
  appleMusicLookup: {
    name: 'Apple Music Lookup',
    limit: 80,
    window: '1 m',
    prefix: 'dsp:apple-music:lookup',
    analytics: true,
  } satisfies RateLimitConfig,

  /** Apple Music bulk ISRC lookup: 20 batch requests per minute (each batch = up to 25 ISRCs) */
  appleMusicBulkIsrc: {
    name: 'Apple Music Bulk ISRC',
    limit: 20,
    window: '1 m',
    prefix: 'dsp:apple-music:bulk-isrc',
    analytics: true,
  } satisfies RateLimitConfig,

  /** Deezer lookup: 40 requests per minute (conservative limit for Deezer API) */
  deezerLookup: {
    name: 'Deezer Lookup',
    limit: 40,
    window: '1 m',
    prefix: 'dsp:deezer:lookup',
    analytics: true,
  } satisfies RateLimitConfig,

  /** MusicBrainz: 1 request per second (be respectful of free service) */
  musicBrainzLookup: {
    name: 'MusicBrainz Lookup',
    limit: 1,
    window: '1 s',
    prefix: 'dsp:musicbrainz:lookup',
    analytics: true,
  } satisfies RateLimitConfig,

  /** DSP discovery: 10 discoveries per minute per user */
  dspDiscovery: {
    name: 'DSP Discovery',
    limit: 10,
    window: '1 m',
    prefix: 'dsp:discovery',
    analytics: true,
  } satisfies RateLimitConfig,

  /** DSP enrichment: 100 enrichments per hour (global) */
  dspEnrichment: {
    name: 'DSP Enrichment',
    limit: 100,
    window: '1 h',
    prefix: 'dsp:enrichment',
    analytics: true,
  } satisfies RateLimitConfig,
} as const;

export type RateLimiterName = keyof typeof RATE_LIMITERS;

/**
 * Parse window string to milliseconds
 * Supports: '1 m' (minutes), '1 h' (hours), '1 d' (days), '1 s' (seconds)
 */
export function parseWindowToMs(window: string): number {
  const match = window.match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) {
    throw new Error(`Invalid window format: ${window}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}
