/**
 * Registered offer claims. Every user-visible sentence about price, trial,
 * billing, renewal, cancellation or limits is one of these, rendered from
 * `OFFER`. A claim that does not apply under the current offer (for example a
 * trial claim while `trial.enabled` is false) renders to `null`, so flipping
 * the offer removes the sentence everywhere at once.
 */

import { formatAmount, formatAmountNoCents } from '@/lib/utils/format-number';
import { OFFER, type Offer } from './offer';

export type ClaimId =
  | 'price.free'
  | 'price.pro'
  | 'currency'
  | 'trial.summary'
  | 'trial.no_card'
  | 'trial.ends_to_free'
  | 'trial.never_charged_automatically'
  | 'trial.includes_fan_emails'
  | 'billing.charged_at_checkout'
  | 'billing.upgrade_during_trial'
  | 'billing.renewal'
  | 'billing.cancel'
  | 'billing.cancel_short'
  | 'billing.cancel_and_refund'
  | 'billing.refund';

interface ClaimDef {
  readonly id: ClaimId;
  /** Surface families allowed to render this claim. Documentation plus test input. */
  readonly appliesTo: (offer: Offer) => boolean;
  readonly render: (offer: Offer) => string;
}

const money = (cents: number): string =>
  cents % 100 === 0 ? formatAmountNoCents(cents) : formatAmount(cents);

const trialOn = (o: Offer): boolean => o.trial.enabled;

const DEFS: readonly ClaimDef[] = [
  {
    id: 'price.free',
    appliesTo: () => true,
    render: () =>
      'Your Jovie profile stays free forever. Downgrading restores Jovie branding and keeps audience capture.',
  },
  {
    id: 'price.pro',
    appliesTo: () => true,
    render: o =>
      `${o.plans.pro.displayName} is ${money(o.plans.pro.amountCents)}/${o.plans.pro.interval === 'month' ? 'month' : 'year'}.`,
  },
  {
    id: 'currency',
    appliesTo: () => true,
    render: o => `Prices are in ${o.currency.toUpperCase()}.`,
  },
  {
    id: 'trial.summary',
    appliesTo: trialOn,
    render: o =>
      `New profiles start with a ${o.trial.days}-day ${o.plans.pro.displayName} trial.`,
  },
  {
    id: 'trial.no_card',
    appliesTo: o => trialOn(o) && !o.trial.requiresCard,
    render: () => 'No credit card needed for the trial.',
  },
  {
    id: 'trial.ends_to_free',
    appliesTo: o => trialOn(o) && o.trial.endsInto === 'free',
    render: () => 'The trial returns to Free unless you upgrade.',
  },
  {
    id: 'trial.never_charged_automatically',
    appliesTo: o => trialOn(o) && !o.trial.chargedAutomatically,
    render: () => 'You are only charged if you choose to upgrade.',
  },
  {
    id: 'trial.includes_fan_emails',
    appliesTo: trialOn,
    render: o =>
      `The trial includes up to ${o.trial.fanEmailAllowance} fan emails.`,
  },
  {
    id: 'billing.charged_at_checkout',
    appliesTo: o => o.checkout.chargedAt === 'checkout',
    render: o => `${o.plans.pro.displayName} is charged when you check out.`,
  },
  {
    id: 'billing.upgrade_during_trial',
    appliesTo: trialOn,
    render: o =>
      o.checkout.upgradeDuringTrial === 'carry_remaining_days'
        ? 'If you upgrade during your trial, billing starts when the trial would have ended.'
        : 'If you upgrade during your trial, billing starts today.',
  },
  {
    id: 'billing.renewal',
    appliesTo: o => o.terms.renewal === 'monthly_until_cancelled',
    render: () => 'Renews monthly until you cancel.',
  },
  {
    id: 'billing.cancel',
    appliesTo: o => o.terms.cancel === 'anytime_effective_end_of_period',
    render: () => 'Cancel anytime and keep Pro to the end of the paid month.',
  },
  {
    id: 'billing.cancel_short',
    appliesTo: o => o.terms.cancel === 'anytime_effective_end_of_period',
    render: () => 'Cancel anytime.',
  },
  {
    id: 'billing.cancel_and_refund',
    appliesTo: o =>
      o.terms.cancel === 'anytime_effective_end_of_period' &&
      o.terms.refund === 'none_partial_period',
    render: () =>
      'Cancel anytime, keep Pro to the end of the paid month, no partial refunds.',
  },
  {
    id: 'billing.refund',
    appliesTo: o => o.terms.refund === 'none_partial_period',
    render: () => 'No partial refunds.',
  },
];

const BY_ID = new Map<ClaimId, ClaimDef>(DEFS.map(d => [d.id, d]));

export const CLAIM_IDS: readonly ClaimId[] = DEFS.map(d => d.id);

