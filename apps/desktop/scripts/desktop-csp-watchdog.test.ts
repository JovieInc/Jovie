import { expect, test } from 'vitest';
import { evaluateTrustedOriginCspHeaders } from '../src/desktop-csp-watchdog.ts';

// A realistic Jovie app CSP (nonce'd script-src) as sent by the web app.
const REAL_CSP =
  "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
  "form-action 'self'; script-src 'self' 'nonce-abc123' 'unsafe-eval' https://clerk.jov.ie; " +
  "style-src 'self' 'unsafe-inline'";

// JOV-3835: Electron delivers response headers with the origin server's casing.
// A present CSP under a lowercase key must be detected as 'present' — otherwise
// the watchdog injects a restrictive fallback that the browser intersects with
// the real policy, blocking every nonce'd script and blanking the app.
test('detects a present CSP regardless of header-name casing', () => {
  for (const key of [
    'content-security-policy',
    'Content-Security-Policy',
    'CONTENT-SECURITY-POLICY',
  ]) {
    expect(
      evaluateTrustedOriginCspHeaders({ responseHeaders: { [key]: REAL_CSP } })
    ).toBe('present');
    // array form (Electron sometimes provides string[])
    expect(
      evaluateTrustedOriginCspHeaders({
        responseHeaders: { [key]: [REAL_CSP] },
      })
    ).toBe('present');
  }
});

test('truly missing CSP reports missing', () => {
  expect(
    evaluateTrustedOriginCspHeaders({
      responseHeaders: { 'x-other': 'v', location: '/signin' },
    })
  ).toBe('missing');
});

test('a CSP lacking a minimum shell directive is weakened', () => {
  expect(
    evaluateTrustedOriginCspHeaders({
      responseHeaders: {
        'Content-Security-Policy': "default-src 'self'; script-src 'self'",
      },
    })
  ).toBe('weakened');
});
