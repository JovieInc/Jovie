import { describe, expect, it } from 'vitest';
import { buildAppShellSignInUrl } from '@/lib/auth/build-app-shell-signin-url';

describe('buildAppShellSignInUrl', () => {
  it('preserves the requested app path from the next-url header', () => {
    const url = buildAppShellSignInUrl('/app/settings/account?tab=billing');

    expect(url).toBe(
      '/signin?redirect_url=%2Fapp%2Fsettings%2Faccount%3Ftab%3Dbilling'
    );
  });

  it('falls back to the dashboard route when the header is missing', () => {
    const url = buildAppShellSignInUrl(null);

    expect(url).toBe('/signin?redirect_url=%2Fapp');
  });

  it('preserves app destinations from absolute next-url headers', () => {
    const url = buildAppShellSignInUrl(
      'https://jov.ie/app/settings/account?tab=billing'
    );

    expect(url).toBe(
      '/signin?redirect_url=%2Fapp%2Fsettings%2Faccount%3Ftab%3Dbilling'
    );
  });

  it('falls back when the next-url header is outside the app shell', () => {
    const url = buildAppShellSignInUrl('/marketing');

    expect(url).toBe('/signin?redirect_url=%2Fapp');
  });

  it('keeps normal web app shell redirects relative even when an origin is available', () => {
    const url = buildAppShellSignInUrl('/app/settings/account?tab=billing', {
      origin: 'http://localhost:3112',
    });

    expect(url).toBe(
      '/signin?redirect_url=%2Fapp%2Fsettings%2Faccount%3Ftab%3Dbilling'
    );
  });

  it('uses an absolute same-origin redirect for Electron app shell requests', () => {
    const url = buildAppShellSignInUrl('/app/chat?runtime=electron', {
      origin: 'http://localhost:3112',
    });

    expect(url).toBe(
      'http://localhost:3112/signin?redirect_url=%2Fapp%2Fchat%3Fruntime%3Delectron'
    );
  });
});
