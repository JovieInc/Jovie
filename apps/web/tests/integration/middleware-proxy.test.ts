import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../../proxy';

describe('middleware convention', () => {
  const projectRoot = resolve(__dirname, '..', '..');
  const proxyPath = resolve(projectRoot, 'proxy.ts');
  const middlewarePath = resolve(projectRoot, 'middleware.ts');

  it('uses proxy.ts and does not include middleware.ts', () => {
    const hasProxy = existsSync(proxyPath);
    const hasMiddleware = existsSync(middlewarePath);

    expect(hasProxy).toBe(true);
    expect(hasMiddleware).toBe(false);
  });
});

/**
 * Behavioural tests for the middleware matcher config (JOV-2236).
 *
 * The matcher pattern uses a negative lookahead to skip static assets and
 * Next.js internals. The dots in the lookahead MUST be escaped as literal dots
 * (\.) in the regex, NOT any-character (.) wildcards.
 *
 * Before JOV-2236 fix: `\.` inside a JS string literal was silently stripped
 * to just `.`, meaning `/wp-json`, `/a-css/foo`, and similar probing paths
 * bypassed middleware entirely.
 *
 * This test suite verifies:
 *  1. The matcher pattern string contains literal backslash-dot sequences (not
 *     bare dots), so the compiled regex treats them as literal dot characters.
 *  2. Dynamic/security-sensitive paths (including WordPress scanning paths) are
 *     NOT excluded — middleware runs for them.
 *  3. True static asset paths (.css, .js, .png, .json, etc.) ARE excluded —
 *     middleware correctly skips them.
 */
describe('middleware matcher — dot escape correctness (JOV-2236)', () => {
  // The first entry in config.matcher is the broad path exclusion pattern.
  const mainPattern = config.matcher[0];

  it('config.matcher is defined and non-empty', () => {
    expect(config.matcher).toBeDefined();
    expect(config.matcher.length).toBeGreaterThan(0);
  });

  it('main matcher pattern contains literal \\. (escaped dot) not bare .', () => {
    // The string at runtime must contain the two-character sequence backslash+dot
    // (i.e. the JS string has `\\.` which gives `\.` at runtime = literal dot in regex).
    // If dots are unescaped, the pattern silently degrades to wildcard matching.
    expect(mainPattern).toContain('\\.');
  });

  it('matcher pattern has \\.well-known (literal dot, not any char)', () => {
    expect(mainPattern).toContain('\\.well-known');
  });

  it('matcher pattern has .*\\. before the extension group (literal dot separator)', () => {
    // This is the critical escape: .*\\. means "any chars then literal dot"
    // so only real file extensions (foo.css) are excluded, not prefix matches (css)
    expect(mainPattern).toContain('.*\\.');
  });

  /**
   * Build a regex from the first matcher pattern and test paths against it.
   * Next.js path-matching for lookahead-based patterns is equivalent to
   * anchoring the pattern at the start, so we compile directly as a regex.
   */
  function wouldMiddlewareRun(path: string): boolean {
    // Compile the matcher pattern string directly as a regex.
    // Next.js path-matching for lookahead-based patterns is equivalent to
    // anchoring the pattern at the start: /^\/.../ so we strip the leading
    // optional slash and anchor with ^/.
    //
    // A path returns true (middleware runs) when it satisfies the outer capture
    // group, i.e. it does NOT match any of the negative-lookahead exclusions
    // (_next, monitoring, .well-known, static file extensions).
    const fullRe = new RegExp(`^\\/${mainPattern.slice(1)}`);
    return fullRe.test(path);
  }

  describe('paths that should bypass middleware (static assets / internals)', () => {
    const staticPaths = [
      '/_next/static/chunks/foo.js',
      '/_next/image?url=foo',
      '/styles.css',
      '/app.js',
      '/image.png',
      '/photo.webp',
      '/icon.svg',
      '/font.woff2',
      '/data.json',
      '/favicon.ico',
      '/manifest.webmanifest',
      '/.well-known/apple-app-site-association',
      '/.well-known/openid-configuration',
      '/monitoring',
      '/monitoring/health',
    ];

    for (const path of staticPaths) {
      it(`does NOT run middleware for ${path}`, () => {
        expect(wouldMiddlewareRun(path)).toBe(false);
      });
    }
  });

  describe('paths that MUST hit middleware (dynamic / security-sensitive)', () => {
    const dynamicPaths = [
      // WordPress probe paths — the primary regression caught by JOV-2236
      '/wp-json',
      '/wp-json/wp/v2/users',
      '/x/wp-json/wp/v2/users',
      '/wp-admin',
      '/xmlrpc.php',
      // Paths whose names start with static-looking prefixes
      '/a-css/foo',
      '/not-css',
      '/json-api',
      '/app-js/thing',
      // Normal app routes
      '/api/users',
      '/app/dashboard',
      '/app/dashboard/earnings',
      '/signin',
      '/waitlist',
      '/',
    ];

    for (const path of dynamicPaths) {
      it(`runs middleware for ${path}`, () => {
        expect(wouldMiddlewareRun(path)).toBe(true);
      });
    }
  });
});
