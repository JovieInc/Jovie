/**
 * Live offer-truth check (pure; transport injected). Compares what production
 * actually serves and what Stripe actually holds against the canonical offer.
 *
 * Verdicts: pass | fail (a real mismatch; blocks release) | unavailable (the
 * check could not run; counts toward the 3-strike alert+override policy) |
 * uncertified (something is not verifiable yet, for example no Stripe key).
 * Uncertified is never reported as pass.
 */

import { forbiddenShapeViolations } from './claims';
import { contentHash } from './hash';
import type { Offer } from './offer';

export type CheckStatus =
  | 'pass'
  | 'warn'
  | 'fail'
  | 'unavailable'
  | 'uncertified';
export type Verdict = 'pass' | 'fail' | 'unavailable' | 'uncertified';

export interface OfferSnapshot {
  readonly version: string;
  readonly hash: string;
  readonly offer: Offer;
  readonly claims: readonly { readonly id: string; readonly text: string }[];
}

export interface CheckResult {
  readonly id: string;
  readonly status: CheckStatus;
  readonly detail: string;
  readonly startedAt: string;
  readonly finishedAt: string;
}

export interface SurfaceEntry {
  readonly id: string;
  readonly kind: string;
  readonly owner: string;
  readonly verify: 'live-render' | 'live-stripe' | 'attested' | 'blocked';
  readonly route?: string;
  /** Amounts that may appear next to a cadence on this page for non-offer reasons. */
  readonly allowAmounts?: readonly {
    readonly text: string;
    readonly reason: string;
  }[];
  readonly requires?: readonly ('price.pro.amount' | 'trial.days')[];
  readonly lastVerifiedOfferHash?: string | null;
  readonly lastVerifiedAt?: string | null;
  readonly blocker?: string;
  readonly note?: string;
  /** A real, tracked mismatch that is reported as warn until `until` (YYYY-MM-DD), then fails. */
  readonly knownMismatch?: {
    readonly reason: string;
    readonly issue: string;
    readonly until: string;
  };
}

export interface FetchedText {
  readonly status: number;
  readonly body: string;
}

export interface StripeReader {
  get(path: string): Promise<{ status: number; json: unknown }>;
}

export interface LiveCheckInput {
  /** Offer facts + claims the live system must match. */
  readonly expected: OfferSnapshot;
  /** 'checkout': expected is the commit under verification (hash must equal served). 'served': expected is what production serves. */
  readonly mode: 'checkout' | 'served';
  readonly fetchText: (path: string) => Promise<FetchedText>;
  readonly stripe: StripeReader | null;
  readonly surfaces: readonly SurfaceEntry[];
  /** Offer versions accepted as served during an expand-contract price change. */
  readonly acceptServedVersions?: readonly string[];
  readonly now?: () => Date;
}

export interface OfferTruthReceipt {
  readonly schema: 'jovie.offer-truth-receipt/v1';
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly mode: 'checkout' | 'served';
  readonly offer: { readonly version: string; readonly hash: string };
  readonly verdict: Verdict;
  readonly exitCode: 0 | 1 | 2 | 3;
  readonly checks: readonly CheckResult[];
}

export const EXIT_CODE: Record<Verdict, 0 | 1 | 2 | 3> = {
  pass: 0,
  fail: 1,
  unavailable: 2,
  uncertified: 3,
};

/* ----------------------------- text helpers ----------------------------- */

export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(?:36|x24);/gi, '$')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&#x2F;|&#47;/gi, '/')
    .replace(/\s+/g, ' ')
    .trim();
}

export function jsonLdOffers(html: string): readonly Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (obj['@type'] === 'Offer') out.push(obj);
    Object.values(obj).forEach(walk);
  };
  for (const m of html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      walk(JSON.parse(m[1] ?? ''));
    } catch {
      // unparseable JSON-LD is reported by the caller via zero offers
    }
  }
  return out;
}

const CADENCE =
  /^\s*(?:\/\s?(?:mo|month|yr|year)\b|per\s+(?:month|year)\b|a\s+(?:month|year)\b|monthly|annually)/i;

/** Dollar amounts stated with a billing cadence that are not the offer price (or free). */
export function wrongRecurringAmounts(
  text: string,
  offer: Offer,
  allow: readonly { readonly text: string }[] = []
): readonly string[] {
  const proUsd = offer.plans.pro.amountCents / 100;
  const bad: string[] = [];
  for (const m of text.matchAll(/\$\s?(\d[\d,]*(?:\.\d{1,2})?)/g)) {
    const after = text.slice((m.index ?? 0) + m[0].length);
    if (!CADENCE.test(after)) continue;
    const usd = Number((m[1] ?? '').replace(/,/g, ''));
    if (usd === 0 || usd === proUsd) continue;
    const snippet = text
      .slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 16)
      .trim();
    if (allow.some(a => snippet.startsWith(a.text))) continue;
    bad.push(snippet);
  }
  return bad;
}

