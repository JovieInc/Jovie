import type { Page } from '@playwright/test';

export interface BillingStatus {
  isPro: boolean;
  plan: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

type EnvBag = Readonly<Record<string, string | undefined>>;

/**
 * Bypass header for Playwright APIRequestContext calls against an exact
 * `*.vercel.app` deployment. Browser navigations get `_vercel_jwt` via
 * `primeOriginBoundVercelBypass`; `page.request` does not reliably attach that
 * cookie after the session hops to the public alias (`jov.ie`), so protected
 * deployment URLs answer with Vercel SSO HTML (HTTP 2xx) instead of the app
 * JSON — which is exactly the canary `Unexpected token '<'` failure on
 * `/api/billing/status`.
 */
export function vercelProtectionBypassHeaders(
  environment: EnvBag = process.env
): Record<string, string> {
  const secret = environment.PLAYWRIGHT_VERCEL_BYPASS_SECRET;
  if (!secret) return {};
  return { 'x-vercel-protection-bypass': secret };
}

/**
 * Parse a billing-status HTTP body. Rejects HTML/SSO soft-200s so callers
 * never treat Vercel Authentication pages as a free-tier JSON payload.
 */
export function parseBillingStatusPayload(input: {
  readonly ok: boolean;
  readonly status: number;
  readonly contentType: string;
  readonly text: string;
}): BillingStatus {
  const contentType = input.contentType.toLowerCase();
  if (!contentType.includes('application/json')) {
    throw new Error(
      `GET /api/billing/status returned non-JSON (${input.contentType || 'missing content-type'}, HTTP ${input.status}): ${input.text.slice(0, 120)}`
    );
  }
  if (!input.ok) {
    throw new Error(
      `GET /api/billing/status returned HTTP ${input.status}: ${input.text.slice(0, 200)}`
    );
  }
  return JSON.parse(input.text) as BillingStatus;
}

/**
 * True when the page has actually navigated to an http(s) URL. A Playwright
 * page that never navigated reports `about:blank`, where a relative in-page
 * fetch has no origin to resolve against and throws
 * `TypeError: Failed to parse URL` (JOV-8805).
 */
export function isNavigatedHttpPage(pageUrl: string): boolean {
  return pageUrl.startsWith('http://') || pageUrl.startsWith('https://');
}

/**
 * Fetch current billing status for the page's authenticated session.
 *
 * On a navigated page this uses in-page `fetch` (same pattern as
 * `createCheckoutSession`) so the request stays on whatever host the browser
 * actually authenticated against — usually the public `jov.ie` alias after
 * OTP — instead of Playwright `baseURL` which stays pinned to the protected
 * exact deployment URL during postdeploy.
 *
 * On a page that has NOT navigated yet (about:blank — synthetic callers
 * provision cookies via `page.request` and reset billing state before their
 * first `goto`) a relative in-page fetch cannot resolve. Route through the
 * page's own APIRequestContext instead: it shares the browser cookie jar and
 * resolves the relative path against the configured test `baseURL`.
 */
export async function getBillingStatus(page: Page): Promise<BillingStatus> {
  if (!isNavigatedHttpPage(page.url())) {
    const res = await page.request.get('/api/billing/status', {
      headers: {
        Accept: 'application/json',
        ...vercelProtectionBypassHeaders(),
      },
    });
    return parseBillingStatusPayload({
      ok: res.ok(),
      status: res.status(),
      contentType: res.headers()['content-type'] ?? '',
      text: await res.text(),
    });
  }
  const response = await page.evaluate(async () => {
    const res = await fetch('/api/billing/status', {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    return {
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get('content-type') ?? '',
      text: await res.text(),
    };
  });
  return parseBillingStatusPayload(response);
}
