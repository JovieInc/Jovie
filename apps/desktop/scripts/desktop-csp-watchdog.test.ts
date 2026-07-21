import { expect, test, vi } from 'vitest';
import {
  evaluateTrustedOriginCspHeaders,
  installDesktopCspWatchdog,
} from '../src/desktop-csp-watchdog.ts';

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

// A report-only header is advisory, not enforcement. A response carrying ONLY
// `content-security-policy-report-only` runs with zero enforced CSP — exactly
// the misconfig the watchdog exists to catch — so it must read as 'missing'.
test('report-only header alone is treated as missing', () => {
  expect(
    evaluateTrustedOriginCspHeaders({
      responseHeaders: {
        'Content-Security-Policy-Report-Only': REAL_CSP,
      },
    })
  ).toBe('missing');
});

// The day the report-only policy diverges from the enforcing one, the
// enforcing header must still win — otherwise the watchdog would classify the
// response 'weakened', delete the strong enforcing header, and inject the
// nonceless shell fallback → blank app.
test('a divergent report-only policy alongside a good enforcing CSP is present', () => {
  expect(
    evaluateTrustedOriginCspHeaders({
      responseHeaders: {
        'Content-Security-Policy': REAL_CSP,
        'Content-Security-Policy-Report-Only':
          "default-src * 'unsafe-inline' 'unsafe-eval'",
      },
    })
  ).toBe('present');
});

// Redirects (and other non-2xx responses) carry no CSP header and no body.
// They must be skipped: evaluating them misclassifies every 3xx as 'missing',
// flooding security telemetry with false positives.
test('non-2xx main-frame responses are not evaluated', () => {
  let listener:
    | ((
        details: Record<string, unknown>,
        callback: (response: Record<string, unknown>) => void
      ) => void)
    | undefined;
  const fakeSession = {
    webRequest: {
      onHeadersReceived: (fn: NonNullable<typeof listener>) => {
        listener = fn;
      },
    },
  };
  const report = vi.fn();

  installDesktopCspWatchdog({
    session: fakeSession as never,
    appOrigin: 'https://staging.jov.ie',
    report,
  });

  expect(listener).toBeDefined();
  const callback = vi.fn();
  listener!(
    {
      resourceType: 'mainFrame',
      url: 'https://staging.jov.ie/signin',
      statusCode: 302,
      responseHeaders: { location: ['/'] },
    },
    callback
  );

  expect(report).not.toHaveBeenCalled();
  expect(callback).toHaveBeenCalledWith({ cancel: false });
});
