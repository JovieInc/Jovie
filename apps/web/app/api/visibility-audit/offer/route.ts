import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { getAppFlagValue } from '@/lib/flags/server';
import { resolveVisibilityAuditOffer } from '@/lib/visibility-audit/offer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public offer probe. Returns the payment link only when
 * VISIBILITY_AUDIT_OFFER is on and VISIBILITY_AUDIT_PAYMENT_LINK_URL is a
 * Stripe Payment Link. Otherwise `{ visible: false }` and the CTA renders
 * nothing.
 */
export async function GET() {
  const flagEnabled = await getAppFlagValue('VISIBILITY_AUDIT_OFFER');
  const offer = resolveVisibilityAuditOffer({
    flagEnabled,
    paymentLinkUrl: env.VISIBILITY_AUDIT_PAYMENT_LINK_URL,
  });
  if (!offer.visible) {
    return NextResponse.json(
      { visible: false },
      { headers: { 'cache-control': 'private, no-store' } }
    );
  }
  return NextResponse.json(
    {
      visible: true,
      href: offer.href,
      priceUsd: offer.priceUsd,
      label: offer.label,
      detail: offer.detail,
    },
    { headers: { 'cache-control': 'private, no-store' } }
  );
}
