/**
 * Beacons Configuration
 *
 * Configuration constants for the Beacons.ai ingestion strategy.
 */

import type { StrategyConfig } from '../base';

/**
 * Core configuration for the Beacons.ai platform.
 */
export const BEACONS_CONFIG: StrategyConfig = {
  platformId: 'beacons',
  platformName: 'Beacons',
  canonicalHost: 'beacons.ai',
  validHosts: new Set([
    'beacons.ai',
    'www.beacons.ai',
    'beacons.page', // Alternative domain
    'www.beacons.page',
  ]),
  defaultTimeoutMs: 10000,
};

/**
 * Hosts to skip when extracting links (internal Beacons navigation).
 */
export const SKIP_HOSTS = new Set([
  'beacons.ai',
  'www.beacons.ai',
  'beacons.page',
  'www.beacons.page',
  // Beacons CDN and asset domains
  'cdn.beacons.ai',
  'assets.beacons.ai',
  'images.beacons.ai',
  'static.beacons.ai',
  // Common internal paths that might appear as links
  'app.beacons.ai',
  'dashboard.beacons.ai',
]);

/**
 * Handle validation: 1-30 chars, alphanumeric + underscores + dots.
 * Beacons allows slightly more flexible handles than Linktree.
 */
export const BEACONS_HANDLE_REGEX =
  /^[a-z0-9][a-z0-9_.]{0,28}[a-z0-9]$|^[a-z0-9]{1,2}$/;

/**
 * Patterns that indicate free tier Beacons branding.
 * Paid tier profiles have this branding removed.
 */
export const BEACONS_BRANDING_PATTERNS = [
  // Text branding patterns
  /made\s+with\s+beacons/i,
  /powered\s+by\s+beacons/i,
  /create\s+your\s+(own\s+)?beacons/i,
  /get\s+your\s+(own\s+)?beacons/i,
  /join\s+beacons/i,
  /try\s+beacons/i,
  // Footer link to Beacons home
  /href\s*=\s*["']https?:\/\/(www\.)?beacons\.ai\/?["']/i,
  // Beacons logo patterns (aria-label or alt text)
  /aria-label\s*=\s*["']beacons\s*(logo)?["']/i,
  /alt\s*=\s*["']beacons\s*(logo)?["']/i,
  // Beacons branding in class names
  /class\s*=\s*["'][^"]*beacons[-_]?branding[^"]*["']/i,
];

/**
 * Reserved paths that cannot be used as handles.
 */
export const RESERVED_PATHS = new Set([
  'login',
  'signup',
  'register',
  'dashboard',
  'settings',
  'admin',
  'api',
  'app',
  'help',
  'support',
  'about',
  'pricing',
  'features',
  'blog',
  'terms',
  'privacy',
  'contact',
  'faq',
  'creators',
  'explore',
  'search',
]);