/** Text of a registered claim, or null when it does not apply to the current offer. */
export function claim(id: ClaimId, offer: Offer = OFFER): string | null {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unregistered offer claim: ${id}`);
  return def.appliesTo(offer) ? def.render(offer) : null;
}

/** Like `claim` but throws when the claim does not apply. For surfaces that cannot omit it. */
export function requireClaim(id: ClaimId, offer: Offer = OFFER): string {
  const text = claim(id, offer);
  if (text === null) {
    throw new Error(
      `Offer claim ${id} does not apply to offer ${offer.version}`
    );
  }
  return text;
}

/** Join claims that apply, in order. Missing (not applicable) claims are skipped. */
export function claims(ids: readonly ClaimId[], offer: Offer = OFFER): string {
  return ids
    .map(id => claim(id, offer))
    .filter((t): t is string => t !== null)
    .join(' ');
}

/**
 * Account-state line for a profile that is currently trialing. Unlike the
 * registered claims it describes the viewer's own trial, so it renders even
 * when the offer stops granting new trials.
 */
export function trialStatusLine(endsLabel: string | null): string {
  return endsLabel
    ? `Your trial ends ${endsLabel}. Compare plans to keep it after that.`
    : 'Your trial is active. Compare plans to keep it after it ends.';
}

export type CloserPath = 'checkout_now' | 'free_profile';

/**
 * The chat closer. The text is tied to where the CTA leads: a checkout CTA
 * says what checkout does (charges now) and can never say "no card", because
 * the "no card" claim describes the trial path, not the checkout path.
 */
export function closerLine(
  path: CloserPath,
  ctx: { readonly trialing?: boolean } = {},
  offer: Offer = OFFER
): string {
  if (path === 'free_profile') {
    return claims(['price.free'], offer);
  }
  return claims(
    [
      'price.pro',
      'billing.charged_at_checkout',
      ...(ctx.trialing ? (['billing.upgrade_during_trial'] as const) : []),
      'billing.renewal',
      'billing.cancel',
      'billing.refund',
      'price.free',
    ],
    offer
  );
}

/** All applicable claims as `{id, text}`; the surface of truth for the live check and the LLM guard. */
export function allClaims(
  offer: Offer = OFFER
): readonly { readonly id: ClaimId; readonly text: string }[] {
  return DEFS.flatMap(d =>
    d.appliesTo(offer) ? [{ id: d.id, text: d.render(offer) }] : []
  );
}

/**
 * Prose shapes that are false under the current offer. Used by the lint and
 * the LLM output guard in addition to registered-claims-only.
 */
export const FORBIDDEN_CLAIM_SHAPES: readonly {
  readonly id: string;
  readonly pattern: RegExp;
  readonly when: (offer: Offer) => boolean;
  readonly why: string;
}[] = [
  {
    id: 'trial.auto_convert',
    pattern:
      /(?:then|after(?:\s+(?:your|the))?(?:\s+\d+-day)?\s+trial,?)\s+(?:you(?:'ll|’ll|\s+will)\s+be\s+|we(?:'ll|’ll|\s+will)\s+|it\s+(?:will\s+)?|automatically\s+)?(?:charged|billed|convert|auto-?renew)/i,
    when: o => o.trial.mechanism === 'entitlement',
    why: 'The entitlement trial never converts to a charge by itself.',
  },
  {
    id: 'trial.price_after_trial',
    pattern:
      /\$\d[\d.,]*\s*(?:\/\s?mo(?:nth)?|a\s+month|per\s+month)?\s+after\s+(?:a|the|your)\s+(?:\d+-day\s+)?trial/i,
    when: o => o.trial.mechanism === 'entitlement',
    why: 'A price "after the trial" implies automatic conversion; the entitlement trial has none.',
  },
  {
    id: 'trial.no_card_checkout',
    pattern:
      /no\s+(?:credit\s+)?card[^.]*\bcheckout\b|\bcheckout\b[^.]*no\s+(?:credit\s+)?card/i,
    when: o => o.checkout.paymentMethodCollection === 'always',
    why: 'Checkout always collects a card.',
  },
  {
    id: 'refund_or_guarantee',
    pattern: /money[- ]back|\bguarantee/i,
    when: o => o.terms.guarantee === null,
    why: 'No money-back guarantee is offered.',
  },
  {
    id: 'refund_unpublished',
    pattern: /\brefunds?\b/i,
    when: o => o.terms.refund === null,
    why: 'No refund policy is published.',
  },
  {
    id: 'refund_promise',
    pattern:
      /(?<!\bno\s)(?:full|prorated|pro-rated|partial)\s+refund|\brefund(?:s|ed)?\s+(?:within|if|after|for|on)\b|\bwe(?:'ll| will)\s+refund|\brefundable/i,
    when: o => o.terms.refund === 'none_partial_period',
    why: 'The only published refund policy is: no partial refunds. No window, full or prorated refund exists.',
  },
];

export function forbiddenShapeViolations(
  text: string,
  offer: Offer = OFFER
): readonly string[] {
  return FORBIDDEN_CLAIM_SHAPES.filter(
    s => s.when(offer) && s.pattern.test(text)
  ).map(s => s.id);
}
