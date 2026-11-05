/**
 * Shared HTTP probe helpers and the JOV-6920 full-cone anonymous checks for
 * the production golden-path certification. Extracted from
 * scripts/lib/prod-cert.mjs to keep that module at its company-guards size
 * baseline; prod-cert.mjs consumes these checks and re-exports
 * EXPECTED_BROWSER_CHECKS, so no consumer import path changes.
 */
/**
 * Error text that means a Next.js error page rendered instead of the surface.
 */
const ERROR_TEXT =
  /application error|something went wrong|internal server error|this page could not be found/i;

export async function get(origin, path, fetchImpl, init = {}) {
  const response = await fetchImpl(new URL(path, origin), {
    redirect: 'follow',
    headers: { 'user-agent': 'jovie-prod-cert/1 (+synthetic)' },
    ...init,
  });
  const body = await response.text();
  return { response, body };
}

export function expectOk({ response, body }, what) {
  if (response.status !== 200)
    throw new Error(`${what}: HTTP ${response.status}`);
  if (ERROR_TEXT.test(body.slice(0, 200_000)))
    throw new Error(`${what}: error text rendered`);
}
/** Canonical Pro offer truth (apps/web/lib/config/plan-prices.ts). */
const PRO_OFFER = Object.freeze({
  displayName: 'Artist Presence',
  monthlyUsd: 12,
  amountCents: 1200,
  interval: 'month',
});
/** Copy the /billing/success page renders when no payment is verified. */
const UNCONFIRMED_RETURN_COPY = [
  'Confirming checkout',
  'Checkout not confirmed',
];
const PAID_ACTIVE_MARKER = `${PRO_OFFER.displayName} is active`;
/**
 * JOV-6920 cone: landing-surface checks — the canonical claim handoff.
 * @param { origin: string, fetchImpl?: typeof fetch, run: Function } options
 */
export function coneLandingChecks({ origin, fetchImpl, run }) {
  return [
    // JOV-6920 cone: the landing surface's conversion control is the
    // canonical claim handoff, not a stale fixture (same markers the M2
    // revenue-path canary asserts).
    run('landing-claim-handoff', async () => {
      const page = await get(origin, '/', fetchImpl);
      expectOk(page, 'GET /');
      const marker = [
        'data-testid="homepage-claim-form"',
        'data-testid="homepage-primary-cta"',
        'data-testid="hero-claim-handle"',
      ].find(value => page.body.includes(value));
      if (!marker) throw new Error('GET /: no canonical claim CTA marker');
      return { summary: marker };
    }),
  ];
}
/**
 * JOV-6920 cone: claim-surface checks — dead routes, handle-preserving
 * redirects and safe failure for junk claim input.
 * @param { origin: string, fetchImpl?: typeof fetch, run: Function } options
 */
export function coneClaimChecks({ origin, fetchImpl, run }) {
  return [
    // JOV-6920 cone: /claim/start is part of the claim entry path the
    // M2 canary probes; a dead route here strands the claim handoff.
    run('claim-start-renders', async () => {
      const page = await get(origin, '/claim/start', fetchImpl);
      expectOk(page, 'GET /claim/start');
    }),
    // JOV-6920 cone: /start?handle= must keep the candidate handle
    // through any server-side redirect (founder repro 2026-10-01:
    // re-asking for known claim identity is a conversion defect).
    // Client-side state is browser-smoke scope; this pins the
    // server-side contract.
    run('start-preserves-handle', async () => {
      const handle = `prodcert-keep-${Date.now().toString(36)}`;
      const page = await get(
        origin,
        `/start?handle=${encodeURIComponent(handle)}`,
        fetchImpl
      );
      expectOk(page, 'GET /start?handle=...');
      const final = page.response.url
        ? new URL(page.response.url)
        : new URL(`/start?handle=${handle}`, origin);
      if (
        final.pathname.endsWith('/start') &&
        final.searchParams.get('handle') !== handle
      ) {
        throw new Error(
          `GET /start?handle=...: server redirect dropped the handle (landed ${final.pathname}${final.search})`
        );
      }
      return { summary: `handle preserved through ${final.pathname}` };
    }),
    // JOV-6920 cone: junk/mismatched claim input must fail safely — a
    // 200 render without error text, never a 500 or crash page.
    run('invalid-claim-input-fails-safely', async () => {
      const junk = `prodcert-junk-${Date.now().toString(36)}`;
      const page = await get(
        origin,
        `/claim?claim=1&artist=${encodeURIComponent(`@@${junk}`)}&handle=${encodeURIComponent(junk)}`,
        fetchImpl
      );
      expectOk(page, 'GET /claim?claim=1&artist=@@junk (no error page)');
    }),
  ];
}
/**
 * JOV-6920 cone: checkout-surface truth probes that need no identity and
 * create no Stripe session — the payable offer's canonical price in the
 * pricing-options API (the same evidence the M2 revenue-path canary reads)
 * and the unverified return page never rendering a paid state.
 * @param {{ origin: string, fetchImpl?: typeof fetch, run: Function }} options
 */
