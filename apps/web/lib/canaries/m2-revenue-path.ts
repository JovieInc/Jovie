/**
 * M2 revenue-path canary (JOV-6439).
 *
 * Sequential money-path probe, distinct from generic uptime and the existing
 * auth / public-profile canaries:
 *   signed-out → claim → $199 Pro checkout → activation
 *
 * Shared between:
 *  - The CLI runner (`scripts/m2-revenue-path-canary.ts`)
 *  - The daily / deploy-hook GitHub Actions workflow
 *
 * Design rules:
 *  - Pure evaluation of typed HTTP evidence — no Playwright imports here.
 *  - Does not create Stripe sessions, paid subscriptions, or identities.
 *  - Each step records startedAt / finishedAt on the receipt.
 */

import { ARTIST_VISIBILITY_OFFER, toCents } from '@/lib/config/plan-prices';
import { hasServerError, isOkStatus } from './public-profile';

export const M2_REVENUE_PATH_CANARY = 'm2-revenue-path' as const;
export const M2_REVENUE_PATH_ISSUE = 'JOV-6439' as const;
export const M2_REVENUE_PATH_DISTINCT_FROM = 'generic-uptime' as const;

export const M2_PRO_MONTHLY_USD = ARTIST_VISIBILITY_OFFER.pro.monthlyUsd;
export const M2_PRO_MONTHLY_AMOUNT_CENTS = toCents(M2_PRO_MONTHLY_USD);
export const M2_PRO_PLAN_DESCRIPTION = ARTIST_VISIBILITY_OFFER.pro.displayName;

export const M2_REVENUE_PATH_STEPS = [
  'signed_out',
  'claim',
  'pro_checkout_199',
  'activation',
] as const;

export type M2RevenuePathStepName = (typeof M2_REVENUE_PATH_STEPS)[number];

export const M2_REVENUE_PATH_ROUTES = {
  signedOut: '/',
  claimPricing: '/pricing',
  claimSignup: '/signup?plan=pro&interval=month',
  pricingOptions: '/api/stripe/pricing-options',
  checkout: '/api/stripe/checkout',
  activation: '/billing/success',
  checkoutSession: '/api/billing/checkout-session',
} as const;

export const M2_SIGNED_OUT_MARKERS = [
  'data-testid="homepage-claim-form"',
  'data-testid="homepage-primary-cta"',
  'data-testid="hero-claim-handle"',
] as const;

export const M2_CLAIM_FIRST_COPY = 'Claim the profile first';
export const M2_CLAIM_PRICE_DISPLAY = `$${M2_PRO_MONTHLY_USD}`;

export const M2_ACTIVATION_MARKERS = [
  'Artist Visibility is starting',
  'Checkout not confirmed',
  'Confirming checkout',
] as const;

export const M2_CANARY_USER_AGENT =
  'Mozilla/5.0 (compatible; JovieM2RevenueCanary/1.0; +https://jov.ie)';

const DEFAULT_TIMEOUT_MS = 15_000;
const MIN_HTML_CHARS = 500;

export interface M2RevenuePathStepReceipt {
  readonly name: M2RevenuePathStepName;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly ok: boolean;
  readonly statusCode?: number;
  readonly detail?: string;
  readonly evidence: readonly string[];
}

export interface M2RevenuePathReceipt {
  readonly schemaVersion: 1;
  readonly canary: typeof M2_REVENUE_PATH_CANARY;
  readonly issue: typeof M2_REVENUE_PATH_ISSUE;
  readonly distinctFrom: typeof M2_REVENUE_PATH_DISTINCT_FROM;
  readonly target: string;
  readonly runAt: string;
  readonly finishedAt: string;
  readonly pass: boolean;
  readonly steps: readonly M2RevenuePathStepReceipt[];
  readonly totalDurationMs: number;
  readonly repro: string;
}

