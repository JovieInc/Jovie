/**
 * Edge-compatible detector for unauthenticated scanner traffic.
 *
 * Background: the public profile catch-all `/[username]/[...slug]` matches any
 * path nested under a profile (used for /listen, /shop, /tour, etc). Scanners
 * regularly probe for known third-party platform paths (WordPress plugins,
 * phpMyAdmin, environment files, etc) which a Next.js application will never
 * serve. Letting those probes through wakes up the page handler, performs a
 * pointless redirect, and (more importantly) generates observability noise.
 *
 * This module returns true for paths that are unambiguously NOT legitimate
 * application routes — purely pattern-based, no allowlist required. Used in
 * the proxy middleware to issue a fast 404 before any other handling.
 *
 * Design rules:
 * - Be conservative: false positives degrade real visitors, so each pattern
 *   must be one that the Jovie app could never legitimately produce.
 * - Be fast: this runs on every request. All checks are O(path length).
 * - Be edge-compatible: no Node APIs.
 * - Be additive: callers may decide their own response code; this function
 *   only classifies.
 *
 * What this function MUST NOT do: act as a general WAF. Sophisticated probes
 * with neutral-looking paths will not match; those are handled by the existing
 * routing layer + downstream auth/RLS controls.
 */

/**
 * Path segments which signal an off-platform scanner probe. Each entry is
 * matched as a case-insensitive substring against the lowercased pathname.
 * Limit additions to patterns that are obviously not produced by Jovie.
 */
const PROBE_PATH_SUBSTRINGS: readonly string[] = [
  // WordPress (core + plugin enumeration)
  'wp-admin',
  'wp-content',
  'wp-includes',
  'wp-login',
  'wp-json',
  'wp-config',
  'xmlrpc.php',
  '/wordpress/',
  // PHP admin tools commonly probed for default creds
  'phpmyadmin',
  'phpinfo',
  '/pma/',
  '/myadmin/',
  // Environment / secrets exfil
  '/.env',
  '/.git/',
  '/.aws/',
  '/.ssh/',
  '/.htaccess',
  '/.htpasswd',
  // Backup / dump files dropped by careless ops
  '/backup.sql',
  '/database.sql',
  '/db.sql',
  '/dump.sql',
  // Common shell drop locations
  '/shell.php',
  '/cmd.php',
  '/eval.php',
  '/c99.php',
  '/r57.php',
  '/webshell',
  '/uploader.php',
  '/filemanager.php',
] as const;

/**
 * File extensions that the Jovie web app never serves dynamically. A path
 * ending in one of these is almost certainly a scanner probe (or someone
 * looking for a CMS we don't run).
 *
 * Note: static assets like `.js`, `.css`, `.png` are excluded by the Next.js
 * middleware matcher before this code runs, so they never appear here.
 */
const PROBE_EXTENSIONS: readonly string[] = [
  '.php',
  '.asp',
  '.aspx',
  '.jsp',
  '.cgi',
  '.bak',
  '.old',
  '.orig',
  '.swp',
  '.swo',
] as const;

/**
 * Returns true when `pathname` matches a known unauthenticated-scanner pattern.
 *
 * Callers should treat a true result as "drop this request quietly" — issuing
 * a 404 without invoking auth, DB lookups, or page rendering.
 *
 * @param pathname URL pathname (e.g. `/foo/wp-content/plugins/x.php`). Must
 *   start with `/`. Inputs outside that contract return false defensively.
 */
export function isMaliciousProbePath(pathname: string): boolean {
  if (typeof pathname !== 'string' || pathname.length === 0) return false;
  if (!pathname.startsWith('/')) return false;
  // Pathnames longer than 2KB are almost certainly fuzzers; reject defensively
  // without scanning the whole string.
  if (pathname.length > 2048) return true;

  const lower = pathname.toLowerCase();

  for (const needle of PROBE_PATH_SUBSTRINGS) {
    if (lower.includes(needle)) return true;
  }

  for (const ext of PROBE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }

  return false;
}

/**
 * Construct the canonical drop response for a detected probe.
 *
 * Returns 404 (not 403) to give scanners no signal that the path was
 * specifically blocked — a 404 looks like every other unknown URL on the
 * internet. `X-Robots-Tag: none` keeps these paths out of any cache or
 * indexer that might be observing.
 *
 * Body is empty to minimize bandwidth and to avoid serving any cacheable
 * content for the probe path.
 */
export function createProbeDropResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'none',
      'Content-Length': '0',
    },
  });
}
