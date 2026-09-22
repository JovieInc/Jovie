import { expect, test } from 'vitest';
import {
  isAllowedExternalUrl,
  isAllowedInAppUrl,
  isAllowedPublicProfilePath,
  isAllowedPublicProfileUrl,
  matchesPathPrefix,
  parseUrl,
  type UrlDispositionOptions,
} from '../src/navigation.ts';

const production = {
  appUrl: 'https://jov.ie',
  appEnv: 'production',
} as const satisfies UrlDispositionOptions;

const local = {
  appUrl: 'http://127.0.0.1:3112',
  appEnv: 'local',
} as const satisfies UrlDispositionOptions;

function url(value: string): URL {
  const parsed = parseUrl(value);
  expect(parsed, `expected parseable url: ${value}`).not.toBeNull();
  return parsed as URL;
}

test('parseUrl rejects protocol-relative and unparseable input', () => {
  expect(parseUrl('https://jov.ie/hud')).toBeInstanceOf(URL);
  expect(parseUrl('jovie://auth-return?token=x')).toBeInstanceOf(URL);
  expect(parseUrl('//evil.example/x')).toBeNull();
  expect(parseUrl('not a url')).toBeNull();
  expect(parseUrl('')).toBeNull();
});

test('matchesPathPrefix respects path segment boundaries', () => {
  expect(matchesPathPrefix('/app', '/app')).toBe(true);
  expect(matchesPathPrefix('/app/chat', '/app')).toBe(true);
  expect(matchesPathPrefix('/app/chat/threads', '/app')).toBe(true);
  expect(matchesPathPrefix('/apple', '/app')).toBe(false);
  expect(matchesPathPrefix('/ap', '/app')).toBe(false);
  expect(matchesPathPrefix('/application/app', '/app')).toBe(false);
});

test('public profile paths accept artist handles and reject reserved segments', () => {
  expect(isAllowedPublicProfilePath('/artist')).toBe(true);
  expect(isAllowedPublicProfilePath('/artist/ep')).toBe(true);
  expect(isAllowedPublicProfilePath('/a_b/ok-seg')).toBe(true);
  expect(isAllowedPublicProfilePath('/artist/a/b/c')).toBe(true);

  expect(isAllowedPublicProfilePath('/')).toBe(false);
  expect(isAllowedPublicProfilePath('/artist/a/b/c/d')).toBe(false);
  expect(isAllowedPublicProfilePath('/app/chat')).toBe(false);
  expect(isAllowedPublicProfilePath('/api/artists')).toBe(false);
  expect(isAllowedPublicProfilePath('/hud')).toBe(false);
  expect(isAllowedPublicProfilePath('/pricing')).toBe(false);
  expect(isAllowedPublicProfilePath('/ab')).toBe(false);
  expect(isAllowedPublicProfilePath('/-abc')).toBe(false);
  expect(isAllowedPublicProfilePath('/artist/bad seg')).toBe(false);
});

test('public profile urls require the app origin and a safe profile path', () => {
  expect(
    isAllowedPublicProfileUrl(url('https://jov.ie/artist'), production)
  ).toBe(true);
  expect(
    isAllowedPublicProfileUrl(url('https://jov.ie/app/chat'), production)
  ).toBe(false);
  expect(
    isAllowedPublicProfileUrl(url('https://evil.example/artist'), production)
  ).toBe(false);
  // Encoded traversal must never classify as a public profile.
  expect(
    isAllowedPublicProfileUrl(url('https://jov.ie/a%5Cb'), production)
  ).toBe(false);
});

test('in-app urls require the app origin, https, and an in-app or auth-callback prefix', () => {
  expect(isAllowedInAppUrl(url('https://jov.ie/hud'), production)).toBe(true);
  expect(isAllowedInAppUrl(url('https://jov.ie/app/chat'), production)).toBe(
    true
  );
  expect(
    isAllowedInAppUrl(url('https://jov.ie/auth/callback?x=1'), production)
  ).toBe(true);
  expect(
    isAllowedInAppUrl(url('https://jov.ie/signin/sso-callback'), production)
  ).toBe(true);

  expect(isAllowedInAppUrl(url('https://jov.ie/artist'), production)).toBe(
    false
  );
  expect(isAllowedInAppUrl(url('https://jov.ie/'), production)).toBe(false);
  expect(isAllowedInAppUrl(url('https://jov.ie/hudx'), production)).toBe(false);
  expect(isAllowedInAppUrl(url('https://evil.example/hud'), production)).toBe(
    false
  );
  expect(isAllowedInAppUrl(url('http://jov.ie/hud'), production)).toBe(false);
});

test('local environment admits http loopback and dev-sibling origins only', () => {
  expect(isAllowedInAppUrl(url('http://127.0.0.1:3112/hud'), local)).toBe(true);
  // Sibling dev-server ports on the same loopback host stay in-app.
  expect(isAllowedInAppUrl(url('http://127.0.0.1:3100/hud'), local)).toBe(true);
  // Unrelated ports and foreign hosts are not siblings.
  expect(isAllowedInAppUrl(url('http://127.0.0.1:9999/hud'), local)).toBe(
    false
  );
  expect(isAllowedInAppUrl(url('http://localhost:3112/hud'), local)).toBe(
    false
  );
  expect(isAllowedInAppUrl(url('https://jov.ie/hud'), local)).toBe(false);
});

test('external urls allow mailto, the docs origin, auth providers, and same-origin external routes', () => {
  expect(isAllowedExternalUrl(url('mailto:a@b.c'), production)).toBe(true);
  expect(
    isAllowedExternalUrl(url('https://docs.jov.ie/guide'), production)
  ).toBe(true);
  expect(
    isAllowedExternalUrl(url('http://docs.jov.ie/guide'), production)
  ).toBe(false);
  expect(
    isAllowedExternalUrl(url('https://accounts.jov.ie/sign-in'), production)
  ).toBe(true);
  expect(isAllowedExternalUrl(url('https://jov.ie/pricing'), production)).toBe(
    true
  );
  expect(isAllowedExternalUrl(url('https://jov.ie/'), production)).toBe(true);
  expect(isAllowedExternalUrl(url('https://jov.ie/hud'), production)).toBe(
    false
  );
  expect(isAllowedExternalUrl(url('https://evil.example/'), production)).toBe(
    false
  );
  expect(isAllowedExternalUrl(url('javascript:alert(1)'), production)).toBe(
    false
  );
});

test('clerk wildcard auth origin admits one https tenant label only', () => {
  expect(
    isAllowedExternalUrl(url('https://tenant.clerk.accounts.dev/'), production)
  ).toBe(true);
  expect(
    isAllowedExternalUrl(url('https://clerk.accounts.dev/'), production)
  ).toBe(false);
  expect(
    isAllowedExternalUrl(url('https://a.b.clerk.accounts.dev/'), production)
  ).toBe(false);
  expect(
    isAllowedExternalUrl(url('http://tenant.clerk.accounts.dev/'), production)
  ).toBe(false);
  expect(
    isAllowedExternalUrl(
      url('https://tenant.clerk.accounts.dev:8443/'),
      production
    )
  ).toBe(false);
});
