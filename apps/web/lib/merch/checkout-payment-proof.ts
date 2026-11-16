import type Stripe from 'stripe';
import type { MerchCard, MerchOrder } from '@/lib/db/schema/merch';
import { StripeReconciliationRequiredError } from '@/lib/stripe/webhooks/reconciliation';

/** The current physical-merch checkout is positive-priced and undiscounted.
 * Stripe's legitimate free orders require separate funded economics; their
 * status alone must not release this order's stored positive-price earnings.
 */
export function assertMerchCheckoutPaymentProof(
  session: Stripe.Checkout.Session,
  order: Pick<
    MerchOrder,
    | 'id'
    | 'creatorProfileId'
    | 'merchCardId'
    | 'currency'
    | 'stripeCheckoutSessionId'
    | 'stripePaymentIntentId'
    | 'totalCents'
    | 'subtotalCents'
    | 'shippingCents'
    | 'taxCents'
  >,
  card: Pick<MerchCard, 'id' | 'creatorProfileId'>,
  expectedPaymentStatus: 'paid' | 'unpaid' = 'paid'
): void {
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);
  const checks: Record<string, boolean> = {
    paymentStatus: session.payment_status === expectedPaymentStatus,
    mode: session.mode === 'payment',
    complete: session.status === 'complete',
    session:
      Boolean(order.stripeCheckoutSessionId) &&
      session.id === order.stripeCheckoutSessionId,
    order: session.metadata?.merch_order_id === order.id,
    card:
      session.metadata?.merch_card_id === order.merchCardId &&
      card.id === order.merchCardId,
    tenant:
      session.metadata?.profile_id === order.creatorProfileId &&
      card.creatorProfileId === order.creatorProfileId,
    currency: session.currency === order.currency.toLowerCase(),
    amount:
      Number.isSafeInteger(order.totalCents) &&
      order.totalCents > 0 &&
      Number.isSafeInteger(session.amount_total) &&
      session.amount_total === order.totalCents &&
      order.totalCents ===
        order.subtotalCents + order.shippingCents + order.taxCents,
    undiscounted: !session.total_details?.amount_discount,
    paymentIntent:
      Boolean(paymentIntentId) &&
      (!order.stripePaymentIntentId ||
        order.stripePaymentIntentId === paymentIntentId),
  };
  const mismatches = Object.keys(checks).filter(key => !checks[key]);
  if (mismatches.length === 0) return;
  throw new StripeReconciliationRequiredError(
    'merch_checkout_mismatch',
    'Merch checkout does not match the stored payment contract',
    {
      merchOrderId: order.id,
      checkoutSessionId: session.id,
      mismatches,
      expectedAmountTotal: order.totalCents,
      amountTotal: session.amount_total ?? null,
    }
  );
}