/** "N-day" / "N day" trial lengths that differ from the offer. */
export function wrongTrialDays(text: string, offer: Offer): readonly string[] {
  const bad: string[] = [];
  for (const m of text.matchAll(
    /(\d+)[- ]day(?:s)?\s+(?:[A-Za-z]+\s+){0,3}?trial/gi
  )) {
    if (Number(m[1]) !== offer.trial.days) bad.push(m[0]);
  }
  return bad;
}

/* ------------------------------- the check ------------------------------ */

interface Recorder {
  readonly results: CheckResult[];
  run(id: string, fn: () => Promise<[CheckStatus, string]>): Promise<void>;
}

function recorder(now: () => Date): Recorder {
  const results: CheckResult[] = [];
  return {
    results,
    async run(id, fn) {
      const startedAt = now().toISOString();
      let status: CheckStatus;
      let detail: string;
      try {
        [status, detail] = await fn();
      } catch (error) {
        status = 'unavailable';
        detail = `check could not run: ${error instanceof Error ? error.message : String(error)}`;
      }
      results.push({
        id,
        status,
        detail,
        startedAt,
        finishedAt: now().toISOString(),
      });
    },
  };
}

export function verdictOf(checks: readonly CheckResult[]): Verdict {
  if (checks.some(c => c.status === 'fail')) return 'fail';
  if (checks.some(c => c.status === 'unavailable')) return 'unavailable';
  if (checks.some(c => c.status === 'uncertified')) return 'uncertified';
  return 'pass';
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

export async function runOfferTruthCheck(
  input: LiveCheckInput
): Promise<OfferTruthReceipt> {
  const now = input.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const { expected } = input;
  const offer = expected.offer;
  const rec = recorder(now);

  // 1. Served offer snapshot.
  await rec.run('offer_endpoint', async () => {
    const res = await input.fetchText('/api/offer');
    if (res.status !== 200)
      return ['unavailable', `/api/offer returned HTTP ${res.status}`];
    const served = JSON.parse(res.body) as OfferSnapshot;
    const recomputed = contentHash({
      offer: served.offer,
      claims: served.claims,
    });
    if (recomputed !== served.hash) {
      return [
        'fail',
        `served offer hash ${served.hash} does not match its own content (${recomputed})`,
      ];
    }
    if (input.mode === 'checkout' && served.hash !== expected.hash) {
      const accepted = input.acceptServedVersions?.includes(served.version);
      return accepted
        ? [
            'warn',
            `served offer ${served.version} is in the accepted overlap window; expected ${expected.version}`,
          ]
        : [
            'fail',
            `served offer ${served.version} (${served.hash}) differs from the commit under verification ${expected.version} (${expected.hash})`,
          ];
    }
    return ['pass', `offer ${served.version} ${served.hash}`];
  });

  // 2. Listed checkout prices vs offer.
  const listedPriceIds: string[] = [];
  await rec.run('pricing_options', async () => {
    const res = await input.fetchText('/api/stripe/pricing-options');
    if (res.status !== 200)
      return ['unavailable', `pricing-options returned HTTP ${res.status}`];
    const options = (asRecord(JSON.parse(res.body)).pricingOptions ??
      []) as Record<string, unknown>[];
    const problems: string[] = [];
    for (const o of options) {
      listedPriceIds.push(String(o.priceId));
      if (String(o.currency).toLowerCase() !== offer.currency)
        problems.push(`${o.priceId} currency ${o.currency}`);
      if (o.interval !== offer.plans.pro.interval)
        problems.push(`${o.priceId} interval ${o.interval}`);
      else if (o.amount !== offer.plans.pro.amountCents)
        problems.push(
          `${o.priceId} amount ${o.amount} != ${offer.plans.pro.amountCents}`
        );
    }
    if (!options.length) problems.push('no listed checkout price');
    return problems.length
      ? ['fail', problems.join('; ')]
      : ['pass', `${options.length} listed price(s) match the offer`];
  });

  // 3. Stripe-side objects and dashboard config. Never passes without a key.
  const stripeIds = [
    'stripe_price',
    'stripe_product',
    'stripe_portal',
    'stripe_promotions',
    'stripe_tax',
  ] as const;
  if (!input.stripe) {
    for (const id of stripeIds) {
      await rec.run(id, async () => [
        'uncertified',
        'no read-only Stripe key available (STRIPE_RO_KEY); Stripe side is not verified',
      ]);
    }
  } else {
    const stripe = input.stripe;
    let productId: string | null = null;
    await rec.run('stripe_price', async () => {
      if (!listedPriceIds.length)
        return ['unavailable', 'no listed price id to verify'];
      const problems: string[] = [];
      for (const id of listedPriceIds) {
        const { status, json } = await stripe.get(
          `/v1/prices/${encodeURIComponent(id)}`
        );
        if (status !== 200)
          return ['unavailable', `Stripe price read returned HTTP ${status}`];
        const p = asRecord(json);
        const rc = asRecord(p.recurring);
        productId = typeof p.product === 'string' ? p.product : productId;
        if (p.active !== true) problems.push(`${id} inactive`);
        if (p.unit_amount !== offer.plans.pro.amountCents)
          problems.push(`${id} unit_amount ${String(p.unit_amount)}`);
        if (p.currency !== offer.currency)
          problems.push(`${id} currency ${String(p.currency)}`);
        if (
          p.type !== 'recurring' ||
          p.billing_scheme !== 'per_unit' ||
          p.transform_quantity != null
        )
          problems.push(`${id} not a plain recurring per-unit price`);
        if (
          rc.interval !== offer.plans.pro.interval ||
          rc.interval_count !== offer.plans.pro.intervalCount
        )
          problems.push(
            `${id} interval ${String(rc.interval)}x${String(rc.interval_count)}`
          );
        if (rc.usage_type !== 'licensed')
          problems.push(`${id} usage_type ${String(rc.usage_type)}`);
        const trial = rc.trial_period_days ?? null;
        const wantTrial = offer.checkout.trialPeriodDays || null;
        if (trial !== wantTrial)
          problems.push(
            `${id} price trial_period_days ${String(trial)} != ${String(wantTrial)}`
          );
      }
      return problems.length
        ? ['fail', problems.join('; ')]
        : ['pass', `${listedPriceIds.length} Stripe price(s) match the offer`];
    });
    await rec.run('stripe_product', async () => {
      if (!productId)
        return [
          'uncertified',
          'product id unknown (price check did not resolve)',
        ];
      const { status, json } = await stripe.get(
        `/v1/products/${encodeURIComponent(productId)}`
      );
      if (status !== 200)
        return ['unavailable', `Stripe product read returned HTTP ${status}`];
      const prod = asRecord(json);
      if (prod.active !== true) return ['fail', 'Pro product is inactive'];
      const others = await stripe.get(
        `/v1/prices?product=${encodeURIComponent(productId)}&active=true&limit=100`
      );
      const extra = (
        (asRecord(others.json).data ?? []) as Record<string, unknown>[]
      ).filter(p => p.unit_amount !== offer.plans.pro.amountCents);
      const notes: string[] = [];
      if (prod.name !== offer.plans.pro.displayName)
        notes.push(
          `product name "${String(prod.name)}" differs from "${offer.plans.pro.displayName}" (shown on Stripe Checkout)`
        );
      if (extra.length)
        notes.push(`${extra.length} other active price(s) on the product`);
      return notes.length
        ? ['warn', notes.join('; ')]
        : ['pass', 'product active, name matches, no stray active prices'];
    });
    await rec.run('stripe_portal', async () => {
      const { status, json } = await stripe.get(
        '/v1/billing_portal/configurations?active=true&limit=10'
      );
      if (status === 403)
        return [
          'uncertified',
          'read-only key lacks billing portal configuration read',
        ];
      if (status !== 200)
        return [
          'unavailable',
          `portal configuration read returned HTTP ${status}`,
        ];
      const configs = (asRecord(json).data ?? []) as Record<string, unknown>[];
      const def = configs.find(c => c.is_default === true) ?? configs[0];
      if (!def) return ['fail', 'no active customer-portal configuration'];
      const cancel = asRecord(asRecord(def.features).subscription_cancel);
      const wantsEndOfPeriod =
        offer.terms.cancel === 'anytime_effective_end_of_period';
      if (cancel.enabled !== true)
        return [
          'fail',
          'portal does not let customers cancel but the offer says cancel anytime',
        ];
      if (wantsEndOfPeriod && cancel.mode !== 'at_period_end')
        return [
          'fail',
          `portal cancel mode ${String(cancel.mode)}; offer says effective at end of the billing period`,
        ];
      return ['pass', `portal cancel enabled, mode ${String(cancel.mode)}`];
    });
    await rec.run('stripe_promotions', async () => {
      const { status, json } = await stripe.get(
        '/v1/promotion_codes?active=true&limit=100'
      );
      if (status === 403)
        return ['uncertified', 'read-only key lacks promotion code read'];
      if (status !== 200)
        return ['unavailable', `promotion code read returned HTTP ${status}`];
      const n = ((asRecord(json).data ?? []) as unknown[]).length;
      if (!offer.checkout.promotionCodesAllowed && n > 0)
        return [
          'fail',
          `${n} active promotion code(s) but the offer disallows them`,
        ];
      return [
        'pass',
        `${n} active promotion code(s); offer ${offer.checkout.promotionCodesAllowed ? 'allows' : 'disallows'} them`,
      ];
    });
    await rec.run('stripe_tax', async () => {
      const { status, json } = await stripe.get('/v1/tax/settings');
      if (status === 403)
        return ['uncertified', 'read-only key lacks tax settings read'];
      if (status !== 200)
        return ['unavailable', `tax settings read returned HTTP ${status}`];
      return [
        'pass',
        `tax settings status ${String(asRecord(json).status)} (offer makes no tax claim; checkout sends automatic_tax disabled)`,
      ];
    });
  }
  // 4. Rendered pages, then inventory entries that cannot be rendered.
  for (const s of input.surfaces) {
    if (s.verify === 'live-render' && s.route) {
      await rec.run(`surface:${s.id}`, async () => {
        const res = await input.fetchText(s.route as string);
        if (res.status !== 200)
          return ['unavailable', `${s.route} returned HTTP ${res.status}`];
        const text = htmlToText(res.body);
        const problems: string[] = [];
        problems.push(
          ...wrongRecurringAmounts(text, offer, s.allowAmounts).map(
            a => `wrong recurring amount "${a}"`
          )
        );
        problems.push(
          ...wrongTrialDays(text, offer).map(a => `wrong trial length "${a}"`)
        );
        problems.push(
          ...forbiddenShapeViolations(text, offer).map(
            a => `forbidden claim shape ${a}`
          )
        );
        for (const o of jsonLdOffers(res.body)) {
          if (
            o.price !== undefined &&
            !['0', String(offer.plans.pro.amountCents / 100)].includes(
              String(o.price)
            )
          )
            problems.push(`JSON-LD Offer price ${String(o.price)}`);
          if (
            o.priceCurrency !== undefined &&
            String(o.priceCurrency).toLowerCase() !== offer.currency
          )
            problems.push(`JSON-LD Offer currency ${String(o.priceCurrency)}`);
        }
        for (const r of s.requires ?? []) {
          if (
            r === 'price.pro.amount' &&
            !new RegExp(`\\$\\s?${offer.plans.pro.amountCents / 100}\\b`).test(
              text
            )
          )
            problems.push('offer price not shown');
          if (
            r === 'trial.days' &&
            offer.trial.enabled &&
            offer.trial.advertised &&
            !new RegExp(`${offer.trial.days}[- ]day`, 'i').test(text)
          )
            problems.push('trial length not shown');
        }
        if (
          problems.length &&
          s.knownMismatch &&
          now().toISOString().slice(0, 10) <= s.knownMismatch.until
        ) {
          return [
            'warn',
            `KNOWN MISMATCH (${s.knownMismatch.issue}, fix by ${s.knownMismatch.until}): ${problems.join('; ')}`,
          ];
        }
        return problems.length
          ? ['fail', problems.join('; ')]
          : ['pass', `${s.route} consistent with offer ${expected.version}`];
      });
    } else if (s.verify === 'attested') {
      await rec.run(`surface:${s.id}`, async () => {
        if (!s.lastVerifiedOfferHash)
          return [
            'uncertified',
            `never verified against the offer (owner ${s.owner})`,
          ];
        if (s.lastVerifiedOfferHash !== expected.hash)
          return [
            'fail',
            `last verified against offer ${s.lastVerifiedOfferHash}, offer is now ${expected.hash}; owner ${s.owner} must re-verify`,
          ];
        return [
          'pass',
          `verified against current offer by ${s.owner} at ${String(s.lastVerifiedAt)}`,
        ];
      });
    } else if (s.verify === 'blocked') {
      await rec.run(`surface:${s.id}`, async () => [
        'uncertified',
        `cannot be rendered yet: ${s.blocker ?? 'blocker not recorded'}`,
      ]);
    }
    // 'live-stripe' entries are covered by the stripe_* checks above.
  }

  const checks = rec.results;
  const verdict = verdictOf(checks);
  return {
    schema: 'jovie.offer-truth-receipt/v1',
    startedAt,
    finishedAt: now().toISOString(),
    mode: input.mode,
    offer: { version: expected.version, hash: expected.hash },
    verdict,
    exitCode: EXIT_CODE[verdict],
    checks,
  };
}

/** Stripe REST reader using a restricted read-only key. The key is never logged. */
export function createStripeReader(
  key: string,
  fetchImpl: typeof fetch = fetch
): StripeReader {
  return {
    async get(path) {
      const res = await fetchImpl(`https://api.stripe.com${path}`, {
        headers: { authorization: `Bearer ${key}` },
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    },
  };
}
