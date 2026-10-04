import { ARTIST_VISIBILITY_OFFER } from '@/lib/config/plan-prices';

export const VISIBILITY_AUDIT_OFFER_PATH = '/api/visibility-audit/offer';

const STRIPE_PAYMENT_LINK_HOST = 'buy.stripe.com';

export interface VisibleVisibilityAuditOffer {
  readonly visible: true;
  readonly href: string;
  readonly priceUsd: number;
  readonly label: string;
  readonly detail: string;
}

export interface HiddenVisibilityAuditOffer {
  readonly visible: false;
  readonly reason: 'flag_off' | 'payment_link_missing';
}

export type VisibilityAuditOffer =
  | VisibleVisibilityAuditOffer
  | HiddenVisibilityAuditOffer;

export function visibilityAuditPriceUsd(): number {
  return ARTIST_VISIBILITY_OFFER.pro.monthlyUsd;
}

export function visibilityAuditCreditNote(): string {
  const price = visibilityAuditPriceUsd();
  return `This $${price} audit is credited toward the first month of Artist Visibility Pro ($${price}/mo).`;
}

/**
 * Accept only an https Stripe Payment Link. Anything else fails closed so a
 * mis-set env var cannot turn the CTA into an open redirect.
 */
export function parseStripePaymentLink(
  raw: string | null | undefined
): string | null {
  if (!raw?.trim()) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.hostname !== STRIPE_PAYMENT_LINK_HOST) return null;
  if (!url.pathname || url.pathname === '/') return null;
  return url.toString();
}

export function resolveVisibilityAuditOffer(input: {
  readonly flagEnabled: boolean;
  readonly paymentLinkUrl: string | null | undefined;
}): VisibilityAuditOffer {
  if (!input.flagEnabled) {
    return { visible: false, reason: 'flag_off' };
  }
  const href = parseStripePaymentLink(input.paymentLinkUrl);
  if (!href) {
    return { visible: false, reason: 'payment_link_missing' };
  }
  const price = visibilityAuditPriceUsd();
  return {
    visible: true,
    href,
    priceUsd: price,
    label: `Digital Footprint & Visibility Audit — $${price}`,
    detail: visibilityAuditCreditNote(),
  };
}
