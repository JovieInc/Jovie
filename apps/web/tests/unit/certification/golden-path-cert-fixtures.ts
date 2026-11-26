import type { CommerceDecisionSource } from '@/lib/acquisition/commerce-decision';
import type { AcquisitionEligibilityDeps } from '@/lib/acquisition/eligibility.server';
import type { FounderFunnelData } from '@/lib/admin/founder-funnel';
import { ARTIST_VISIBILITY_OFFER_CONTRACT_ID } from '@/lib/billing/offer-truth';
import type { M2RevenuePathReceipt } from '@/lib/canaries/m2-revenue-path';
import type { CanaryReport } from '@/lib/canaries/public-profile';

export const NOW = new Date('2026-11-20T06:00:00.000Z');
export const RECENT = '2026-11-20T05:55:00.000Z';
export const SHA = 'a'.repeat(40);

export const COMMERCE_REQUIREMENT_IDS = new Set([
  'selected_rail',
  'jov6258_preflight',
  'handoff_correlation',
  'payment_journey',
  'reversal',
  'commerce_canary',
]);

export function greenDeps(
  overrides: Partial<AcquisitionEligibilityDeps> = {}
): AcquisitionEligibilityDeps {
  const m2: M2RevenuePathReceipt = {
    canary: 'm2-revenue-path',
    distinctFrom: 'generic-uptime',
    finishedAt: RECENT,
    issue: 'JOV-6439',
    pass: true,
    repro: 'pnpm m2',
    runAt: RECENT,
    schemaVersion: 1,
    steps: (
      ['signed_out', 'claim', 'pro_checkout_199', 'activation'] as const
    ).map(name => ({
      durationMs: 1,
      evidence: [],
      finishedAt: RECENT,
      name,
      ok: true,
      startedAt: RECENT,
    })),
    target: 'https://jov.ie',
    totalDurationMs: 4,
  };
  const canary: CanaryReport = {
    checks: [{ durationMs: 1, name: 'ok', ok: true }],
    pass: true,
    runAt: RECENT,
    totalDurationMs: 1,
  };
  const funnel: FounderFunnelData = {
    biggestDropOffKey: 'paid',
    definitionVersion: 'founder-funnel.v2',
    errors: [],
    stages: [
      {
        conversionRate: null,
        count: 10,
        description: '',
        drillDownHref: null,
        dropOff: null,
        identifiable: false,
        key: 'accounts_created',
        label: 'Accounts',
      },
    ],
    timeRange: '30d',
  };
  const greenReceipt = () => ({
    status: 'green' as const,
    observedAt: RECENT,
    maxAgeMs: 24 * 60 * 60_000,
  });
  const commerce: CommerceDecisionSource = {
    matrixRevision: 'matrix-r7',
    decisions: [
      {
        offer: ARTIST_VISIBILITY_OFFER_CONTRACT_ID,
        channel: 'agent-handoff',
        rail: 'ordinary-web-checkout',
        accessState: 'supported',
        merchantOfRecord: 'jovie',
        evidence: {
          selectedRail: greenReceipt(),
          jov6258Preflight: greenReceipt(),
          handoffCorrelation: greenReceipt(),
          paymentJourney: greenReceipt(),
          reversal: greenReceipt(),
        },
        decisionRevision: 'decision-r4',
        canary: {
          result: 'passed',
          observedAt: RECENT,
          maxAgeMs: 24 * 60 * 60_000,
        },
        nextReevaluationTrigger: 'policy-access-price-or-geography-change',
      },
    ],
  };
  return {
    now: () => NOW,
    runRevenuePathCanary: async () => m2,
    readAuthSignupCanary: async () => canary,
    readPublicProfileCanary: async () => canary,
    readWorkflowRun: async () => ({
      status: 'observed',
      run: {
        conclusion: 'success',
        createdAt: RECENT,
        headSha: SHA,
        url: 'https://github.com/JovieInc/Jovie/actions/runs/1',
      },
    }),
    readFunnel: async () => funnel,
    readCommerceDecision: async () => commerce,
    ...overrides,
  };
}

export function fakeProdCertFetch(): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const u = new URL(String(input));
    const html = (body: string, status = 200) =>
      new Response(body, { status, headers: { 'content-type': 'text/html' } });
    if (u.pathname === '/api/health/build-info') {
      return new Response(
        JSON.stringify({ commitSha: SHA, deploymentId: 'dpl_1' })
      );
    }
    if (u.pathname === '/api/handle/check') {
      const taken = u.searchParams.get('handle') === 'tim';
      return new Response(
        JSON.stringify(
          taken ? { available: false, reason: 'taken' } : { available: true }
        )
      );
    }
    if (u.pathname === '/api/stripe/pricing-options') {
      return new Response(
        JSON.stringify({
          pricingOptions: [
            {
              description: 'Artist Presence',
              interval: 'month',
              priceId: 'price_live_12',
              amount: 1200,
              currency: 'usd',
            },
          ],
        })
      );
    }
    if (u.pathname === '/billing/success') {
      return html('<title>Billing</title><main>Checkout not confirmed</main>');
    }
    if (u.pathname === '/og.png') {
      return new Response('x', { headers: { 'content-type': 'image/png' } });
    }
    if (u.pathname === '/tim') {
      return html(
        '<title>Tim</title><h1>Tim</h1><meta property="og:image" content="/og.png"/><a href="/tim/song-1">s</a>'
      );
    }
    if (u.pathname === '/tim/song-1') {
      return html(
        '<title>Song</title><meta property="og:image" content="/og.png"/>'
      );
    }
    if (u.pathname === '/signin') {
      return html('<title>Sign in</title><input type="email" name="email"/>');
    }
    return html(
      '<title>Jovie</title><main data-testid="homepage-claim-form"><a href="/signup">Claim your profile</a></main>'
    );
  }) as typeof fetch;
}
