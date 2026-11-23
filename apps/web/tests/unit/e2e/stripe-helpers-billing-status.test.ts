import type { Page } from '@playwright/test';
import { describe, expect, it } from 'vitest';
import {
  getBillingStatus,
  isNavigatedHttpPage,
  parseBillingStatusPayload,
  vercelProtectionBypassHeaders,
} from '@/tests/e2e/helpers/billing-status';

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

describe('isNavigatedHttpPage', () => {
  it('treats an un-navigated page (about:blank) as not navigated', () => {
    expect(isNavigatedHttpPage('about:blank')).toBe(false);
  });

  it('treats http/https page URLs as navigated', () => {
    expect(isNavigatedHttpPage('http://localhost:3260/claim')).toBe(true);
    expect(isNavigatedHttpPage('https://jov.ie/billing/success')).toBe(true);
  });
});

describe('getBillingStatus request routing', () => {
  const freeStatus = {
    isPro: false,
    plan: 'free',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  };

  it('un-navigated synthetic page routes through page.request (baseURL, shared cookie jar)', async () => {
    const requested: string[] = [];
    const page = {
      url: () => 'about:blank',
      request: {
        get: async (
          url: string,
          init?: { headers?: Record<string, string> }
        ) => {
          requested.push(url);
          expect(init?.headers?.Accept).toBe('application/json');
          return {
            ok: () => true,
            status: () => 200,
            headers: () => ({ 'content-type': 'application/json' }),
            text: async () => JSON.stringify(freeStatus),
          };
        },
      },
    } as unknown as Page;
    await expect(getBillingStatus(page)).resolves.toEqual(freeStatus);
    expect(requested).toEqual(['/api/billing/status']);
  });

  it('navigated page keeps the in-page same-origin fetch (public-origin path)', async () => {
    let evaluated = 0;
    const page = {
      url: () => 'https://jov.ie/billing/success',
      evaluate: async () => {
        evaluated += 1;
        return {
          ok: true,
          status: 200,
          contentType: 'application/json',
          text: JSON.stringify(freeStatus),
        };
      },
      request: {
        get: async () => {
          throw new Error('must not use page.request on a navigated page');
        },
      },
    } as unknown as Page;
    await expect(getBillingStatus(page)).resolves.toEqual(freeStatus);
    expect(evaluated).toBe(1);
  });

  it('fail-closed: an SSO HTML soft-200 from page.request still rejects', async () => {
    const page = {
      url: () => 'about:blank',
      request: {
        get: async () => ({
          ok: () => true,
          status: () => 200,
          headers: () => ({ 'content-type': 'text/html' }),
          text: async () =>
            '<!DOCTYPE html><html><body>Protected by Vercel Authentication</body></html>',
        }),
      },
    } as unknown as Page;
    await expect(getBillingStatus(page)).rejects.toThrow(/non-JSON/);
  });
});
