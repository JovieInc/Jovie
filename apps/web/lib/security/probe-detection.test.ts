import { describe, expect, it } from 'vitest';
import {
  createProbeDropResponse,
  isMaliciousProbePath,
} from './probe-detection';

describe('isMaliciousProbePath', () => {
  describe('blocks scanner paths nested under public profile catch-all', () => {
    // This is the canonical case from JOV-2189: the public profile catch-all
    // matched a third-party path and the request reached the page handler,
    // generating an observability warning. Each path below must drop early.
    it.each([
      '/some-creator/wp-content/plugins/hellopress/wp_filemanager.php',
      '/timwhite/wp-admin/install.php',
      '/foo/wp-includes/random.php',
      '/x/wp-login.php',
      '/y/wp-json/wp/v2/users',
      '/z/wordpress/index.php',
    ])('drops %s', probe => {
      expect(isMaliciousProbePath(probe)).toBe(true);
    });
  });

  describe('blocks top-level scanner paths', () => {
    it.each([
      '/.env',
      '/.env.local',
      '/.git/config',
      '/.aws/credentials',
      '/.ssh/id_rsa',
      '/.htaccess',
      '/.htpasswd',
      '/xmlrpc.php',
      '/phpmyadmin/index.php',
      '/pma/login.php',
      '/myadmin/',
      '/wp-config.php',
    ])('drops %s', probe => {
      expect(isMaliciousProbePath(probe)).toBe(true);
    });
  });

  describe('blocks common file extensions Jovie never serves', () => {
    it.each([
      '/random.php',
      '/index.asp',
      '/login.aspx',
      '/foo.jsp',
      '/bar.cgi',
      '/config.bak',
      '/site.old',
      '/something.orig',
      '/.config.swp',
    ])('drops %s', probe => {
      expect(isMaliciousProbePath(probe)).toBe(true);
    });
  });

  describe('blocks shell drop / webshell upload paths', () => {
    it.each([
      '/profile/shell.php',
      '/handle/cmd.php',
      '/user/eval.php',
      '/x/c99.php',
      '/y/r57.php',
      '/z/webshell/index.php',
      '/q/uploader.php',
      '/q/filemanager.php',
    ])('drops %s', probe => {
      expect(isMaliciousProbePath(probe)).toBe(true);
    });
  });

  describe('blocks fuzzer-length paths', () => {
    it('drops paths longer than 2KB without scanning the whole string', () => {
      const giant = `/${'a'.repeat(2100)}`;
      expect(isMaliciousProbePath(giant)).toBe(true);
    });
  });

  describe('case-insensitive match', () => {
    it.each([
      '/Some-Creator/WP-CONTENT/plugins/hellopress/wp_filemanager.php',
      '/timwhite/WP-ADMIN/install.php',
      '/X/XMLRPC.PHP',
      '/Y/.ENV',
    ])('drops %s', probe => {
      expect(isMaliciousProbePath(probe)).toBe(true);
    });
  });

  describe('lets legitimate Jovie paths pass through', () => {
    // These are real or representative Jovie routes. None of them may match
    // the probe detector — false positives degrade real visitors.
    it.each([
      '/',
      '/timwhite',
      '/timwhite/listen',
      '/timwhite/shop',
      '/timwhite/tour',
      '/timwhite/pay',
      '/timwhite/subscribe',
      '/timwhite/notifications',
      '/timwhite/about',
      '/timwhite/contact',
      '/timwhite/claim',
      '/timwhite/releases',
      '/timwhite/listen/spotify',
      '/timwhite/shop/merch',
      '/app',
      '/app/dashboard',
      '/app/dashboard/audience',
      '/signin',
      '/signup',
      '/onboarding',
      '/onboarding/checkout',
      '/waitlist',
      '/start',
      '/account',
      '/billing',
      '/api/health',
      '/api/profiles/lookup',
      '/r/some-slug',
      '/s/abc123',
      '/changelog',
      '/blog/post-title',
      '/changelog/v25-1-0',
      '/legal/terms',
      '/legal/privacy',
      '/investor-portal',
      '/__clerk/v1/foo',
      '/clerk/v1/foo',
    ])('keeps %s', path => {
      expect(isMaliciousProbePath(path)).toBe(false);
    });
  });

  describe('defensive input handling', () => {
    it.each([
      ['', false],
      ['no-leading-slash', false],
      ['/normal', false],
    ] as const)('returns %p for input %p', (input, expected) => {
      expect(isMaliciousProbePath(input as string)).toBe(expected);
    });

    it('ignores non-string input without throwing', () => {
      // Some upstream callers may pass undefined during cold paths; the
      // detector must fail safe rather than crash the middleware.
      // @ts-expect-error — intentional bad input
      expect(isMaliciousProbePath(undefined)).toBe(false);
      // @ts-expect-error — intentional bad input
      expect(isMaliciousProbePath(null)).toBe(false);
    });
  });
});

describe('createProbeDropResponse', () => {
  it('returns 404 with empty body so scanners get no signal', async () => {
    const res = createProbeDropResponse();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('');
  });

  it('marks the response as uncacheable and unindexable', () => {
    const res = createProbeDropResponse();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Robots-Tag')).toBe('none');
    expect(res.headers.get('Content-Length')).toBe('0');
  });
});