export function checkoutConeChecks({ origin, fetchImpl = fetch, run }) {
  return [
    run('offer-canonical-pricing', async () => {
      const { response, body } = await get(
        origin,
        '/api/stripe/pricing-options',
        fetchImpl
      );
      if (response.status !== 200)
        throw new Error(`pricing-options HTTP ${response.status}`);
      const options = JSON.parse(body);
      const pro = (Array.isArray(options) ? options : []).find(
        option =>
          option?.description === PRO_OFFER.displayName &&
          option?.interval === PRO_OFFER.interval &&
          typeof option?.priceId === 'string' &&
          option.priceId.length > 0
      );
      if (!pro)
        throw new Error(
          `no payable monthly ${PRO_OFFER.displayName} option in pricing-options`
        );
      if (pro.amount !== PRO_OFFER.amountCents || pro.currency !== 'usd') {
        throw new Error(
          `${PRO_OFFER.displayName} option is ${pro.amount} ${pro.currency}, canonical is ${PRO_OFFER.amountCents} usd`
        );
      }
      return {
        summary: `${PRO_OFFER.displayName} $${PRO_OFFER.monthlyUsd}/mo (${pro.priceId})`,
      };
    }),
    run('offer-no-contradictory-pricing', async () => {
      const { response, body } = await get(
        origin,
        '/api/stripe/pricing-options',
        fetchImpl
      );
      if (response.status !== 200)
        throw new Error(`pricing-options HTTP ${response.status}`);
      const options = JSON.parse(body);
      const monthlyPro = (Array.isArray(options) ? options : []).filter(
        option =>
          option?.description === PRO_OFFER.displayName &&
          option?.interval === PRO_OFFER.interval
      );
      const amounts = [...new Set(monthlyPro.map(option => option?.amount))];
      if (amounts.length !== 1 || amounts[0] !== PRO_OFFER.amountCents) {
        throw new Error(
          `monthly ${PRO_OFFER.displayName} amounts ${JSON.stringify(amounts)} contradict the canonical ${PRO_OFFER.amountCents}`
        );
      }
      return {
        summary: `exactly one monthly price (${amounts[0]}) across ${monthlyPro.length} option(s)`,
      };
    }),
    run('return-page-no-false-paid', async () => {
      const page = await get(origin, '/billing/success', fetchImpl);
      expectOk(page, 'GET /billing/success');
      const final = page.response.url ? new URL(page.response.url) : null;
      const leftReturnPage =
        final !== null && !final.pathname.endsWith('/billing/success');
      if (leftReturnPage) {
        // An anonymous visit bounced to auth: no paid state was rendered.
        return {
          summary: `redirected to ${final.pathname} (no paid state rendered)`,
        };
      }
      if (page.body.includes(PAID_ACTIVE_MARKER)) {
        throw new Error(
          'unauthenticated /billing/success renders an active paid plan from the return redirect alone'
        );
      }
      const unconfirmed = UNCONFIRMED_RETURN_COPY.find(copy =>
        page.body.includes(copy)
      );
      if (!unconfirmed) {
        throw new Error(
          'unauthenticated /billing/success renders neither an unconfirmed-payment state nor an auth redirect'
        );
      }
      return { summary: unconfirmed };
    }),
  ];
}
/** The browser-owned checks every surface is expected to carry. */
export const EXPECTED_BROWSER_CHECKS = Object.freeze({
  'signup-signin': ['returning-user-email-otp', 'new-user-email-otp'],
  claim: [
    'claimed-profile-owned',
    'start-chat-first-reply',
    'golden-path-preview-has-release',
  ],
  onboarding: ['dashboard-first-value', 'fresh-user-onboarding-first-value'],
  chat: ['composer-ready', 'first-reply'],
  'public-profile': [
    'owned-profile-renders-publicly',
    'profile-edit-save-readback',
  ],
  smartlink: ['click-analytics-capture'],
  checkout: ['checkout-entry-renders'],
});