export interface M2PricingOption {
  readonly priceId?: string;
  readonly amount?: number;
  readonly currency?: string;
  readonly interval?: string;
  readonly description?: string;
}

export interface M2StepEvaluation {
  readonly ok: boolean;
  readonly statusCode?: number;
  readonly detail?: string;
  readonly evidence: readonly string[];
}

export interface M2RevenuePathRunnerOptions {
  readonly baseUrl: string;
  readonly now?: () => Date;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

function iso(date: Date): string {
  return date.toISOString();
}

export function normalizeCanaryBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('M2 canary base URL is required');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`M2 canary base URL is invalid: ${raw}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`M2 canary base URL must be http(s): ${raw}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error('M2 canary base URL must not include credentials');
  }
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`.replace(
    /\/+$/,
    ''
  );
}

export function buildM2RevenuePathRepro(baseUrl: string): string {
  return `pnpm --filter=@jovie/web exec tsx scripts/m2-revenue-path-canary.ts --base-url ${normalizeCanaryBaseUrl(baseUrl)}`;
}

export function findProMonthlyOption(
  options: readonly M2PricingOption[]
): M2PricingOption | undefined {
  return options.find(
    option =>
      option.description === M2_PRO_PLAN_DESCRIPTION &&
      option.amount === M2_PRO_MONTHLY_AMOUNT_CENTS &&
      option.interval === 'month' &&
      typeof option.priceId === 'string' &&
      option.priceId.length > 0
  );
}

export function evaluateSignedOutSurface(input: {
  readonly statusCode: number;
  readonly body: string;
  readonly finalUrl?: string;
}): M2StepEvaluation {
  const evidence: string[] = [`http ${input.statusCode}`];
  if (!isOkStatus(input.statusCode)) {
    return {
      ok: false,
      statusCode: input.statusCode,
      detail: `Signed-out front door returned HTTP ${input.statusCode}`,
      evidence,
    };
  }
  if (hasServerError(input.body)) {
    return {
      ok: false,
      statusCode: input.statusCode,
      detail: 'Signed-out front door body contains a server error',
      evidence,
    };
  }
  if (input.body.length < MIN_HTML_CHARS) {
    return {
      ok: false,
      statusCode: input.statusCode,
      detail: `Signed-out front door body too short (${input.body.length} chars)`,
      evidence,
    };
  }
  const marker = M2_SIGNED_OUT_MARKERS.find(value =>
    input.body.includes(value)
  );
  if (!marker) {
    return {
      ok: false,
      statusCode: input.statusCode,
      detail: 'Signed-out claim CTA marker missing',
      evidence,
    };
  }
  evidence.push(marker);
  if (input.finalUrl && /\/app(?:\/|$|\?)/.test(input.finalUrl)) {
    return {
      ok: false,
      statusCode: input.statusCode,
      detail: `Signed-out probe landed on an authenticated app URL: ${input.finalUrl}`,
      evidence,
    };
  }
  return { ok: true, statusCode: input.statusCode, evidence };
}

export function evaluateClaimSurface(input: {
  readonly pricingStatus: number;
  readonly pricingBody: string;
  readonly signupStatus: number;
  readonly signupBody: string;
}): M2StepEvaluation {
  const evidence: string[] = [
    `pricing http ${input.pricingStatus}`,
    `signup http ${input.signupStatus}`,
  ];
  if (!isOkStatus(input.pricingStatus)) {
    return {
      ok: false,
      statusCode: input.pricingStatus,
      detail: `Claim pricing surface returned HTTP ${input.pricingStatus}`,
      evidence,
    };
  }
  if (hasServerError(input.pricingBody)) {
    return {
      ok: false,
      statusCode: input.pricingStatus,
      detail: 'Claim pricing surface contains a server error',
      evidence,
    };
  }
  if (!input.pricingBody.includes(M2_CLAIM_FIRST_COPY)) {
    return {
      ok: false,
      statusCode: input.pricingStatus,
      detail: 'Pricing page is missing the claim-first handoff',
      evidence,
    };
  }
  evidence.push(M2_CLAIM_FIRST_COPY);
  if (!input.pricingBody.includes(M2_CLAIM_PRICE_DISPLAY)) {
    return {
      ok: false,
      statusCode: input.pricingStatus,
      detail: `Pricing page is missing the ${M2_CLAIM_PRICE_DISPLAY} Pro offer`,
      evidence,
    };
  }
  evidence.push(M2_CLAIM_PRICE_DISPLAY);
  if (!isOkStatus(input.signupStatus)) {
    return {
      ok: false,
      statusCode: input.signupStatus,
      detail: `Claim signup handoff returned HTTP ${input.signupStatus}`,
      evidence,
    };
  }
  if (hasServerError(input.signupBody)) {
    return {
      ok: false,
      statusCode: input.signupStatus,
      detail: 'Claim signup handoff contains a server error',
      evidence,
    };
  }
  if (input.signupBody.length < MIN_HTML_CHARS) {
    return {
      ok: false,
      statusCode: input.signupStatus,
      detail: 'Claim signup handoff body too short',
      evidence,
    };
  }
  if (!input.signupBody.includes('data-auth-shell-ready="true"')) {
    return {
      ok: false,
      statusCode: input.signupStatus,
      detail: 'Claim signup handoff is missing the ready auth shell',
      evidence,
    };
  }
  evidence.push('signup?plan=pro');
  return { ok: true, statusCode: input.pricingStatus, evidence };
}

export function evaluateProCheckout199(input: {
  readonly pricingStatus: number;
  readonly pricingBody: string;
  readonly checkoutPostStatus: number;
  readonly checkoutPostBody: string;
  readonly checkoutGetStatus: number;
}): M2StepEvaluation {
  const evidence: string[] = [
    `pricing-options http ${input.pricingStatus}`,
    `checkout POST http ${input.checkoutPostStatus}`,
    `checkout GET http ${input.checkoutGetStatus}`,
  ];
  if (input.pricingStatus !== 200) {
    return {
      ok: false,
      statusCode: input.pricingStatus,
      detail: `Pricing options returned HTTP ${input.pricingStatus}`,
      evidence,
    };
  }
  let parsed: {
    pricingOptions?: M2PricingOption[];
    options?: M2PricingOption[];
  };
  try {
    parsed = JSON.parse(input.pricingBody) as {
      pricingOptions?: M2PricingOption[];
      options?: M2PricingOption[];
    };
  } catch {
    return {
      ok: false,
      statusCode: input.pricingStatus,
      detail: 'Pricing options did not return JSON',
      evidence,
    };
  }
  const options = parsed.pricingOptions ?? parsed.options ?? [];
  const proMonthly = findProMonthlyOption(options);
  if (!proMonthly) {
    return {
      ok: false,
      statusCode: input.pricingStatus,
      detail: `Live pricing options do not include ${M2_PRO_PLAN_DESCRIPTION} at ${M2_PRO_MONTHLY_AMOUNT_CENTS} cents / month`,
      evidence,
    };
  }
  evidence.push(`${M2_PRO_PLAN_DESCRIPTION} ${M2_PRO_MONTHLY_AMOUNT_CENTS}`);
  if (input.checkoutPostStatus !== 401) {
    return {
      ok: false,
      statusCode: input.checkoutPostStatus,
      detail: `Unsigned $199 checkout POST must be 401, got HTTP ${input.checkoutPostStatus}`,
      evidence,
    };
  }
  if (!input.checkoutPostBody.toLowerCase().includes('unauthorized')) {
    return {
      ok: false,
      statusCode: input.checkoutPostStatus,
      detail: 'Unsigned checkout POST did not return an unauthorized body',
      evidence,
    };
  }
  evidence.push('checkout POST 401');
  if (input.checkoutGetStatus !== 405) {
    return {
      ok: false,
      statusCode: input.checkoutGetStatus,
      detail: `Checkout route GET must be 405, got HTTP ${input.checkoutGetStatus}`,
      evidence,
    };
  }
  evidence.push('checkout GET 405');
  return { ok: true, statusCode: input.pricingStatus, evidence };
}

export function isGatedActivationRedirect(
  location: string | null | undefined
): boolean {
  if (!location) return false;
  let parsed: URL;
  try {
    parsed = new URL(location, 'https://jov.ie');
  } catch {
    return false;
  }
  const path = parsed.pathname;
  if (path !== '/signin' && path !== '/sign-in' && path !== '/signup') {
    return false;
  }
  const redirectTo = parsed.searchParams.get('redirect_url') ?? '';
  return (
    redirectTo === '/billing/success' ||
    redirectTo.startsWith('/billing/success?')
  );
}

export function evaluateActivationSurface(input: {
  readonly successStatus: number;
  readonly successBody: string;
  readonly successLocation?: string | null;
  readonly sessionStatus: number;
}): M2StepEvaluation {
  const evidence: string[] = [
    `billing/success http ${input.successStatus}`,
    `checkout-session http ${input.sessionStatus}`,
  ];
  const gated = isGatedActivationRedirect(input.successLocation);
  const marker = M2_ACTIVATION_MARKERS.find(value =>
    input.successBody.includes(value)
  );
  if (input.successStatus >= 300 && input.successStatus < 400) {
    if (!gated) {
      return {
        ok: false,
        statusCode: input.successStatus,
        detail: `Activation redirect must keep /billing/success behind sign-in, got ${input.successLocation ?? 'no location'}`,
        evidence,
      };
    }
    evidence.push('billing/success → signin');
  } else if (isOkStatus(input.successStatus)) {
    if (hasServerError(input.successBody)) {
      return {
        ok: false,
        statusCode: input.successStatus,
        detail: 'Activation surface contains a server error',
        evidence,
      };
    }
    if (!marker) {
      return {
        ok: false,
        statusCode: input.successStatus,
        detail: 'Activation contract copy missing from /billing/success',
        evidence,
      };
    }
    evidence.push(marker);
  } else {
    return {
      ok: false,
      statusCode: input.successStatus,
      detail: `Activation surface returned HTTP ${input.successStatus}`,
      evidence,
    };
  }
  if (input.sessionStatus !== 401) {
    return {
      ok: false,
      statusCode: input.sessionStatus,
      detail: `Unsigned checkout-session GET must be 401, got HTTP ${input.sessionStatus}`,
      evidence,
    };
  }
  evidence.push('checkout-session 401');
  return { ok: true, statusCode: input.successStatus, evidence };
}

function joinUrl(baseUrl: string, path: string): string {
  return `${normalizeCanaryBaseUrl(baseUrl)}${path}`;
}

async function readResponse(response: Response): Promise<{
  status: number;
  body: string;
  finalUrl: string;
  location: string | null;
}> {
  return {
    status: response.status,
    body: await response.text(),
    finalUrl: response.url,
    location: response.headers.get('location'),
  };
}

export async function runM2RevenuePathCanary(
  options: M2RevenuePathRunnerOptions
): Promise<M2RevenuePathReceipt> {
  const baseUrl = normalizeCanaryBaseUrl(options.baseUrl);
  const now = options.now ?? (() => new Date());
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const runAtDate = now();
  const runAt = iso(runAtDate);
  const headers = {
    Accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
    'User-Agent': M2_CANARY_USER_AGENT,
    'Cache-Control': 'no-store',
  } as const;

  const request = async (
    path: string,
    init: RequestInit = {}
  ): Promise<{
    status: number;
    body: string;
    finalUrl: string;
    location: string | null;
  }> => {
    const response = await fetchImpl(joinUrl(baseUrl, path), {
      redirect: 'follow',
      ...init,
      headers: {
        ...headers,
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
    return readResponse(response);
  };

  const steps: M2RevenuePathStepReceipt[] = [];

  const record = async (
    name: M2RevenuePathStepName,
    run: () => Promise<M2StepEvaluation>
  ): Promise<void> => {
    const started = now();
    let evaluation: M2StepEvaluation;
    try {
      evaluation = await run();
    } catch (error) {
      evaluation = {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
        evidence: [],
      };
    }
    const finished = now();
    steps.push({
      name,
      startedAt: iso(started),
      finishedAt: iso(finished),
      durationMs: Math.max(0, finished.getTime() - started.getTime()),
      ok: evaluation.ok,
      statusCode: evaluation.statusCode,
      detail: evaluation.detail,
      evidence: evaluation.evidence,
    });
  };

  await record('signed_out', async () => {
    const page = await request(M2_REVENUE_PATH_ROUTES.signedOut);
    return evaluateSignedOutSurface({
      statusCode: page.status,
      body: page.body,
      finalUrl: page.finalUrl,
    });
  });

  await record('claim', async () => {
    const [pricing, signup] = await Promise.all([
      request(M2_REVENUE_PATH_ROUTES.claimPricing),
      request(M2_REVENUE_PATH_ROUTES.claimSignup),
    ]);
    return evaluateClaimSurface({
      pricingStatus: pricing.status,
      pricingBody: pricing.body,
      signupStatus: signup.status,
      signupBody: signup.body,
    });
  });

  await record('pro_checkout_199', async () => {
    const pricing = await request(M2_REVENUE_PATH_ROUTES.pricingOptions, {
      headers: { Accept: 'application/json' },
    });
    const checkoutPost = await request(M2_REVENUE_PATH_ROUTES.checkout, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        priceId: 'price_m2_revenue_path_canary_unsigned',
      }),
    });
    const checkoutGet = await request(M2_REVENUE_PATH_ROUTES.checkout, {
      headers: { Accept: 'application/json' },
    });
    return evaluateProCheckout199({
      pricingStatus: pricing.status,
      pricingBody: pricing.body,
      checkoutPostStatus: checkoutPost.status,
      checkoutPostBody: checkoutPost.body,
      checkoutGetStatus: checkoutGet.status,
    });
  });

  await record('activation', async () => {
    const [success, session] = await Promise.all([
      request(M2_REVENUE_PATH_ROUTES.activation, { redirect: 'manual' }),
      request(
        `${M2_REVENUE_PATH_ROUTES.checkoutSession}?session_id=cs_test_m2_revenue_path`,
        { headers: { Accept: 'application/json' } }
      ),
    ]);
    return evaluateActivationSurface({
      successStatus: success.status,
      successBody: success.body,
      successLocation: success.location,
      sessionStatus: session.status,
    });
  });

  const finished = now();
  return {
    schemaVersion: 1,
    canary: M2_REVENUE_PATH_CANARY,
    issue: M2_REVENUE_PATH_ISSUE,
    distinctFrom: M2_REVENUE_PATH_DISTINCT_FROM,
    target: baseUrl,
    runAt,
    finishedAt: iso(finished),
    pass: steps.every(step => step.ok),
    steps,
    totalDurationMs: Math.max(0, finished.getTime() - runAtDate.getTime()),
    repro: buildM2RevenuePathRepro(baseUrl),
  };
}

export function formatM2RevenuePathSummary(
  receipt: M2RevenuePathReceipt
): string {
  const status = receipt.pass ? 'PASS' : 'FAIL';
  const failed = receipt.steps.filter(step => !step.ok).map(step => step.name);
  const failedStr = failed.length > 0 ? ` | failed: ${failed.join(', ')}` : '';
  return `[canary/m2-revenue-path] ${status} — ${receipt.steps.length} steps in ${receipt.totalDurationMs}ms against ${receipt.target}${failedStr}`;
}
