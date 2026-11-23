import { describe, expect, it } from 'vitest';
import {
  canFetchRelativeInPage,
  parseBillingStatusPayload,
  vercelProtectionBypassHeaders,
} from '@/tests/e2e/helpers/billing-status';

describe('canFetchRelativeInPage', () => {
  it('rejects an un-navigated about:blank page (JOV-8806 dogfood regression)', () => {
    expect(canFetchRelativeInPage('about:blank')).toBe(false);
  });

  it('accepts http(s) origins where a relative fetch resolves', () => {
    expect(canFetchRelativeInPage('http://localhost:3260/claim')).toBe(true);
    expect(canFetchRelativeInPage('https://jov.ie/billing/success')).toBe(true);
  });
});

describe('vercelProtectionBypassHeaders', () => {
  it('returns the automation bypass header when the Playwright secret is set', () => {
    expect(
      vercelProtectionBypassHeaders({
        PLAYWRIGHT_VERCEL_BYPASS_SECRET: 'probe-secret',
      })
    ).toEqual({ 'x-vercel-protection-bypass': 'probe-secret' });
  });

  it('returns no headers when the secret is absent', () => {
    expect(vercelProtectionBypassHeaders({})).toEqual({});
  });
});

describe('parseBillingStatusPayload', () => {
  it('parses a successful JSON billing payload', () => {
    expect(
      parseBillingStatusPayload({
        ok: true,
        status: 200,
        contentType: 'application/json; charset=utf-8',
        text: JSON.stringify({
          isPro: false,
          plan: 'free',
          stripeCustomerId: null,
          stripeSubscriptionId: null,
        }),
      })
    ).toEqual({
      isPro: false,
      plan: 'free',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    });
  });

  it('rejects Vercel SSO / HTML soft-200s instead of calling JSON.parse on markup', () => {
    expect(() =>
      parseBillingStatusPayload({
        ok: true,
        status: 200,
        contentType: 'text/html; charset=utf-8',
        text: '<!DOCTYPE html><html><body>Protected by Vercel Authentication</body></html>',
      })
    ).toThrow(/non-JSON/);
  });

  it('rejects non-OK JSON with the status and body snippet', () => {
    expect(() =>
      parseBillingStatusPayload({
        ok: false,
        status: 401,
        contentType: 'application/json',
        text: '{"error":"Unauthorized"}',
      })
    ).toThrow(/HTTP 401/);
  });
});
