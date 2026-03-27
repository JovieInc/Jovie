/**
 * Linktree Configuration
 *
 * Configuration constants for the Linktree ingestion strategy.
 */

import type { StrategyConfig } from '../base';

/**
 * Core configuration for the Linktree platform.
 */
export const LINKTREE_CONFIG: StrategyConfig = {
  platformId: 'linktree',
  platformName: 'Linktree',
  canonicalHost: 'linktr.ee',
  validHosts: new Set([
    'linktr.ee',
    'www.linktr.ee',
    'linktree.com',
    'www.linktree.com',
  ]),
  defaultTimeoutMs: 10000,
};

/**
 * Hosts to skip when extracting links (internal Linktree navigation).
 */
export const SKIP_HOSTS = new Set([
  'linktr.ee',
  'www.linktr.ee',
  'linktree.com',
  'www.linktree.com',
  // Linktree CDN and asset domains
  'cdn.linktr.ee',
  'assets.linktree.com',
  'static.linktr.ee',
]);

/**
 * Handle validation: 1-30 chars, alphanumeric + underscores.
 * Linktree is more restrictive than general handles.
 */
export const LINKTREE_HANDLE_REGEX =
  /^[a-z0-9][a-z0-9_]{0,28}[a-z0-9]$|^[a-z0-9]{1,2}$/;

/**
 * Patterns that indicate free tier Linktree branding.
 * Paid tier profiles have this branding removed.
 */
export const LINKTREE_BRANDING_PATTERNS = [
  // Text branding patterns
  /made\s+with\s+linktree/i,
  /create\s+your\s+(own\s+)?linktree/i,
  /get\s+your\s+(own\s+)?linktree/i,
  /join\s+linktree/i,
  /powered\s+by\s+linktree/i,
  // Footer link to Linktree home
  /href\s*=\s*["']https?:\/\/(www\.)?linktr\.ee\/?["']/i,
  // Linktree logo SVG patterns (aria-label or alt text)
  /aria-label\s*=\s*["']linktree\s*(logo)?["']/i,
  /alt\s*=\s*["']linktree\s*(logo)?["']/i,
];

/**
 * Patterns that indicate a Linktree verification badge.
 * Verified profiles have a checkmark badge next to their name.
 * Verification requires a paid plan + identity confirmation.
 */
export const LINKTREE_VERIFICATION_PATTERNS = [
  // Aria labels for verification badge
  /aria-label\s*=\s*["']verified["']/i,
  /aria-label\s*=\s*["']verified\s+account["']/i,
  /aria-label\s*=\s*["']verified\s+badge["']/i,
  // Test IDs and data attributes used by Linktree's React components
  /data-testid\s*=\s*["'].*verified.*badge["']/i,
  /data-testid\s*=\s*["']ProfileVerifiedBadge["']/i,
  // CSS class patterns for the verification badge
  /class\s*=\s*["'][^"']*verified[_-]?badge[^"']*["']/i,
  // SVG title element for verification checkmark
  /<title[^>]*>\s*verified\s*<\/title>/i,
];

/**
 * Known platform-owned pixel IDs (not creator-owned).
 * Seeded manually, auto-refreshed by ingestion batch suppression query.
 * These are filtered out at read-time, not during detection.
 *
 * Last checked: 2026-03-27
 * Checked profiles: linktr.ee/linktree, /TikTok, /selenagomez, /Billieeilish,
 *   /shopify, /therock — all had null facebookPixelId/googleAnalyticsId/tiktokPixelId.
 * Linktree only injects fbq('init'), ttq.load(), gtag('config') with creator-
 * configured IDs. Platform-owned tracking uses separate systems (Datadog,
 * ingress endpoint, Google Ad Manager). No platform-owned pixel IDs were found;
 * Linktree's fb:app_id and GAM network code are not pixel IDs and are not
 * detected by the pixel extractor, so they are not listed here.
 */
export const SUPPRESSED_PIXEL_IDS = new Set<string>([
  // Add platform-owned pixel IDs here as they are discovered.
]);

/**
 * Regex to extract href attributes from HTML.
 */
export const HREF_REGEX = /href\s*=\s*["']([^"'#]+)["']/gi;
