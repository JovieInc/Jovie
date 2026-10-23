import 'server-only';

import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';

/**
 * Operator-only: refund the first paid month of a subscription and cancel it
 * immediately. Used when an operator rejects a high-reach artist claim
 * (lib/claim/claim-verification-review.server.ts). Never called from a
 * webhook, cron or other automatic path.
 *
 * Idempotent: the refund carries a Stripe idempotency key, an existing full
 * refund is reused, and an already-canceled subscription counts as canceled.
 * The resulting `charge.refunded` and `customer.subscription.deleted`
 * webhooks revoke Pro through the existing handlers.
 */
export interface ClaimRejectionRefundResult {
  readonly refundId: string | null;
  /** Amount refunded in the smallest currency unit, null when nothing was paid. */
  readonly amount: number | null;
  readonly canceled: boolean;
}

function idOf(
  value: string | { id: string } | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

async function firstPaidInvoice(
  subscriptionId: string
): Promise<Stripe.Invoice | null> {
  const invoices = await stripe.invoices.list({
    subscription: subscriptionId,
    status: 'paid',
    limit: 100,
  });
  const paid = invoices.data.filter(invoice => (invoice.amount_paid ?? 0) > 0);
  paid.sort((a, b) => a.created - b.created);
  return paid[0] ?? null;
}

async function refundTarget(
  invoice: Stripe.Invoice
): Promise<{ payment_intent: string } | { charge: string } | null> {
  const payments = await stripe.invoicePayments.list({
    invoice: invoice.id,
    limit: 10,
  });
  for (const entry of payments.data) {
    if (entry.status !== 'paid') continue;
    const paymentIntent = idOf(entry.payment.payment_intent);
    if (paymentIntent) return { payment_intent: paymentIntent };
    const charge = idOf(entry.payment.charge);
    if (charge) return { charge };
  }
  return null;
}

function isAlreadyCanceled(error: unknown): boolean {
  const code = errorCode(error);
  return (
    code === 'resource_missing' || code === 'subscription_already_canceled'
  );
}

function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error
    ? (error as { code?: unknown }).code
    : null;
}

/** A retry after the idempotency window finds the charge already refunded. */
async function createRefundOnce(
  params: Stripe.RefundCreateParams,
  options: Stripe.RequestOptions
): Promise<Stripe.Refund | null> {
  try {
    return await stripe.refunds.create(params, options);
  } catch (error) {
    if (errorCode(error) === 'charge_already_refunded') return null;
    throw error;
  }
}

export async function refundFirstMonthAndCancel(input: {
  readonly subscriptionId: string;
  /** Stable per claim, e.g. `claim-verification-reject:<profileId>:<subscriptionId>`. */
  readonly idempotencyKey: string;
}): Promise<ClaimRejectionRefundResult> {
  const invoice = await firstPaidInvoice(input.subscriptionId);
  let refundId: string | null = null;
  let amount: number | null = null;

  if (invoice) {
    const target = await refundTarget(invoice);
    if (!target) {
      throw new Error(
        `No refundable payment found for invoice ${invoice.id} on ${input.subscriptionId}`
      );
    }
    const refund = await createRefundOnce(
      {
        ...target,
        amount: invoice.amount_paid,
        reason: 'requested_by_customer',
        metadata: {
          source: 'claim_verification_rejected',
          subscription: input.subscriptionId,
          invoice: invoice.id,
        },
      },
      { idempotencyKey: input.idempotencyKey }
    );
    refundId = refund?.id ?? null;
    amount = refund?.amount ?? invoice.amount_paid;
  }

  try {
    await stripe.subscriptions.cancel(input.subscriptionId);
  } catch (error) {
    if (!isAlreadyCanceled(error)) throw error;
  }

  return { refundId, amount, canceled: true };
}
