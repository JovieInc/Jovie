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
 * Regex to extract href attributes from HTML.
 */
export const HREF_REGEX = /href\s*=\s*["']([^"'#]+)["']/gi;
