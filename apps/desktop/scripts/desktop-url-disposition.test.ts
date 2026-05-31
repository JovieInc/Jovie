import { expect, test } from 'vitest';
import {
  getUrlDisposition,
  type UrlDisposition,
  type UrlDispositionOptions,
} from '../src/navigation.ts';

const productionPolicy = {
  appUrl: 'https://jov.ie',
  appEnv: 'production',
} as const satisfies UrlDispositionOptions;

const localPolicy = {
  appUrl: 'http://127.0.0.1:3112',
  appEnv: 'local',
} as const satisfies UrlDispositionOptions;

function assertDisposition(
  policy: UrlDispositionOptions,
  disposition: UrlDisposition,
  urls: readonly string[]
) {
  for (const url of urls) {
    expect(getUrlDisposition(url, policy), url).toBe(disposition);
  }
}

test('desktop disposition keeps authenticated app and auth callback routes in-app', () => {
  assertDisposition(productionPolicy, 'in-app', [
    'https://jov.ie/app',
    'https://jov.ie/app/chat?runtime=electron',
    'https://jov.ie/app/settings/usage',
    'https://jov.ie/desktop-auth?auth_url=https%3A%2F%2Fjov.ie%2Fsignin',
    'https://jov.ie/auth/native-complete?client=electron&state=state_123',
    'https://jov.ie/signin/sso-callback?desktop_return=%2Fapp',
    'https://jov.ie/signup/sso-callback?desktop_return=%2Fstart',
    'https://jov.ie/sso-callback?desktop_return=%2Fapp',
    'https://jov.ie/auth/callback?desktop_return=%2Fapp',
    'https://jov.ie/app/auth/callback?desktop_return=%2Fapp',
  ]);
});

test('desktop disposition does not load auth start routes directly in-app', () => {
  assertDisposition(productionPolicy, 'blocked', [
    'https://jov.ie/signin',
    'https://jov.ie/auth/start?client=electron&intent=sign_in&return_to=%2Fapp',
    'https://jov.ie/signup?desktop_return=%2Fapp',
    'https://jov.ie/sign-in',
    'https://jov.ie/sign-up',
  ]);
});

test('desktop disposition opens allowlisted public routes externally', () => {
  assertDisposition(productionPolicy, 'external', [
    'https://jov.ie/',
    'https://jov.ie/legal/privacy',
    'https://jov.ie/legal/cookies',
    'https://jov.ie/pricing',
    'https://jov.ie/blog',
    'https://jov.ie/blog/the-contact-problem',
    'https://jov.ie/about',
    'https://jov.ie/download',
    'https://jov.ie/tim',
    'https://jov.ie/tim/pay?source=qr',
    'https://jov.ie/tim/summer-tour/sounds',
    'https://jov.ie/docs/getting-started',
    'https://docs.jov.ie/getting-started',
    'mailto:support@jov.ie',
  ]);
});

test('desktop disposition blocks unsafe protocols and foreign hosts', () => {
  assertDisposition(productionPolicy, 'blocked', [
    'javascript:globalThis.evil=true',
    'file:///Users/tim/.ssh/id_rsa',
    'data:text/html,<script>alert(1)</script>',
    '//jov.ie/app',
    'https://evil.com/app',
    'https://jov.ie.evil.com/app',
    'https://docs.evil.com/getting-started',
    'http://jov.ie/app',
    'https://jov.ie/%2F%2Fevil.com',
    'https://jov.ie/__clerk/v1/client',
    'https://jov.ie/api/health',
    'https://jov.ie/App',
    'https://jov.ie/Auth',
  ]);
});

test('desktop disposition allows local app origin only when running locally', () => {
  assertDisposition(localPolicy, 'in-app', [
    'http://127.0.0.1:3112/app',
    'http://127.0.0.1:3112/signin/sso-callback?desktop_return=%2Fapp',
  ]);
  assertDisposition(localPolicy, 'external', [
    'http://127.0.0.1:3112/',
    'http://127.0.0.1:3112/pricing',
    'http://127.0.0.1:3112/tim',
  ]);
  assertDisposition(localPolicy, 'blocked', [
    'http://localhost:3112/app',
    'https://127.0.0.1:3112/app',
  ]);
});

test('desktop disposition allows Clerk auth provider origins externally (https wildcard) and blocks unsafe variants', () => {
  // Valid Clerk handoff URLs (from "Open in Browser" flows) must be external
  assertDisposition(productionPolicy, 'external', [
    'https://foo-bar.clerk.accounts.dev/sign-in?__clerk_session_id=...',
    'https://distinct-giraffe-5.clerk.accounts.dev/v1/client?__clerk_api_version=...',
    'https://clerk.accounts.dev/sign-up?redirect_url=...',
  ]);
  // Unsafe variants (wrong protocol, evil host, path tricks) remain blocked
  assertDisposition(productionPolicy, 'blocked', [
    'http://foo.clerk.accounts.dev/sign-in',
    'https://evil.com.clerk.accounts.dev/sign-in',
    'https://evilclerk.accounts.dev/sign-in',
    'https://clerk.accounts.dev.evil.com/sign-in',
    'https://jov.ie.evil.com/clerk.accounts.dev',
  ]);
});
